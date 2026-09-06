import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

router.get('/', requirePermission('view_teachers'), (req, res) => {
  res.json(db.prepare('SELECT * FROM teachers ORDER BY id').all());
});

router.post('/', requirePermission('add_teachers'), (req, res) => {
  const { name, email, phone, subject, qualification, experience, className, joiningDate } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare('INSERT INTO teachers (name,email,phone,subject,qualification,experience,className,joiningDate) VALUES (?,?,?,?,?,?,?,?)')
    .run(name, email||'', phone||'', subject||'', qualification||'', experience||'', className||'', joiningDate||'');
  res.json(db.prepare('SELECT * FROM teachers WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id', requirePermission('edit_teachers'), (req, res) => {
  const { name, email, phone, subject, qualification, experience, className, joiningDate } = req.body;
  db.prepare('UPDATE teachers SET name=?,email=?,phone=?,subject=?,qualification=?,experience=?,className=?,joiningDate=? WHERE id=?')
    .run(name, email||'', phone||'', subject||'', qualification||'', experience||'', className||'', joiningDate||'', req.params.id);
  res.json(db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requirePermission('delete_teachers'), (req, res) => {
  db.prepare('DELETE FROM teachers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
