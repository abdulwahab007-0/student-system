import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { generateToken, authMiddleware, requirePermission } from '../middleware/auth.js';
import { defaultPasswordFor, generateUniqueUsername } from './defaults.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status !== 'approved') return res.status(403).json({ error: 'Account pending approval' });
  const token = generateToken(user);
  const { password: _, ...safe } = user;
  res.json({ token, user: safe });
});

router.post('/register', (req, res) => {
  const { username, email, password, fullName, role, className } = req.body;
  if (!username || !email || !password || !fullName) return res.status(400).json({ error: 'All fields required' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) return res.status(409).json({ error: 'Username or email already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate) VALUES (?,?,?,?,?,?,?,?)')
    .run(username, email, hash, fullName, role || 'student', 'pending', className || null, new Date().toISOString().slice(0, 10));
  res.json({ success: true, message: 'Registration submitted. Pending admin approval.', userId: r.lastInsertRowid });
});

router.put('/change-password', (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  if (!userId || !oldPassword || !newPassword) return res.status(400).json({ error: 'All fields required' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(oldPassword, user.password)) return res.status(401).json({ error: 'Current password incorrect' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), userId);
  res.json({ success: true });
});

router.put('/reset-password/:id', authMiddleware, requirePermission('reset_passwords'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const defaultPw = defaultPasswordFor(user.role);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(defaultPw, 10), user.id);
  res.json({ success: true, user: { id: user.id, username: user.username, password: defaultPw, fullName: user.fullName } });
});

router.post('/assign-cr', authMiddleware, requirePermission('assign_cr'), (req, res) => {
  const { studentId, manageAllClasses } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const cls = student.className;
  const isAll = !!manageAllClasses;

  // Demote any previous CR occupying this role (per-class CR for the same class,
  // OR the previous head CR when assigning a new head CR).
  if (isAll) {
    const prevHead = db.prepare('SELECT id FROM users WHERE role = ? AND manageAllClasses = 1').get('cr_admin');
    if (prevHead) {
      db.prepare('UPDATE users SET crForClass = NULL, manageAllClasses = 0 WHERE id = ?').run(prevHead.id);
    }
  } else {
    const prevCR = db.prepare('SELECT id FROM users WHERE role = ? AND crForClass = ?').get('cr_admin', cls);
    if (prevCR) {
      db.prepare('UPDATE users SET role = ?, crForClass = NULL, manageAllClasses = 0 WHERE id = ?').run('student', prevCR.id);
      const ps = db.prepare('SELECT id FROM students WHERE linkedUserId = ?').get(prevCR.id);
      if (ps) db.prepare('UPDATE students SET isCR = 0 WHERE id = ?').run(ps.id);
    }
  }
  let userAcc = db.prepare('SELECT * FROM users WHERE email = ? OR fullName = ? OR linkedStudentId = ?').get(student.email, student.name, studentId);
  let created = false;
  if (userAcc) {
    db.prepare('UPDATE users SET role=?, crForClass=?, manageAllClasses=?, linkedStudentId=? WHERE id=?')
      .run('cr_admin', isAll ? null : cls, isAll ? 1 : 0, studentId, userAcc.id);
    db.prepare('UPDATE students SET isCR=1, linkedUserId=? WHERE id=?').run(userAcc.id, studentId);
  } else {
    const uname = generateUniqueUsername(db, student.name);
    const pw = defaultPasswordFor('cr_admin');
    const r = db.prepare('INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(uname, student.email, bcrypt.hashSync(pw, 10), student.name, 'cr_admin', 'approved', cls, new Date().toISOString().slice(0, 10), studentId, isAll ? null : cls, isAll ? 1 : 0);
    userAcc = { id: r.lastInsertRowid, username: uname, password: pw, fullName: student.name };
    created = true;
    db.prepare('UPDATE students SET isCR=1, linkedUserId=? WHERE id=?').run(r.lastInsertRowid, studentId);
  }
  res.json({ success: true, created, account: created ? userAcc : undefined });
});

router.delete('/remove-cr', authMiddleware, requirePermission('assign_cr'), (req, res) => {
  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (student.linkedUserId) db.prepare('UPDATE users SET role=?, crForClass=NULL, manageAllClasses=0 WHERE id=?').run('student', student.linkedUserId);
  db.prepare('UPDATE students SET isCR=0 WHERE id=?').run(studentId);
  res.json({ success: true });
});

export default router;
