import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

// ── Helper: Haversine distance in meters ──
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Shared helpers ──
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayNameForDate = (date) => {
  const valid = new Date(date + 'T00:00:00');
  return Number.isNaN(valid.getTime()) ? '' : ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][valid.getDay()];
};
const isoFmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const periodMarkedAt = (timeRange) => {
  const m = /-\s*(\d{1,2}):(\d{2})/.exec(timeRange || '');
  return m ? `${m[1].padStart(2,'0')}:${m[2]}` : '23:59';
};

// ── Lecture-time window enforcement ─────────────────────────────────────
// Each period is a "HH:mm - HH:mm" range. Attendance may ONLY be marked while
// the current time is inside [startTime, endTime]:
//   • before the start  → "before the lecture time"  (blocked)
//   • after  the end    → "after  the lecture time"  (blocked, treated as absent)
// This applies to every period (1st, 2nd, 3rd, …) using that period's own window.
// Returns { start, end } minute-of-day values for a time range, or null if the
// range can't be parsed (callers then fall back to allowing the mark).
function parseTimeRange(timeRange) {
  const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(timeRange || '');
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { start, end };
}

// ── Timezone-aware helpers ──────────────────────────────────────────────
// On Vercel the server runs in UTC, but schedule times are in the school's
// local timezone (e.g. Asia/Karachi, UTC+5).  SCHEDULE_TIMEZONE tells us
// which IANA timezone to use.  We use the Intl API to extract hours/minutes
// in that timezone — no external libraries needed.
const SCHEDULE_TZ = process.env.SCHEDULE_TIMEZONE || 'Asia/Karachi';

// Returns { hours, minutes, formatted } for "now" in the configured timezone.
function localNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHEDULE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour').value);
  const m = Number(parts.find(p => p.type === 'minute').value);
  return { hours: h, minutes: m, formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

// minute-of-day in the configured schedule timezone
function localMinutesOfDay() {
  const { hours, minutes } = localNow();
  return hours * 60 + minutes;
}

// ── Bulk absent record generation (one call replaces 30-60 per-day loops) ──
// Fetches schedule + students ONCE, then iterates every date in the range,
// inserting absent records for scheduled periods with no existing mark.
// Uses multi-row INSERT for much faster bulk writes.
const absentGenCache = new Map(); // className → { end, ts }  (guard against re-running within 2 min)

async function bulkEnsureAbsentRecords(className, startDate, endDate) {
  if (!className || !startDate || !endDate) return 0;
  const limitISO = todayISO();
  const effectiveEnd = endDate > limitISO ? limitISO : endDate;
  if (startDate > effectiveEnd) return 0;

  // Guard: skip if we already generated for this class up to effectiveEnd within 2 minutes
  const cached = absentGenCache.get(className);
  const now = Date.now();
  if (cached && cached.end >= effectiveEnd && now - cached.ts < 120_000) return 0;

  const schedule = await db.get('SELECT structure FROM class_schedules WHERE className = ?', [className]);
  let allParsed = {};
  if (schedule) { try { allParsed = JSON.parse(schedule.structure || '{}'); } catch {} }

  const students = await db.all("SELECT id, name FROM students WHERE className = ? AND status = 'Active'", [className]);
  if (students.length === 0) return 0;

  // ONE query for all existing records in the range
  const existingRows = await db.all(
    "SELECT studentId, periodIndex, scheduledDate FROM attendance_records WHERE className = ? AND scheduledDate BETWEEN ? AND ?",
    [className, startDate, effectiveEnd]
  );
  const existingSet = new Set(existingRows.map(r => `${r.studentId}|${r.periodIndex}|${r.scheduledDate}`));

  const nowISO = new Date().toISOString();
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(effectiveEnd + 'T00:00:00');

  // Collect all rows to insert, then do a single multi-row INSERT
  const rows = [];
  for (let t = new Date(start); t <= end; t.setDate(t.getDate() + 1)) {
    const date = isoFmt(t);
    const dayName = dayNameForDate(date);
    if (!dayName) continue;
    const dayDef = (allParsed.days || []).find(d => d.name === dayName);
    const periods = (dayDef && dayDef.periods) ? dayDef.periods : [];
    if (periods.length === 0) continue;
    for (let pi = 0; pi < periods.length; pi++) {
      for (const s of students) {
        const key = `${s.id}|${pi}|${date}`;
        if (existingSet.has(key)) continue;
        rows.push([className, null, dayName, pi, s.id, s.name, 'absent', 'absent', periodMarkedAt(periods[pi]), date, nowISO]);
        existingSet.add(key);
      }
    }
  }

  if (rows.length === 0) return 0;

  // Multi-row INSERT: batch in chunks of 50 rows to avoid SQL parameter limits
  const CHUNK = 50;
  const bulkInsert = db.transaction(async ({ run }) => {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params = chunk.flat();
      await run(
        `INSERT INTO attendance_records (className, subject, day, periodIndex, studentId, studentName, status, presence, markedAt, scheduledDate, createdAt) VALUES ${placeholders}`,
        params
      );
    }
    return rows.length;
  });

  const created = await bulkInsert();
  absentGenCache.set(className, { end: effectiveEnd, ts: Date.now() });
  return created;
}

// Single-day wrapper (kept for ensureAbsentRecords callers like POST /mark)
async function ensureAbsentRecords(className, date) {
  return bulkEnsureAbsentRecords(className, date, date);
}

// ── Geofence CRUD ──
router.get('/geofences', requirePermission('manage_geofences'), async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM attendance_geofences ORDER BY id DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/geofences/:className', requirePermission('view_attendance'), async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM attendance_geofences WHERE className = ? OR className IS NULL ORDER BY id DESC', [req.params.className]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/geofences', requirePermission('manage_geofences'), async (req, res) => {
  try {
    const { name, country, province, city, latitude, longitude, radius, className } = req.body;
    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Name, latitude, and longitude are required' });
    }
    const now = new Date().toISOString();
    const result = await db.run('INSERT INTO attendance_geofences (name, country, province, city, latitude, longitude, radius, className, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, country || null, province || null, city || null, latitude, longitude, radius || 100, className || null, req.user.username, now]);
    const geofence = await db.get('SELECT * FROM attendance_geofences WHERE id = ?', [result.lastInsertRowid]);
    res.json(geofence);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/geofences/:id', requirePermission('manage_geofences'), async (req, res) => {
  try {
    const { name, country, province, city, latitude, longitude, radius, className } = req.body;
    const existing = await db.get('SELECT * FROM attendance_geofences WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Geofence not found' });
    await db.run('UPDATE attendance_geofences SET name = ?, country = ?, province = ?, city = ?, latitude = ?, longitude = ?, radius = ?, className = ? WHERE id = ?',
      [name || existing.name, country !== undefined ? (country || null) : existing.country, province !== undefined ? (province || null) : existing.province, city !== undefined ? (city || null) : existing.city, latitude ?? existing.latitude, longitude ?? existing.longitude, radius ?? existing.radius, className !== undefined ? (className || null) : existing.className, req.params.id]);
    const updated = await db.get('SELECT * FROM attendance_geofences WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/geofences/:id', requirePermission('manage_geofences'), async (req, res) => {
  try {
    await db.run('DELETE FROM attendance_geofences WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Mark Attendance (Student) ──
router.post('/mark', requirePermission('mark_attendance'), async (req, res) => {
  try {
    const { className, subject, day, periodIndex, scheduledDate, latitude, longitude } = req.body;
    if (!className || !day || periodIndex == null || !scheduledDate) {
      return res.status(400).json({ error: 'className, day, periodIndex, and scheduledDate are required' });
    }

    // ── Enforce the lecture-time window ─────────────────────────────────
    // Attendance may only be marked DURING the selected period's time window.
    // Before the window → "before the lecture time"; after → "after the lecture
    // time" (that period counts as absent). Applies to every period individually.
    let windowBlocked = null; // { error }
    try {
      const schedule = await db.get('SELECT structure FROM class_schedules WHERE className = ?', [className]);
      let structure = {};
      if (schedule) { try { structure = JSON.parse(schedule.structure || '{}'); } catch { structure = {}; } }
      const dayDef = (structure.days || []).find(d => d.name === day);
      const timeRange = (dayDef && dayDef.periods && dayDef.periods[periodIndex]) || null;
      const win = timeRange ? parseTimeRange(timeRange) : null;
      if (win) {
        const now = localMinutesOfDay();
        if (now < win.start) {
          windowBlocked = { error: 'You cannot mark attendance before the lecture time' };
        } else if (now > win.end) {
          windowBlocked = { error: 'You cannot mark attendance after the lecture time' };
        }
      }
      // If no schedule/period/time was found, fall back to allowing the mark
      // (no regression when the schedule isn't configured).
    } catch { /* never block on a schedule-read failure — fail open */ }

    if (windowBlocked) {
      return res.status(403).json(windowBlocked);
    }

    // Resolve the linked student record. The user row stores the canonical
    // link (`linkedStudentId`); fall back to the reverse lookup on students.
    const userRow = req.user.linkedStudentId != null
      ? req.user
      : await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    let student = null;
    if (userRow && userRow.linkedStudentId != null) {
      student = await db.get('SELECT id, name FROM students WHERE id = ?', [userRow.linkedStudentId]);
    }
    if (!student) {
      student = await db.get('SELECT id, name FROM students WHERE linkedUserId = ?', [req.user.id]);
    }
    if (!student) {
      return res.status(400).json({ error: 'No linked student profile found for this account' });
    }

    // Check for duplicate — but allow upgrading an auto-generated 'absent' slot
    // so a student who then marks attendance is recorded as present instead of
    // being blocked by the absent placeholder.
    const existing = await db.get(
      'SELECT id, presence FROM attendance_records WHERE studentId = ? AND className = ? AND day = ? AND periodIndex = ? AND scheduledDate = ?',
      [student.id, className, day, periodIndex, scheduledDate]
    );

    // Verify geofence
    let distance = null;
    let geoVerified = false;
    const geofences = await db.all('SELECT * FROM attendance_geofences WHERE className = ? OR className IS NULL', [className]);
    if (geofences.length === 0) {
      geoVerified = true;
    } else if (latitude != null && longitude != null) {
      for (const fence of geofences) {
        const dist = haversineDistance(latitude, longitude, fence.latitude, fence.longitude);
        if (dist <= fence.radius) {
          geoVerified = true;
          distance = Math.round(dist);
          break;
        }
      }
      if (!geoVerified) {
        distance = Math.round(haversineDistance(latitude, longitude, geofences[0].latitude, geofences[0].longitude));
      }
    }

    if (!geoVerified) {
      return res.status(403).json({
        error: 'You are outside the permitted attendance area',
        distance,
        allowedRadius: geofences[0]?.radius || 0,
      });
    }

    if (existing && existing.presence !== 'absent') {
      return res.status(409).json({ error: 'You have already marked attendance for this class' });
    }

    // All marks start as 'pending' — admins approve or reject
    const markedTime = localNow().formatted;
    const status = 'pending';

    const nowISO = new Date().toISOString();
    const subjectOrNull = subject || null;
    const latOrNull = latitude || null;
    const lngOrNull = longitude || null;

    if (existing) {
      // Upgrade the auto-generated absent placeholder to a real pending mark.
      await db.run(
        "UPDATE attendance_records SET status = ?, presence = 'present', subject = ?, markedAt = ?, latitude = ?, longitude = ?, distanceFromCenter = ?, createdAt = ?, approvedBy = NULL, approvedAt = NULL WHERE id = ?",
        [status, subjectOrNull, markedTime, latOrNull, lngOrNull, distance, nowISO, existing.id]
      );
      const record = await db.get('SELECT * FROM attendance_records WHERE id = ?', [existing.id]);
      return res.json(record);
    }

    const result = await db.run(
      'INSERT INTO attendance_records (className, subject, day, periodIndex, studentId, studentName, status, presence, markedAt, scheduledDate, latitude, longitude, distanceFromCenter, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [className, subjectOrNull, day, periodIndex, student.id, student.name, status, 'present', markedTime, scheduledDate, latOrNull, lngOrNull, distance, nowISO]
    );

    const record = await db.get('SELECT * FROM attendance_records WHERE id = ?', [result.lastInsertRowid]);
    res.json(record);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get attendance records (Admin/CR/Teacher view) ──
router.get('/records', requirePermission('view_attendance'), async (req, res) => {
  try {
    const { className, date, status, presence, search } = req.query;
    // CR and Teacher are locked to the Pending queue in attendance review — only
    // the Super Admin may filter by Approved / Rejected status. Enforced here so
    // direct API calls can't bypass the UI restriction.
    const canFilterStatus = req.user.role === 'super_admin';
    const effectiveStatus = canFilterStatus ? status : 'pending';
    // If an admin views a specific class on a specific date, materialize any
    // missing 'absent' records (students who were scheduled but never marked).
    if (className && date) {
      await ensureAbsentRecords(className, date);
    }
    let query = 'SELECT * FROM attendance_records WHERE 1=1';
    const params = [];
    if (className) { query += ' AND className = ?'; params.push(className); }
    if (date) { query += ' AND scheduledDate = ?'; params.push(date); }
    if (effectiveStatus) { query += ' AND status = ?'; params.push(effectiveStatus); }
    if (presence) { query += ' AND presence = ?'; params.push(presence); }
    if (search) {
      query += ' AND (studentName LIKE ? OR className LIKE ? OR subject LIKE ? OR day LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    query += ' ORDER BY createdAt DESC';
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET attendance records + student info for a specific student (Student Attendance page)
// Admin/CR/Teacher pick any student; optional from/to date-range filtering.
router.get('/student-records', requirePermission('view_attendance_report'), async (req, res) => {
  try {
    const { studentId, from, to } = req.query;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required' });
    }
    const student = await db.get('SELECT id, name, rollNo, className FROM students WHERE id = ?', [studentId]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    let query = 'SELECT * FROM attendance_records WHERE studentId = ?';
    const params = [studentId];
    if (from) { query += ' AND scheduledDate >= ?'; params.push(from); }
    if (to) { query += ' AND scheduledDate <= ?'; params.push(to); }

    // Bulk-generate 'absent' records for the whole date range in ONE pass
    if (student.className && from && to) {
      const MAX_GEN_DAYS = 60;
      let start = new Date(from + 'T00:00:00');
      const end = new Date(to + 'T00:00:00');
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const rangeDays = Math.round((end - start) / 86400000);
        if (rangeDays > MAX_GEN_DAYS) start = new Date(end.getTime() - MAX_GEN_DAYS * 86400000);
        await bulkEnsureAbsentRecords(student.className, isoFmt(start), isoFmt(end));
      }
    }

    query += ' ORDER BY scheduledDate DESC, periodIndex ASC';
    const records = await db.all(query, params);
    res.json({ student, records });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET attendance for a specific student
router.get('/student/:studentId', requirePermission('view_attendance'), async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM attendance_records WHERE studentId = ? ORDER BY createdAt DESC', [req.params.studentId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET attendance summary for a class
router.get('/summary/:className', requirePermission('view_attendance'), async (req, res) => {
  try {
    const { date } = req.query;
    let query = `
      SELECT studentId, studentName,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as presentCount,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as lateCount,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejectedCount,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        COUNT(*) as totalRecords
      FROM attendance_records WHERE className = ?
    `;
    const params = [req.params.className];
    if (date) { query += ' AND scheduledDate = ?'; params.push(date); }
    query += ' GROUP BY studentId ORDER BY studentName';
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Self view: current user's own attendance records (Student) ──
router.get('/my', requirePermission('view_own_attendance'), async (req, res) => {
  try {
    // Resolve the linked student record using the same logic as POST /mark
    const userRow = req.user.linkedStudentId != null
      ? req.user
      : await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    let student = null;
    if (userRow && userRow.linkedStudentId != null) {
      student = await db.get('SELECT id, name, className FROM students WHERE id = ?', [userRow.linkedStudentId]);
    }
    if (!student) {
      student = await db.get('SELECT id, name, className FROM students WHERE linkedUserId = ?', [req.user.id]);
    }
    if (!student) {
      student = await db.get('SELECT id, name, className FROM students WHERE className = ? ORDER BY id LIMIT 1',
        [userRow?.className || req.user.className]);
    }
    if (!student) {
      return res.status(400).json({ error: 'No linked student profile found for this account' });
    }
    // Auto-generate 'absent' records for the student's scheduled periods over the
    // last 30 days that they never marked, so "My Attendance" shows absences too.
    // Uses bulkEnsureAbsentRecords to do this in ONE pass instead of 30 loops.
    if (student.className) {
      const today = new Date();
      const start = new Date(today.getTime() - 30 * 86400000);
      await bulkEnsureAbsentRecords(student.className, isoFmt(start), isoFmt(today));
    }
    const records = await db.all(
      'SELECT * FROM attendance_records WHERE studentId = ? ORDER BY scheduledDate DESC, periodIndex ASC',
      [student.id]
    );
    res.json({ records, student });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Attendance report: per-student approved/rejected counts over a date range ──
router.get('/report', requirePermission('view_attendance_report'), async (req, res) => {
  try {
    const { className, from, to } = req.query;
    if (!className) return res.status(400).json({ error: 'className is required' });
    const fromDate = from || '1900-01-01';
    const toDate = to || '9999-12-31';
    const rows = await db.all(`
      SELECT
        s.id AS studentId, s.name AS studentName, s.rollNo, s.className,
        COUNT(a.id) AS totalDays,
        SUM(CASE WHEN a.status IN ('approved', 'present') THEN 1 ELSE 0 END) AS approvedDays,
        SUM(CASE WHEN a.status = 'approved' AND a.presence = 'late' THEN 1 ELSE 0 END) AS lateDays,
        SUM(CASE WHEN a.status = 'rejected' THEN 1 ELSE 0 END) AS rejectedDays,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absentDays,
        SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END) AS pendingDays
      FROM students s
      LEFT JOIN attendance_records a
        ON a.studentId = s.id
        AND a.scheduledDate BETWEEN ? AND ?
      WHERE s.className = ?
        AND s.status = 'Active'
      GROUP BY s.id
      ORDER BY s.name ASC
    `, [fromDate, toDate, className]);

    // Who approved / rejected each record in the range (joined to the users table)
    const actors = await db.all(`
      SELECT a.studentId, a.status, a.approvedBy AS username, u.fullName, u.role, a.approvedAt
      FROM attendance_records a
      JOIN students s ON s.id = a.studentId
      LEFT JOIN users u ON u.username = a.approvedBy
      WHERE s.className = ?
        AND s.status = 'Active'
        AND a.scheduledDate BETWEEN ? AND ?
        AND a.status IN ('approved', 'rejected')
        AND a.approvedBy IS NOT NULL
      ORDER BY a.approvedAt ASC
    `, [className, fromDate, toDate]);

    const approversById = {};
    const rejectersById = {};
    for (const rec of actors) {
      const bucket = rec.status === 'rejected' ? rejectersById : approversById;
      if (!bucket[rec.studentId]) bucket[rec.studentId] = [];
      const list = bucket[rec.studentId];
      if (!list.some(x => x.username === rec.username)) {
        list.push({
          username: rec.username,
          fullName: rec.fullName || rec.username,
          role: rec.role || '',
          at: (rec.approvedAt || '').slice(0, 10),
        });
      }
    }
    for (const row of rows) {
      row.approvers = approversById[row.studentId] || [];
      row.rejecters = rejectersById[row.studentId] || [];
    }
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/approve/:id', requirePermission('approve_attendance'), async (req, res) => {
  try {
    const { action } = req.body;
    const record = await db.get('SELECT * FROM attendance_records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const newStatus = action === 'reject' ? 'rejected' : 'approved';
    const now = new Date().toISOString();
    await db.run('UPDATE attendance_records SET status = ?, approvedBy = ?, approvedAt = ? WHERE id = ?',
      [newStatus, req.user.username, now, req.params.id]);
    const updated = await db.get('SELECT * FROM attendance_records WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT bulk approve/reject
router.put('/bulk-action', requirePermission('approve_attendance'), async (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const newStatus = action === 'reject' ? 'rejected' : 'approved';
    const now = new Date().toISOString();
    const bulkUpdate = db.transaction(async ({ run }) => {
      for (const id of ids) {
        await run('UPDATE attendance_records SET status = ?, approvedBy = ?, approvedAt = ? WHERE id = ?',
          [newStatus, req.user.username, now, id]);
      }
    });
    await bulkUpdate();
    res.json({ success: true, updated: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT approve/reject a student's pending records inside a date range (Attendance Report)
router.put('/report-action', requirePermission('approve_attendance'), async (req, res) => {
  try {
    const { studentId, from, to, action } = req.body;
    if (studentId == null || !from || !to) {
      return res.status(400).json({ error: 'studentId, from, and to are required' });
    }
    const newStatus = action === 'reject' ? 'rejected' : 'approved';
    const now = new Date().toISOString();
    const result = await db.run(
      'UPDATE attendance_records SET status = ?, approvedBy = ?, approvedAt = ? WHERE studentId = ? AND status = ? AND scheduledDate BETWEEN ? AND ?',
      [newStatus, req.user.username, now, studentId, 'pending', from, to]
    );
    res.json({ success: true, updated: result.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Update a record's presence (Present / Late / Absent) ──
router.put('/:id/presence', requirePermission('approve_attendance'), async (req, res) => {
  try {
    const { presence } = req.body;
    if (!['present', 'late', 'absent'].includes(presence)) {
      return res.status(400).json({ error: "presence must be 'present', 'late', or 'absent'" });
    }
    const record = await db.get('SELECT * FROM attendance_records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    await db.run('UPDATE attendance_records SET presence = ? WHERE id = ?', [presence, req.params.id]);
    const updated = await db.get('SELECT * FROM attendance_records WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Delete a single attendance record ──
router.delete('/:id', requirePermission('approve_attendance'), async (req, res) => {
  try {
    const record = await db.get('SELECT * FROM attendance_records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    await db.run('DELETE FROM attendance_records WHERE id = ?', [req.params.id]);
    res.json({ success: true, deleted: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
