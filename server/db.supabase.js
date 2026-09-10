// ============================================================================
// server/db.supabase.js — Supabase (PostgreSQL) backend for the e-Student
// Management System. Drop-in data layer that mirrors server/db.js's schema but
// connects to a Supabase Postgres database via node-postgres (`pg`).
//
// WHY ASYNC: better-sqlite3 is synchronous; node-postgres is async. Every query
// helper below returns a Promise, so route handlers must be converted from
//   db.prepare(...).get/all/run(...)         →  await db.get/all/run(...)
// The helper layer keeps the SQL text identical by converting:
//   "?" placeholders  → $1, $2, …          (toPgSql)
//   datetime('now')   → now()              (used by the chat router)
//   INSERT …          → INSERT … RETURNING id  (emulates lastInsertRowid)
//
// SETUP (see also supabase/schema.sql and .env.example):
//   1. npm install pg
//   2. Supabase → Project Settings → Database → Connection string (pooler)
//   3. .env:  SUPABASE_DB_URL=postgresql://postgres.XXXX:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
//   4. Run supabase/schema.sql once in the Supabase SQL Editor (or set
//      SUPABASE_AUTO_MIGRATE=1 to have initDatabase() apply it for you).
// ============================================================================

import bcrypt from 'bcryptjs';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const connectionString =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    '[db.supabase] Missing SUPABASE_DB_URL / DATABASE_URL. ' +
      'Add it to .env (see .env.example) before starting the server.'
  );
}

export const pool = new pg.Pool({
  connectionString,
  // Keep max small: with the *session-mode* pooler (`:5432`) the whole project
  // is capped at pool_size: 15 concurrent backends. Vercel spins up a *fresh*
  // pool per cold-start instance, and several instances booting at once can
  // exhaust the session cap (→ EMAXCONNSESSION). Keep `max` small so the first
  // request of a cold start gets a connection promptly instead of queuing.
  //
  // If you switch to the *transaction-mode* pooler (`:6543`) — recommended for
  // Vercel/serverless, see .env.example — the cap is far higher and this pool
  // still works identically: node-postgres checks out a connection per query,
  // which matches the transaction pooler, and the `transaction()` helper pins a
  // single backend via BEGIN/COMMIT as expected. No behavior change needed.
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Supabase's connection-pooler uses a proxy cert, so rejectUnauthorized:false.
  // Use SUPABASE_SSL=false only for local/trusted network direct connections.
  ssl: process.env.SUPABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

// node-postgres returns COUNT(*)/BIGINT ids as strings by default; this app
// treats ids/counts as numbers everywhere, so parse INT8 → Number. (Safe here:
// ids stay far below Number.MAX_SAFE_INTEGER.)
pg.types.setTypeParser(pg.types.builtins.INT8, v => (v === null ? null : parseInt(v, 10)));

// ─────────────────────────────────────────────────────────────────────────────
// SQLite → PostgreSQL statement converter
// ─────────────────────────────────────────────────────────────────────────────
export function toPgSql(sql) {
  let i = 1;
  return String(sql)
    // SQLite's datetime('now') util function → PG now()::text (returns text)
    .replace(/datetime\s*\(\s*'now'\s*\)/gi, "now()::text")
    // "?" positional placeholders → $1, $2, … (in order of appearance)
    .replace(/\?/g, () => `$${i++}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers (all async)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Row "camelizer" — Postgres folds unquoted identifiers to lowercase, so a
// column declared as `fullName` arrives as `fullname` in result rows. The Node
// app reads those as camelCase properties (row.fullName, row.studentId, …).
// camelizeRow() maps every lowercase column back to its camelCase JS key so the
// rest of the (backend + frontend) code works unchanged, exactly like SQLite.
// Single-word columns (id, name, status, role, …) are already correct.
// NOTE: chat_messages.userName becomes `username` in Postgres → mapped to
// `userName`; users.username is a single word and should STAY `username`.
// ─────────────────────────────────────────────────────────────────────────────
const CAMEL_OVERRIDES = {
  fullname: 'fullName',
  classname: 'className',
  registrationdate: 'registrationDate',
  linkedstudentid: 'linkedStudentId',
  crforclass: 'crForClass',
  manageallclasses: 'manageAllClasses',
  linkedteacherid: 'linkedTeacherId',
  rollno: 'rollNo',
  dateofbirth: 'dateOfBirth',
  admissiondate: 'admissionDate',
  iscr: 'isCR',
  linkeduserid: 'linkedUserId',
  joiningdate: 'joiningDate',
  studentid: 'studentId',
  studentname: 'studentName',
  examtype: 'examType',
  photourl: 'photoUrl',
  photomime: 'photoMime',
  cardstatus: 'cardStatus',
  reviewnote: 'reviewNote',
  reviewedby: 'reviewedBy',
  issuedat: 'issuedAt',
  updatedat: 'updatedAt',
  teachername: 'teacherName',
  userid: 'userId',
  // NOTE: `username` is intentionally NOT mapped to `userName` here — users.username
  // must stay `username`. chat_messages.userName is disambiguated via explicit
  // quoted SQL aliases in chat.js (see SELECT .. AS "userName").
  userrole: 'userRole',
  createdat: 'createdAt',
  createdby: 'createdBy',
  periodindex: 'periodIndex',
  markedat: 'markedAt',
  scheduleddate: 'scheduledDate',
  distancefromcenter: 'distanceFromCenter',
  approvedby: 'approvedBy',
  approvedat: 'approvedAt',
  cardid: 'cardId',
  rightkey: 'rightKey',
};

function camelizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const lk = k.toLowerCase();
    out[CAMEL_OVERRIDES[lk] || k] = v;
  }
  return out;
}

const camelizeRows = rows => (Array.isArray(rows) ? rows.map(camelizeRow) : rows);

// Connection-saturation / transient network errors that are safe to retry with
// a short backoff. These fail BEFORE the statement is executed (pooler refusal,
// handshake timeout, socket reset), so retrying cannot duplicate an INSERT.
// Query-level errors (constraint violations, syntax errors, …) are NOT retried.
function isTransientConnectionError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  const code = err.code || '';
  return (
    msg.includes('EMAXCONNSESSION') ||            // Supabase session-pooler at capacity
    msg.includes('timeout exceeded when trying to connect') ||
    msg.includes('Connection terminated') ||
    msg.includes('connection refused') ||
    msg.includes('connect ETIMEDOUT') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('53300') ||                       // too_many_connections (Postgres)
    msg.includes('too many clients') ||
    code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE'
  );
}

/** Run `fn` with up to `attempts` tries on transient connection errors. */
async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientConnectionError(err) || i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, 150 * (i + 1))); // 150ms, 300ms backoff
    }
  }
  throw lastErr;
}

/** Low-level query — returns the full pg result ({ rows, rowCount, … }). */
export async function query(text, params = []) {
  const sql = toPgSql(text);
  return withRetry(async () => {
    const res = await pool.query(sql, params);
    res.rows = camelizeRows(res.rows);
    return res;
  });
}

/** All rows as an array of plain objects. */
export async function all(text, params = []) {
  const sql = toPgSql(text);
  return withRetry(async () => camelizeRows((await pool.query(sql, params)).rows));
}

/** First row or undefined (same as better-sqlite3's stmt.get()). */
export async function get(text, params = []) {
  const sql = toPgSql(text);
  return withRetry(async () => camelizeRow((await pool.query(sql, params)).rows[0]));
}

/** Execute INSERT/UPDATE/DELETE — returns { changes, lastInsertRowid }.
 *  INSERTs get " RETURNING *" so lastInsertRowid works like in SQLite.
 *  Using * instead of id handles tables with composite PKs (no id column). */
export async function run(text, params = []) {
  const trimmed = String(text).trim().replace(/;\s*$/, '');
  const sql = toPgSql(trimmed);
  const isInsert = /^\s*insert\b/i.test(sql);
  const hasReturning = /\breturning\b/i.test(sql);
  const finalSql = isInsert && !hasReturning ? `${sql} RETURNING *` : sql;
  return withRetry(async () => {
    const res = await pool.query(finalSql, params);
    const rows = res.rows || [];
    const lastRow = rows[rows.length - 1];
    return {
      changes: res.rowCount ?? 0,
      lastInsertRowid: isInsert && rows.length && lastRow?.id != null ? Number(lastRow.id) : 0,
    };
  });
}

/** Run one or more ;-separated statements (DDL / deletes, no params). */
export async function exec(text) {
  const statements = String(text)
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await withRetry(() => pool.query(stmt));
  }
  return { changes: statements.length };
}
/**
 * Async transaction wrapper.
 *   const bulkInsert = db.transaction(async ({ run, get }) => {
 *     await run('INSERT INTO students (...) VALUES (?, …)', values);
 *     return get('SELECT * FROM students WHERE id = ?', [id]);
 *   });
 *   const inserted = await bulkInsert();
 * Callbacks receive a bound helper ({ query, all, get, run }) that executes on
 * the SAME connection, so all queries share one transaction (BEGIN/COMMIT).
 */
export function transaction(fn) {
  return async (...args) => {
    // Retry only the connect step (pooler saturation happens before BEGIN);
    // once the transaction has started, a failure must propagate as-is.
    const client = await withRetry(() => pool.connect());
    const bind = {
      query: (s, p = []) => client.query(toPgSql(s), p).then(r => { r.rows = camelizeRows(r.rows); return r; }),
      all: async (s, p = []) => camelizeRows((await client.query(toPgSql(s), p)).rows),
      get: async (s, p = []) => camelizeRow((await client.query(toPgSql(s), p)).rows[0]),
      run: async (s, p = []) => {
        const trimmed = String(s).trim().replace(/;\s*$/, '');
        const sql = toPgSql(trimmed);
        const isInsert = /^\s*insert\b/i.test(sql);
        const hasReturning = /\breturning\b/i.test(sql);
        const finalSql = isInsert && !hasReturning ? `${sql} RETURNING *` : sql;
        const res = await client.query(finalSql, p);
        const rows = res.rows || [];
        const lastRow = rows[rows.length - 1];
        return {
          changes: res.rowCount ?? 0,
          lastInsertRowid: isInsert && rows.length && lastRow?.id != null ? Number(lastRow.id) : 0,
        };
      },
    };
    try {
      await client.query('BEGIN');
      const value = await fn(bind, ...args);
      await client.query('COMMIT');
      return value;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* already broken */ }
      throw err;
    } finally {
      client.release();
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema bootstrapping — applies supabase/schema.sql (idempotent)
// ─────────────────────────────────────────────────────────────────────────────
export async function initDatabase() {
  // Recommended: run supabase/schema.sql once in the Supabase SQL Editor.
  // For auto-migrate on boot, set SUPABASE_AUTO_MIGRATE=1.
  if (process.env.SUPABASE_AUTO_MIGRATE !== '1') {
    console.log('[db.supabase] Skipping auto-migrate (set SUPABASE_AUTO_MIGRATE=1 to enable).');
    return;
  }
  const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.warn('[db.supabase] supabase/schema.sql not found — run the schema manually in the SQL Editor.');
    return;
  }
  console.log('[db.supabase] Applying supabase/schema.sql …');
  await exec(fs.readFileSync(schemaPath, 'utf8'));
  console.log('[db.supabase] Schema ready.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeding — port of db.js seedDatabase() using the async helpers above.
// Seeds only when the users table is empty (same guard as the SQLite version).
// ─────────────────────────────────────────────────────────────────────────────
export async function seedDatabase() {
  const cnt = (await get('SELECT COUNT(*) AS c FROM users')).c;
  if (cnt > 0) return;
  const h = pw => bcrypt.hashSync(pw, 10);
  const now = new Date().toISOString().slice(0, 10);

  const iU = 'INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate) VALUES (?,?,?,?,?,?,?,?)';
  await run(iU, ['admin', 'admin@ncba.edu.pk', h('admin123'), 'System Administrator', 'super_admin', 'approved', null, now]);
  await run(iU, ['cr.admin', 'cr@ncba.edu.pk', h('cr123'), 'Class Representative', 'cr_admin', 'approved', 'BSCS', now]);
  await run(iU, ['teacher.admin', 'teacher@ncba.edu.pk', h('teacher123'), 'Professor Admin', 'teacher_admin', 'approved', null, now]);
  await run(iU, ['ahmed.khan', 'ahmed.khan@ncba.edu.pk', h('student123'), 'Ahmed Khan', 'student', 'pending', 'BSCS', now]);

  await seedStudents();
  await seedTeachers();
  await seedSubjects();
  await seedClasses();
  await seedMarks();
  await seedClassSchedules();
  await seedAttendanceRecords();
  console.log('Database seeded (Supabase)');
}

async function seedStudents() {
  const iS = 'INSERT INTO students (name,email,phone,rollNo,className,gender,address,dateOfBirth,admissionDate,status,isCR) VALUES (?,?,?,?,?,?,?,?,?,?,?)';
  const rows = [
    ['Ahmed Khan', 'ahmed.khan@school.edu', '+91 98765 43210', 'STU-001', 'BSCS', 'Male', '12 Main St Mumbai', '2009-05-15', '2020-06-01', 'Active', 1],
    ['Priya Sharma', 'priya.sharma@school.edu', '+91 91234 56789', 'STU-002', 'BSCS', 'Female', '45 Park Ave Delhi', '2009-08-22', '2020-06-01', 'Active', 0],
    ['Rahul Verma', 'rahul.verma@school.edu', '+91 99887 76655', 'STU-003', 'BSIT', 'Male', '78 Lake View Bangalore', '2009-01-10', '2020-06-01', 'Active', 1],
    ['Sneha Patel', 'sneha.patel@school.edu', '+91 98776 55443', 'STU-004', 'BSIT', 'Female', '234 River St Ahmedabad', '2008-12-05', '2020-06-01', 'Active', 0],
    ['Arjun Singh', 'arjun.singh@school.edu', '+91 96543 21098', 'STU-005', 'BBA', 'Male', '56 Hill View Jaipur', '2010-03-18', '2021-06-01', 'Active', 1],
    ['Fatima Sheikh', 'fatima.sheikh@school.edu', '+91 90099 88776', 'STU-006', 'BBA', 'Female', '89 Rose Garden Hyderabad', '2010-07-30', '2021-06-01', 'Active', 0],
    ['Vikram Mehta', 'vikram.mehta@school.edu', '+91 87654 32109', 'STU-007', 'BSAF', 'Male', '123 Green Park Pune', '2009-11-25', '2021-06-01', 'Inactive', 1],
    ['Ananya Gupta', 'ananya.gupta@school.edu', '+91 94455 66778', 'STU-008', 'BSCS', 'Female', '678 Sunny St Lucknow', '2009-04-12', '2020-06-01', 'Active', 0],
    ['Rohan Joshi', 'rohan.joshi@school.edu', '+91 93322 11009', 'STU-009', 'BSIT', 'Male', '34 Mountain View Nashik', '2008-09-08', '2020-06-01', 'Active', 0],
    ['Kavya Nair', 'kavya.nair@school.edu', '+91 91122 33445', 'STU-010', 'BSAF', 'Female', '567 Marine Drive Kochi', '2010-02-20', '2021-06-01', 'Active', 0],
  ];
  for (const r of rows) await run(iS, r);
}

async function seedTeachers() {
  const iT = 'INSERT INTO teachers (name,email,phone,subject,qualification,experience,className,joiningDate) VALUES (?,?,?,?,?,?,?,?)';
  const rows = [
    ['Dr. Rajesh Kumar', 'rajesh.kumar@school.edu', '+91 98765 43211', 'Mathematics', 'Ph.D. Mathematics', '15 years', 'BSCS', '2018-06-01'],
    ['Prof. Sneha Iyer', 'sneha.iyer@school.edu', '+91 98765 43212', 'Physics', 'M.Sc. Physics', '10 years', 'BSIT', '2019-01-15'],
    ['Dr. Amit Patel', 'amit.patel@school.edu', '+91 98765 43213', 'Chemistry', 'Ph.D. Chemistry', '12 years', 'BBA', '2018-08-01'],
    ['Ms. Priya Desai', 'priya.desai@school.edu', '+91 98765 43214', 'English', 'M.A. English', '8 years', 'BSCS', '2020-01-10'],
    ['Mr. Vikram Singh', 'vikram.singh@school.edu', '+91 98765 43215', 'Computer Science', 'M.Tech CS', '6 years', 'BSIT', '2021-06-01'],
    ['Dr. Neha Sharma', 'neha.sharma@school.edu', '+91 98765 43216', 'Biology', 'Ph.D. Biology', '9 years', 'BSAF', '2019-08-15'],
  ];
  for (const r of rows) await run(iT, r);
}

async function seedSubjects() {
  const iSub = 'INSERT INTO subjects (name,code,teacher,credits,className) VALUES (?,?,?,?,?)';
  const rows = [
    ['Mathematics', 'MATH-101', 'Dr. Rajesh Kumar', 4, 'BSCS'],
    ['Physics', 'PHY-101', 'Prof. Sneha Iyer', 4, 'BSCS'],
    ['Chemistry', 'CHEM-101', 'Dr. Amit Patel', 3, 'BSCS'],
    ['English', 'ENG-101', 'Ms. Priya Desai', 3, 'BSCS'],
    ['Computer Science', 'CS-101', 'Mr. Vikram Singh', 4, 'BSIT'],
    ['Biology', 'BIO-101', 'Dr. Neha Sharma', 3, 'BSAF'],
  ];
  for (const r of rows) await run(iSub, r);
}

async function seedClasses() {
  const iC = 'INSERT INTO classes (name,code,description,semester) VALUES (?,?,?,?)';
  const rows = [
    ['BSCS', 'BSCS', 'Bachelor of Science in Computer Science', '3rd'],
    ['BSIT', 'BSIT', 'Bachelor of Science in Information Technology', '3rd'],
    ['BBA', 'BBA', 'Bachelor of Business Administration', '2nd'],
    ['BSAF', 'BSAF', 'Bachelor of Science in Accounting & Finance', '3rd'],
  ];
  for (const r of rows) await run(iC, r);
}

async function seedMarks() {
  const iM = 'INSERT INTO marks (studentId,studentName,subject,marks,grade,examType) VALUES (?,?,?,?,?,?)';
  // Semester scheme: Assignment(10) + Attendance(5) + Quiz(15) + Mid(30) + Final(40) = 100
  const subjectsFor = {
    1: ['Mathematics', 'Physics', 'Chemistry'],
    2: ['Mathematics', 'Physics', 'Chemistry'],
    3: ['Mathematics', 'Physics', 'Chemistry'],
    4: ['Mathematics', 'Physics', 'Chemistry'],
    5: ['Biology', 'English', 'Computer Science'],
    6: ['Biology', 'English', 'Computer Science'],
    7: ['Biology', 'English', 'Computer Science'],
    8: ['Mathematics', 'Physics', 'Chemistry'],
    9: ['Mathematics', 'Physics', 'Chemistry'],
    10: ['Biology', 'English', 'Computer Science'],
  };
  const names = {
    1: 'Ahmed Khan', 2: 'Priya Sharma', 3: 'Rahul Verma', 4: 'Sneha Patel',
    5: 'Arjun Singh', 6: 'Fatima Sheikh', 7: 'Vikram Mehta', 8: 'Ananya Gupta',
    9: 'Rohan Joshi', 10: 'Kavya Nair',
  };
  // Value profiles per student: [assign, attendance, quiz, mid, final]
  const profiles = {
    1: [9, 5, 13, 27, 37], 2: [8, 5, 14, 26, 38], 3: [7, 4, 12, 22, 33],
    4: [8, 4, 13, 25, 36], 5: [9, 5, 13, 26, 37], 6: [9, 5, 14, 27, 39],
    7: [6, 4, 11, 21, 30], 8: [9, 5, 13, 28, 38], 9: [7, 4, 11, 21, 32],
    10: [8, 5, 12, 25, 36],
  };
  const gradeOf = t => (t >= 90 ? 'A+' : t >= 85 ? 'A' : t >= 80 ? 'A-' : t >= 75 ? 'B+' : t >= 70 ? 'B' : t >= 65 ? 'B-' : t >= 60 ? 'C+' : t >= 50 ? 'C' : t >= 40 ? 'D' : 'F');
  const comps = [
    ['Assignment', 0], ['Attendance', 1], ['Quiz', 2], ['Mid', 3], ['Final', 4],
  ];
  for (const sid of Object.keys(subjectsFor)) {
    const id = Number(sid);
    const p = profiles[id];
    for (const sub of subjectsFor[id]) {
      const total = p[0] + p[1] + p[2] + p[3] + p[4];
      for (const [type, idx] of comps) {
        await run(iM, [id, names[id], sub, p[idx], type === 'Final' ? gradeOf(total) : '', type]);
      }
    }
  }
}

async function seedClassSchedules() {
  const existing = (await get('SELECT COUNT(*) AS c FROM class_schedules')).c;
  if (existing > 0) return;
  const classNames = (await all('SELECT name FROM classes')).map(r => r.name);
  if (classNames.length === 0) return;
  const defaultStructure = JSON.stringify({
    days: [
      { name: 'Friday', periods: ['08:00 - 09:30'] },
      { name: 'Saturday', periods: ['08:00 - 09:30', '09:30 - 11:00', '11:00 - 12:30'] },
      { name: 'Sunday', periods: ['08:00 - 09:30', '09:30 - 11:00', '11:00 - 12:30'] },
    ],
  });
  const iS = 'INSERT INTO class_schedules (className, structure, slots) VALUES (?, ?, ?)';
  for (const cls of classNames) await run(iS, [cls, defaultStructure, '{}']);
}

async function seedAttendanceRecords() {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const iso = d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const students = await all("SELECT id, name, className FROM students WHERE status = 'Active'");
  if (students.length === 0) return;
  const recentDays = [];
  const now = new Date();
  for (let i = 6; i >= 1; i--) recentDays.push(new Date(now.getTime() - i * 86400000));
  const statuses = ['approved', 'approved', 'rejected', 'approved', 'pending', 'late', 'approved'];
  const iA = 'INSERT INTO attendance_records (className, subject, day, periodIndex, studentId, studentName, status, presence, markedAt, scheduledDate, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)';
  for (let si = 0; si < students.length; si++) {
    const s = students[si];
    for (const d of recentDays) {
      for (const periodIndex of [0, 2]) {
        const hash = (si * 7 + recentDays.indexOf(d) + periodIndex) % statuses.length;
        const presence = statuses[hash] === 'late' ? 'late' : 'present';
        await run(iA, [s.className, 'General', dayNames[d.getDay()], periodIndex, s.id, s.name, statuses[hash], presence, '08:30', iso(d), d.toISOString()]);
      }
    }
  }
}

// Convenience facade mirroring server/db.js's default export shape.
//   import db from './db.supabase.js';
//   await db.initDatabase(); await db.seedDatabase();
//   const rows = await db.all('SELECT * FROM students');
//   const row  = await db.get('SELECT * FROM students WHERE id = ?', [id]);
//   const r    = await db.run('INSERT INTO students (...) VALUES (?, …)', values);
//   const tx   = db.transaction(async ({ run, get }) => { … });
// ─────────────────────────────────────────────────────────────────────────────
export default {
  pool,
  connectionString,
  query,
  all,
  get,
  run,
  exec,
  transaction,
  initDatabase,
  seedDatabase,
  // Named exports remain importable too:
};