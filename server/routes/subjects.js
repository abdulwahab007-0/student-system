import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

// ── Teacher class sync ────────────────────────────────────────────────
// A teacher's class(es) come from the Subjects module: the distinct
// `className` values of the subjects assigned to that teacher (by name).
// Whenever subjects are created/updated/deleted we recompute the teacher's
// `teachers.className` so the Teachers page and stored records stay in sync
// with the class(es) selected on each subject.
async function syncTeacherClassFromSubjects(teacherName) {
  const name = (teacherName || '').trim();
  if (!name) return;
  const rows = await db.all(
    `SELECT DISTINCT className FROM subjects WHERE lower(trim(teacher)) = lower(trim(?)) AND className IS NOT NULL AND trim(className) != ''`,
    [name]
  );
  const classes = new Set();
  rows.forEach(r => {
    (r.className || '').split(',').map(c => c.trim()).filter(Boolean).forEach(c => classes.add(c));
  });
  const joined = [...classes].sort().join(', ');
  await db.run('UPDATE teachers SET className = ? WHERE lower(trim(name)) = lower(trim(?))', [joined, name]);
}

router.get('/', requirePermission('view_subjects'), async (req, res) => {
  const rows = await db.all('SELECT * FROM subjects ORDER BY id');

  // ── Student role: only subjects assigned to the student's own class ──
  // Enforced server-side so every portal student account is covered regardless
  // of what the client requests. Class matching is case-insensitive so records
  // like "ADPSe" vs subjects tagged "ADPSE" still match.
  if (req.user && req.user.role === 'student') {
    const me = await db.get('SELECT className FROM users WHERE id = ?', [req.user.id]);
    const cls = (me && me.className ? String(me.className) : '').trim().toLowerCase();
    if (!cls) return res.json([]);
    return res.json(rows.filter(s => {
      const tags = (s.className || '').split(',').map(c => c.trim().toLowerCase());
      return tags.includes(cls);
    }));
  }

  res.json(rows);
});

router.post('/', requirePermission('add_subjects'), async (req, res) => {
  const { name, code, teacher, credits, className } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code required' });
  const r = await db.run('INSERT INTO subjects (name,code,teacher,credits,className) VALUES (?,?,?,?,?)',
    [name, code, teacher||'', credits||3, className||'']);
  const row = await db.get('SELECT * FROM subjects WHERE id = ?', [r.lastInsertRowid]);
  // The new subject's teacher now teaches its classes → refresh their class field
  await syncTeacherClassFromSubjects(teacher);
  res.json(row);
});

router.put('/:id', requirePermission('edit_subjects'), async (req, res) => {
  const { name, code, teacher, credits, className } = req.body;
  // Capture the previous teacher so we can refresh BOTH the old and new
  // teacher's class after the change (a subject may be re-assigned).
  const prev = await db.get('SELECT teacher FROM subjects WHERE id = ?', [req.params.id]);
  await db.run('UPDATE subjects SET name=?,code=?,teacher=?,credits=?,className=? WHERE id=?',
    [name, code, teacher||'', credits||3, className||'', req.params.id]);
  const row = await db.get('SELECT * FROM subjects WHERE id = ?', [req.params.id]);
  const oldTeacher = prev && prev.teacher ? prev.teacher.trim() : '';
  if (oldTeacher && oldTeacher !== (teacher || '').trim()) {
    await syncTeacherClassFromSubjects(oldTeacher);
  }
  await syncTeacherClassFromSubjects(teacher);
  res.json(row);
});

router.delete('/:id', requirePermission('delete_subjects'), async (req, res) => {
  const prev = await db.get('SELECT teacher FROM subjects WHERE id = ?', [req.params.id]);
  await db.run('DELETE FROM subjects WHERE id = ?', [req.params.id]);
  // Removing a subject may change the teacher's class list → refresh it
  if (prev && prev.teacher) await syncTeacherClassFromSubjects(prev.teacher);
  res.json({ success: true });
});

export default router;
