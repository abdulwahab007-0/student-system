// ============================================================================
// GET /api/bootstrap — one request returns everything the app renders after
// login.
//
// Replaces the previous ~9 request "data storm" (users, pending users,
// permissions, user-permissions, students, teachers, subjects, marks, classes)
// with a single round trip. Every slice follows the EXACT same rules as the
// dedicated endpoints:
//   • students / teachers / classes → only when the role has the right
//     (mirrors each route's requirePermission guard; denied roles get [] not
//     a 403, so clients don't need to tolerate partial failures)
//   • subjects → student sees own class only (case-insensitive tag match)
//   • marks    → student sees own records only (linkedStudentId / name match)
//   • users    → admin column set identical to GET /api/users (no passwords)
// The permission cache in middleware/auth.js means repeated bootstrap calls on
// a warm instance don't even touch the DB for the guard lookups.
// ============================================================================

import { Router } from 'express';
import db from '../db.js';
import { userHasRight } from '../middleware/auth.js';

const router = Router();

const USER_COLUMNS =
  'id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses,twoFactorEnabled';

function toRoleOverrides(rows) {
  const overrides = {};
  for (const r of rows) {
    if (!overrides[r.role]) overrides[r.role] = {};
    overrides[r.role][r.rightKey] = !!r.granted;
  }
  return overrides;
}

function toUserOverrides(rows) {
  const overrides = {};
  for (const r of rows) {
    if (!overrides[r.userId]) overrides[r.userId] = {};
    overrides[r.userId][r.rightKey] = !!r.granted;
  }
  return overrides;
}

router.get('/', async (req, res) => {
  const me = await db.get('SELECT className, linkedStudentId, fullName FROM users WHERE id = ?', [req.user.id]);

  // The permission override maps are tiny and every role already receives them
  // today (the /permissions endpoints are auth-only), so fetch them up-front
  // and let the guard lookups below reuse the auth middleware's cache.
  const [subjectRows, markRows, roleOverrideRows, userOverrideRows] = await Promise.all([
    db.all('SELECT * FROM subjects ORDER BY id'),
    db.all('SELECT * FROM marks ORDER BY id'),
    db.all('SELECT role, rightKey, granted FROM role_permissions'),
    db.all('SELECT userId, rightKey, granted FROM user_permissions'),
  ]);

  // ── Subjects: student → own class only (case-insensitive), same as /api/subjects
  let subjects = subjectRows;
  if (req.user.role === 'student') {
    const cls = (me && me.className ? String(me.className) : '').trim().toLowerCase();
    if (!cls) {
      subjects = [];
    } else {
      subjects = subjectRows.filter(s =>
        (s.className || '').split(',').map(c => c.trim().toLowerCase()).includes(cls)
      );
    }
  }

  // ── Marks: student → own records only, same as /api/marks
  let marks = markRows;
  if (req.user.role === 'student') {
    const linkedId = me && me.linkedStudentId != null ? Number(me.linkedStudentId) : null;
    const myName = (me && me.fullName ? String(me.fullName) : '').trim().toLowerCase();
    marks = markRows.filter(m => {
      const byId = linkedId != null && Number(m.studentId) === linkedId;
      const byName = !!myName && String(m.studentName || '').trim().toLowerCase() === myName;
      return byId || byName;
    });
  }

  const payload = {
    users: [],
    students: [],
    teachers: [],
    subjects,
    marks,
    classes: [],
    rolePermissions: toRoleOverrides(roleOverrideRows),
    userPermissions: toUserOverrides(userOverrideRows),
  };

  // ── Role-gated lists (same checks each route's requirePermission makes) ──
  const can = key => userHasRight(req.user.id, req.user.role, key);

  if (await can('view_users')) {
    payload.users = await db.all(`SELECT ${USER_COLUMNS} FROM users ORDER BY id`);
  }
  if (await can('view_students')) {
    payload.students = await db.all('SELECT * FROM students ORDER BY id');
  }
  if (await can('view_teachers')) {
    payload.teachers = await db.all('SELECT * FROM teachers ORDER BY id');
  }
  if (await can('view_classes')) {
    // Single query with correlated subqueries (same shape as GET /api/classes)
    const classes = await db.all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM students s WHERE s.className = c.name) AS studentCount,
        (SELECT COUNT(*) FROM subjects sub WHERE sub.className = c.name) AS subjectCount
      FROM classes c
      ORDER BY c.id
    `);
    payload.classes = classes.map(c => ({
      ...c,
      studentCount: Number(c.studentcount ?? c.studentCount ?? 0),
      subjectCount: Number(c.subjectcount ?? c.subjectCount ?? 0),
    }));
  }

  res.json(payload);
});

export default router;