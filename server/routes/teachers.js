import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

router.get('/', requirePermission('view_teachers'), async (req, res) => {
  const rows = await db.all('SELECT * FROM teachers ORDER BY id');
  res.json(rows);
});

router.post('/', requirePermission('add_teachers'), async (req, res) => {
  const { name, email, phone, subject, qualification, experience, className, joiningDate } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = await db.run('INSERT INTO teachers (name,email,phone,subject,qualification,experience,className,joiningDate) VALUES (?,?,?,?,?,?,?,?)',
    [name, email||'', phone||'', subject||'', qualification||'', experience||'', className||'', joiningDate||'']);
  const row = await db.get('SELECT * FROM teachers WHERE id = ?', [r.lastInsertRowid]);
  res.json(row);
});

router.put('/:id', requirePermission('edit_teachers'), async (req, res) => {
  const { name, email, phone, subject, qualification, experience, className, joiningDate } = req.body;
  await db.run('UPDATE teachers SET name=?,email=?,phone=?,subject=?,qualification=?,experience=?,className=?,joiningDate=? WHERE id=?',
    [name, email||'', phone||'', subject||'', qualification||'', experience||'', className||'', joiningDate||'', req.params.id]);
  const row = await db.get('SELECT * FROM teachers WHERE id = ?', [req.params.id]);
  res.json(row);
});

router.delete('/:id', requirePermission('delete_teachers'), async (req, res) => {
  await db.run('DELETE FROM teachers WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;
