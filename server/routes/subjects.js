import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

router.get('/', requirePermission('view_subjects'), async (req, res) => {
  const rows = await db.all('SELECT * FROM subjects ORDER BY id');
  res.json(rows);
});

router.post('/', requirePermission('add_subjects'), async (req, res) => {
  const { name, code, teacher, credits, className } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code required' });
  const r = await db.run('INSERT INTO subjects (name,code,teacher,credits,className) VALUES (?,?,?,?,?)',
    [name, code, teacher||'', credits||3, className||'']);
  const row = await db.get('SELECT * FROM subjects WHERE id = ?', [r.lastInsertRowid]);
  res.json(row);
});

router.put('/:id', requirePermission('edit_subjects'), async (req, res) => {
  const { name, code, teacher, credits, className } = req.body;
  await db.run('UPDATE subjects SET name=?,code=?,teacher=?,credits=?,className=? WHERE id=?',
    [name, code, teacher||'', credits||3, className||'', req.params.id]);
  const row = await db.get('SELECT * FROM subjects WHERE id = ?', [req.params.id]);
  res.json(row);
});

router.delete('/:id', requirePermission('delete_subjects'), async (req, res) => {
  await db.run('DELETE FROM subjects WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;
