import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

router.get('/', requirePermission('view_marks'), async (req, res) => {
  const rows = await db.all('SELECT * FROM marks ORDER BY id');

  // ── Student role: only the student's OWN marks ──
  // Enforced server-side so every portal student account only ever receives
  // their own grade records (matched by linked student id, falling back to a
  // name match). Nobody else's marks leave the API for a student session.
  if (req.user && req.user.role === 'student') {
    const me = await db.get('SELECT linkedStudentId, fullName FROM users WHERE id = ?', [req.user.id]);
    const linkedId = me && me.linkedStudentId != null ? Number(me.linkedStudentId) : null;
    const myName = (me && me.fullName ? String(me.fullName) : '').trim().toLowerCase();
    return res.json(rows.filter(m => {
      const byId = linkedId != null && Number(m.studentId) === linkedId;
      const byName = !!myName && String(m.studentName || '').trim().toLowerCase() === myName;
      return byId || byName;
    }));
  }

  res.json(rows);
});

router.post('/', requirePermission('record_marks'), async (req, res) => {
  const { studentId, studentName, subject, marks, grade, examType } = req.body;
  if (!studentId || !subject || marks === undefined) return res.status(400).json({ error: 'studentId, subject, marks required' });
  const r = await db.run('INSERT INTO marks (studentId,studentName,subject,marks,grade,examType) VALUES (?,?,?,?,?,?)',
    [studentId, studentName||'', subject, marks, grade||'', examType||'Final']);
  const row = await db.get('SELECT * FROM marks WHERE id = ?', [r.lastInsertRowid]);
  res.json(row);
});

router.put('/:id', requirePermission('record_marks'), async (req, res) => {
  const { studentId, studentName, subject, marks, grade, examType } = req.body;
  await db.run('UPDATE marks SET studentId=?,studentName=?,subject=?,marks=?,grade=?,examType=? WHERE id=?',
    [studentId, studentName||'', subject, marks, grade||'', examType||'Final', req.params.id]);
  const row = await db.get('SELECT * FROM marks WHERE id = ?', [req.params.id]);
  res.json(row);
});

router.delete('/:id', requirePermission('delete_marks'), async (req, res) => {
  await db.run('DELETE FROM marks WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;
