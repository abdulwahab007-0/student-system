-- ============================================================================
-- NCBA Student Management System — Supabase / PostgreSQL schema
-- Generated from server/db.js (better-sqlite3) → PostgreSQL dialect
--
-- HOW TO USE:
--   1) Supabase Dashboard → SQL Editor → New query → paste this file → Run
--   2) The script is idempotent (CREATE TABLE IF NOT EXISTS) — safe to re-run.
--
-- KEY CONVERSIONS (SQLite → Postgres):
--   INTEGER PRIMARY KEY AUTOINCREMENT   → BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
--   REAL                               → DOUBLE PRECISION
--   INTEGER flag (0/1)                 → INTEGER NOT NULL DEFAULT 0/1  (app uses 0/1 + truthy reads)
--   TEXT NOT NULL DEFAULT (datetime('now')) → TEXT NOT NULL DEFAULT now()
--   ? placeholders                     → $1, $2 … (handled in JS converter, see server/db.supabase.js)
--
-- IMPORTANT — casing note:
--   PostgreSQL folds *unquoted* identifiers to lowercase. The Node app writes
--   camelCase column names in its SQL (e.g. fullName, className, studentId) which
--   therefore land in Postgres as lowercase (fullname, classname, studentid).
--   That is intentional and REQUIRED so the app's unquoted SQL keeps resolving.
--   To compensate, server/db.supabase.js applies a "camelizer" that maps every
--   lowercase result column back to the camelCase JS property the routes read
--   (row.fullName, row.studentId, …). Do NOT double-quote identifiers here, or
--   the app's unquoted INSERT/SELECT statements will break.
--
-- NOTE: Date/time values are stored as TEXT (ISO strings) exactly like SQLite,
-- because the Node app writes new Date().toISOString() everywhere and compares
-- them lexically. This keeps every route working without changes.
--
-- RESET: To fully rebuild from scratch, first DROP all tables (uncomment the
-- DROP block below, run, then re-comment it) before applying this file.
-- ============================================================================

-- ── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username          TEXT UNIQUE NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  password          TEXT NOT NULL,
  fullName          TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'student',
  status            TEXT NOT NULL DEFAULT 'pending',
  className         TEXT,
  registrationDate  TEXT NOT NULL,
  linkedStudentId   BIGINT,
  crForClass        TEXT,
  manageAllClasses  INTEGER NOT NULL DEFAULT 0,
  linkedTeacherId   BIGINT            -- added by migration in SQLite (login → teachers)
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ── students ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  rollNo      TEXT UNIQUE,
  className   TEXT,
  gender        TEXT,
  address       TEXT,
  dateOfBirth TEXT,
  admissionDate TEXT,
  status        TEXT DEFAULT 'Active',
  isCR        INTEGER NOT NULL DEFAULT 0,
  linkedUserId BIGINT
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students (className);
CREATE INDEX IF NOT EXISTS idx_students_status ON students (status);

-- ── teachers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  subject      TEXT,
  qualification TEXT,
  experience   TEXT,
  className  TEXT,
  joiningDate TEXT
);
CREATE INDEX IF NOT EXISTS idx_teachers_name ON teachers (name);

-- ── subjects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      TEXT NOT NULL,
  code      TEXT NOT NULL,
  teacher   TEXT,
  credits   INTEGER NOT NULL DEFAULT 3,
  className TEXT
);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher ON subjects (teacher);
CREATE INDEX IF NOT EXISTS idx_subjects_class ON subjects (className);

-- ── marks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  studentId BIGINT NOT NULL,
  studentName TEXT,
  subject     TEXT NOT NULL,
  marks       INTEGER,
  grade       TEXT,
  examType  TEXT,
  CONSTRAINT fk_marks_student FOREIGN KEY (studentId)
    REFERENCES students (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_marks_student ON marks (studentId);
CREATE INDEX IF NOT EXISTS idx_marks_subject ON marks (subject);

-- ── classes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  description TEXT,
  semester    TEXT
);

-- ── role_permissions (User Rights grid — role-level overrides) ─────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role     TEXT NOT NULL,
  rightKey TEXT NOT NULL,
  granted  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (role, rightKey)
);

-- ── user_permissions (User Rights grid — per-user overrides) ───────────────
CREATE TABLE IF NOT EXISTS user_permissions (
  userId   BIGINT NOT NULL,
  rightKey TEXT NOT NULL,
  granted  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (userId, rightKey)
);
-- ── class_schedules (timetable structure/slots JSON text) ─────────────────
CREATE TABLE IF NOT EXISTS class_schedules (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  className TEXT NOT NULL UNIQUE,
  structure  TEXT NOT NULL DEFAULT '{}',
  slots      TEXT NOT NULL DEFAULT '{}'
);

-- ── student_cards ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_cards (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  studentId BIGINT NOT NULL UNIQUE,
  photoUrl  TEXT,
  photoMime TEXT,
  cardStatus TEXT NOT NULL DEFAULT 'none',
  reviewNote TEXT,
  reviewedBy TEXT,
  issuedAt  TEXT,
  updatedAt TEXT,
  CONSTRAINT fk_student_cards_student FOREIGN KEY (studentId)
    REFERENCES students (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_student_cards_status ON student_cards (cardStatus);

-- ── teacher_cards (keyed by teacher name; teachers come from subjects.teacher) ─
CREATE TABLE IF NOT EXISTS teacher_cards (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacherName TEXT NOT NULL UNIQUE,
  photoUrl   TEXT,
  photoMime  TEXT,
  cardStatus TEXT NOT NULL DEFAULT 'none',
  reviewNote TEXT,
  reviewedBy TEXT,
  issuedAt   TEXT,
  updatedAt  TEXT
);
CREATE INDEX IF NOT EXISTS idx_teacher_cards_status ON teacher_cards (cardStatus);

-- ── chat_messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userId  BIGINT NOT NULL,
  userName TEXT NOT NULL,
  userRole TEXT NOT NULL,
  channel   TEXT NOT NULL DEFAULT 'public',
  message   TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT now()    -- was datetime('now') in SQLite
);
CREATE INDEX IF NOT EXISTS idx_chat_channel_time ON chat_messages (channel, createdAt);

-- ── attendance_geofences ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_geofences (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  country     TEXT,
  province    TEXT,
  city        TEXT,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  radius      DOUBLE PRECISION NOT NULL DEFAULT 100,
  className TEXT,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

-- ── attendance_records ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  className       TEXT NOT NULL,
  subject           TEXT,
  day               TEXT NOT NULL,
  periodIndex     INTEGER NOT NULL,
  studentId       BIGINT NOT NULL,
  studentName     TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  presence          TEXT NOT NULL DEFAULT 'present',
  markedAt        TEXT NOT NULL,
  scheduledDate   TEXT NOT NULL,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  distanceFromCenter DOUBLE PRECISION,
  notes             TEXT,
  approvedBy      TEXT,
  approvedAt      TEXT,
  createdAt       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records (studentId);
CREATE INDEX IF NOT EXISTS idx_attendance_status_date ON attendance_records (status, scheduledDate);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance_records (className, scheduledDate);

-- ── Optional Row Level Security ─────────────────────────────────────────────
-- This backend connects with the project owner / service role (server-side JWT +
-- bcrypt), so the simplest setup is to leave RLS disabled (default for SQL-editor
-- tables). If you want RLS enabled, run:
--
--   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "app_full_access" ON users FOR ALL USING (true) WITH CHECK (true);
--   -- …repeat for every table above…
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions (userId);