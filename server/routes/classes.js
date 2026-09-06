import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

router.get('/', requirePermission('view_classes'), (req, res) => {
  const classes = db.prepare('SELECT * FROM classes ORDER BY id').all();
  // Compute studentCount and subjectCount for each class
  const enriched = classes.map(c => {
    const sc = db.prepare('SELECT COUNT(*) as c FROM students WHERE className = ?').get(c.name);
    const sbc = db.prepare('SELECT COUNT(*) as c FROM subjects WHERE className = ?').get(c.name);
    return { ...c, studentCount: sc.c, subjectCount: sbc.c };
  });
  res.json(enriched);
});

router.post('/', requirePermission('add_classes'), (req, res) => {
  const { name, code, description, semester } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code required' });
  const r = db.prepare('INSERT INTO classes (name,code,description,semester) VALUES (?,?,?,?)')
    .run(name, code.toUpperCase(), description||'', semester||'');
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(r.lastInsertRowid);
  res.json({ ...cls, studentCount: 0, subjectCount: 0 });
});

router.put('/:id', requirePermission('edit_classes'), (req, res) => {
  const { name, code, description, semester } = req.body;
  db.prepare('UPDATE classes SET name=?,code=?,description=?,semester=? WHERE id=?')
    .run(name, code.toUpperCase(), description||'', semester||'', req.params.id);
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  const sc = db.prepare('SELECT COUNT(*) as c FROM students WHERE className = ?').get(cls.name);
  const sbc = db.prepare('SELECT COUNT(*) as c FROM subjects WHERE className = ?').get(cls.name);
  res.json({ ...cls, studentCount: sc.c, subjectCount: sbc.c });
});

router.delete('/:id', requirePermission('delete_classes'), (req, res) => {
  db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
