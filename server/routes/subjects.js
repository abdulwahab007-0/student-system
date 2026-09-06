import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

router.get('/', requirePermission('view_subjects'), (req, res) => {
  res.json(db.prepare('SELECT * FROM subjects ORDER BY id').all());
});

router.post('/', requirePermission('add_subjects'), (req, res) => {
  const { name, code, teacher, credits, className } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code required' });
  const r = db.prepare('INSERT INTO subjects (name,code,teacher,credits,className) VALUES (?,?,?,?,?)')
    .run(name, code, teacher||'', credits||3, className||'');
  res.json(db.prepare('SELECT * FROM subjects WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id', requirePermission('edit_subjects'), (req, res) => {
  const { name, code, teacher, credits, className } = req.body;
  db.prepare('UPDATE subjects SET name=?,code=?,teacher=?,credits=?,className=? WHERE id=?')
    .run(name, code, teacher||'', credits||3, className||'', req.params.id);
  res.json(db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requirePermission('delete_subjects'), (req, res) => {
  db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
