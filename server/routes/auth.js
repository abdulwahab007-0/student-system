import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { generateToken, authMiddleware, requirePermission } from '../middleware/auth.js';
import { defaultPasswordFor, generateUniqueUsername } from './defaults.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status !== 'approved') return res.status(403).json({ error: 'Account pending approval' });
  const token = generateToken(user);
  const { password: _, ...safe } = user;
  res.json({ token, user: safe });
});

router.post('/register', async (req, res) => {
  const { username, email, password, fullName, role, className } = req.body;
  if (!username || !email || !password || !fullName) return res.status(400).json({ error: 'All fields required' });
  const exists = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
  if (exists) return res.status(409).json({ error: 'Username or email already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const r = await db.run('INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate) VALUES (?,?,?,?,?,?,?,?)',
    [username, email, hash, fullName, role || 'student', 'pending', className || null, new Date().toISOString().slice(0, 10)]);
  res.json({ success: true, message: 'Registration submitted. Pending admin approval.', userId: r.lastInsertRowid });
});

router.put('/change-password', async (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  if (!userId || !oldPassword || !newPassword) return res.status(400).json({ error: 'All fields required' });
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(oldPassword, user.password)) return res.status(401).json({ error: 'Current password incorrect' });
  await db.run('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), userId]);
  res.json({ success: true });
});

router.put('/reset-password/:id', authMiddleware, requirePermission('reset_passwords'), async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const defaultPw = defaultPasswordFor(user.role);
  await db.run('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(defaultPw, 10), user.id]);
  res.json({ success: true, user: { id: user.id, username: user.username, password: defaultPw, fullName: user.fullName } });
});

router.post('/assign-cr', authMiddleware, requirePermission('assign_cr'), async (req, res) => {
  const { studentId, manageAllClasses } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const cls = student.className;
  const isAll = !!manageAllClasses;

  // Demote any previous CR occupying this role (per-class CR for the same class,
  // OR the previous head CR when assigning a new head CR).
  if (isAll) {
    const prevHead = await db.get('SELECT id FROM users WHERE role = ? AND manageAllClasses = 1', ['cr_admin']);
    if (prevHead) {
      await db.run('UPDATE users SET crForClass = NULL, manageAllClasses = 0 WHERE id = ?', [prevHead.id]);
    }
  } else {
    const prevCR = await db.get('SELECT id FROM users WHERE role = ? AND crForClass = ?', ['cr_admin', cls]);
    if (prevCR) {
      await db.run('UPDATE users SET role = ?, crForClass = NULL, manageAllClasses = 0 WHERE id = ?', ['student', prevCR.id]);
      const ps = await db.get('SELECT id FROM students WHERE linkedUserId = ?', [prevCR.id]);
      if (ps) await db.run('UPDATE students SET isCR = 0 WHERE id = ?', [ps.id]);
    }
  }
  let userAcc = await db.get('SELECT * FROM users WHERE email = ? OR fullName = ? OR linkedStudentId = ?', [student.email, student.name, studentId]);
  let created = false;
  if (userAcc) {
    await db.run('UPDATE users SET role=?, crForClass=?, manageAllClasses=?, linkedStudentId=? WHERE id=?',
      ['cr_admin', isAll ? null : cls, isAll ? 1 : 0, studentId, userAcc.id]);
    await db.run('UPDATE students SET isCR=1, linkedUserId=? WHERE id=?', [userAcc.id, studentId]);
  } else {
    const uname = await generateUniqueUsername(db, student.name);
    const pw = defaultPasswordFor('cr_admin');
    const r = await db.run('INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [uname, student.email, bcrypt.hashSync(pw, 10), student.name, 'cr_admin', 'approved', cls, new Date().toISOString().slice(0, 10), studentId, isAll ? null : cls, isAll ? 1 : 0]);
    userAcc = { id: r.lastInsertRowid, username: uname, password: pw, fullName: student.name };
    created = true;
    await db.run('UPDATE students SET isCR=1, linkedUserId=? WHERE id=?', [r.lastInsertRowid, studentId]);
  }
  res.json({ success: true, created, account: created ? userAcc : undefined });
});

router.delete('/remove-cr', authMiddleware, requirePermission('assign_cr'), async (req, res) => {
  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (student.linkedUserId) await db.run('UPDATE users SET role=?, crForClass=NULL, manageAllClasses=0 WHERE id=?', ['student', student.linkedUserId]);
  await db.run('UPDATE students SET isCR=0 WHERE id=?', [studentId]);
  res.json({ success: true });
});

export default router;
