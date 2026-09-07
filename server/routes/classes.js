import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

router.get('/', requirePermission('view_classes'), async (req, res) => {
  const classes = await db.all('SELECT * FROM classes ORDER BY id');
  // Compute studentCount and subjectCount for each class
  const enriched = [];
  for (const c of classes) {
    const sc = await db.get('SELECT COUNT(*) as c FROM students WHERE className = ?', [c.name]);
    const sbc = await db.get('SELECT COUNT(*) as c FROM subjects WHERE className = ?', [c.name]);
    enriched.push({ ...c, studentCount: sc.c, subjectCount: sbc.c });
  }
  res.json(enriched);
});

router.post('/', requirePermission('add_classes'), async (req, res) => {
  const { name, code, description, semester } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code required' });
  const r = await db.run('INSERT INTO classes (name,code,description,semester) VALUES (?,?,?,?)',
    [name, code.toUpperCase(), description||'', semester||'']);
  const cls = await db.get('SELECT * FROM classes WHERE id = ?', [r.lastInsertRowid]);
  res.json({ ...cls, studentCount: 0, subjectCount: 0 });
});

router.put('/:id', requirePermission('edit_classes'), async (req, res) => {
  const { name, code, description, semester } = req.body;
  await db.run('UPDATE classes SET name=?,code=?,description=?,semester=? WHERE id=?',
    [name, code.toUpperCase(), description||'', semester||'', req.params.id]);
  const cls = await db.get('SELECT * FROM classes WHERE id = ?', [req.params.id]);
  const sc = await db.get('SELECT COUNT(*) as c FROM students WHERE className = ?', [cls.name]);
  const sbc = await db.get('SELECT COUNT(*) as c FROM subjects WHERE className = ?', [cls.name]);
  res.json({ ...cls, studentCount: sc.c, subjectCount: sbc.c });
});

router.delete('/:id', requirePermission('delete_classes'), async (req, res) => {
  await db.run('DELETE FROM classes WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;
