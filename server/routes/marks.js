import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

router.get('/', requirePermission('view_marks'), (req, res) => {
  res.json(db.prepare('SELECT * FROM marks ORDER BY id').all());
});

router.post('/', requirePermission('record_marks'), (req, res) => {
  const { studentId, studentName, subject, marks, grade, examType } = req.body;
  if (!studentId || !subject || marks === undefined) return res.status(400).json({ error: 'studentId, subject, marks required' });
  const r = db.prepare('INSERT INTO marks (studentId,studentName,subject,marks,grade,examType) VALUES (?,?,?,?,?,?)')
    .run(studentId, studentName||'', subject, marks, grade||'', examType||'Final');
  res.json(db.prepare('SELECT * FROM marks WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id', requirePermission('record_marks'), (req, res) => {
  const { studentId, studentName, subject, marks, grade, examType } = req.body;
  db.prepare('UPDATE marks SET studentId=?,studentName=?,subject=?,marks=?,grade=?,examType=? WHERE id=?')
    .run(studentId, studentName||'', subject, marks, grade||'', examType||'Final', req.params.id);
  res.json(db.prepare('SELECT * FROM marks WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requirePermission('delete_marks'), (req, res) => {
  db.prepare('DELETE FROM marks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
