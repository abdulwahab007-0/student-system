import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { defaultPasswordFor, generateUniqueUsername } from './defaults.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

// GET /api/users - all users
router.get('/', (req, res) => {
  const users = db.prepare('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses FROM users ORDER BY id').all();
  res.json(users);
});

// GET /api/users/pending
router.get('/pending', (req, res) => {
  const pending = db.prepare('SELECT id,username,email,fullName,role,status,className,registrationDate FROM users WHERE status = ? ORDER BY id').all('pending');
  res.json(pending);
});

// POST /api/users/:id/approve
router.post('/:id/approve', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run('approved', user.id);
  // If student, create student record
  if (user.role === 'student') {
    const exists = db.prepare('SELECT id FROM students WHERE email = ? OR name = ?').get(user.email, user.fullName);
    if (!exists) {
      const cnt = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
      const roll = 'STU-' + String(cnt + 1).padStart(3, '0');
      db.prepare('INSERT INTO students (name,email,phone,rollNo,className,gender,address,dateOfBirth,admissionDate,status) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(user.fullName, user.email, '', roll, user.className || 'BSCS', 'Male', '', '', new Date().toISOString().slice(0, 10), 'Active');
    }
  }
  res.json({ success: true });
});

// DELETE /api/users/:id/reject
router.delete('/:id/reject', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run('rejected', user.id);
  res.json({ success: true });
});

// POST /api/users/create-account (admin auto-creates an approved account)
router.post('/create-account', (req, res) => {
  try {
    const { fullName, email, role, className, linkedStudentId } = req.body;
    if (!fullName) return res.status(400).json({ error: 'fullName required' });
    const username = generateUniqueUsername(db, fullName);
    const existing = db.prepare('SELECT * FROM users WHERE email = ? OR fullName = ?').get(email, fullName);
    if (existing) {
      db.prepare('UPDATE users SET role=?, status=?, className=?, linkedStudentId=? WHERE id=?')
        .run(role || 'student', 'approved', className || existing.className, linkedStudentId || existing.linkedStudentId, existing.id);
      const updated = db.prepare('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses FROM users WHERE id=?').get(existing.id);
      return res.json({ success: true, created: false, account: updated });
    }
    // Check pending users
    const pending = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?').get(email, 'pending');
    if (pending) {
      db.prepare('UPDATE users SET role=?, status=?, className=?, linkedStudentId=? WHERE id=?')
        .run(role || 'student', 'approved', className || pending.className, linkedStudentId || null, pending.id);
      const updated = db.prepare('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses FROM users WHERE id=?').get(pending.id);
      return res.json({ success: true, created: false, upgradedFromPending: true, account: updated });
    }
    const defaultPw = defaultPasswordFor(role || 'student');
    const r = db.prepare('INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate,linkedStudentId) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(username, email || `${username}@ncba.edu.pk`, bcrypt.hashSync(defaultPw, 10), fullName, role || 'student', 'approved', className || null, new Date().toISOString().slice(0, 10), linkedStudentId || null);
    const user = db.prepare('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses FROM users WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, created: true, account: { ...user, password: defaultPw } });
  } catch (err) {
    console.error('Error creating account:', err);
    return res.status(500).json({ error: err.message || 'Failed to create account' });
  }
});

// GET /api/users/teacher-accounts - list teachers with their linked account status
router.get('/teacher-accounts', (req, res) => {
  const teachers = db.prepare('SELECT * FROM teachers ORDER BY id').all();
  const users = db.prepare("SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,linkedTeacherId FROM users WHERE status = 'approved'").all();
  const result = teachers.map(t => {
    const acc = users.find(u =>
      (u.linkedTeacherId && u.linkedTeacherId === t.id) ||
      (!u.linkedTeacherId && t.email && u.email && u.email.toLowerCase() === t.email.toLowerCase()) ||
      (!u.linkedTeacherId && t.name && u.fullName && u.fullName.toLowerCase() === t.name.toLowerCase())
    );
    return {
      ...t,
      account: acc
        ? { id: acc.id, username: acc.username, email: acc.email, role: acc.role, status: acc.status, registrationDate: acc.registrationDate }
        : null,
    };
  });
  res.json(result);
});

// GET /api/users/admin-accounts - list all system admins (super_admin)
router.get('/admin-accounts', (req, res) => {
  const admins = db.prepare("SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,linkedTeacherId FROM users WHERE role = ? ORDER BY id").all('super_admin');
  res.json(admins);
});

// POST /api/users/teachers/:id/grant-account - grant a teacher_admin login to a teacher
router.post('/teachers/:id/grant-account', (req, res) => {
  try {
    const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    // Find existing linked, or matching email/name account to upgrade
    let acc = db.prepare('SELECT * FROM users WHERE linkedTeacherId = ? OR email = ? OR fullName = ?').get(teacher.id, teacher.email || '', teacher.name);
    if (acc) {
      db.prepare('UPDATE users SET role=?, status=?, className=?, linkedTeacherId=? WHERE id=?')
        .run('teacher_admin', 'approved', teacher.className || acc.className, teacher.id, acc.id);
      const updated = db.prepare('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedTeacherId FROM users WHERE id=?').get(acc.id);
      return res.json({ success: true, created: false, account: updated });
    }
    const uname = generateUniqueUsername(db, teacher.name);
    const pw = defaultPasswordFor('teacher_admin');
    const r = db.prepare('INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate,linkedTeacherId) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(uname, teacher.email || `${uname}@ncba.edu.pk`, bcrypt.hashSync(pw, 10), teacher.name, 'teacher_admin', 'approved', teacher.className || null, new Date().toISOString().slice(0, 10), teacher.id);
    const user = db.prepare('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedTeacherId FROM users WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, created: true, account: { ...user, password: pw } });
  } catch (err) {
    console.error('grant teacher account error:', err);
    return res.status(500).json({ error: err.message || 'Failed to grant account' });
  }
});

// POST /api/users/admins - create a super_admin login
router.post('/admins', (req, res) => {
  try {
    const { fullName, email } = req.body;
    if (!fullName) return res.status(400).json({ error: 'fullName required' });
    const existing = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) OR lower(fullName)=lower(?)').get(email || '', fullName);
    if (existing) {
      if (existing.role === 'super_admin') return res.status(400).json({ error: 'An administrator with this name/email already exists.' });
      db.prepare('UPDATE users SET role=?, status=? WHERE id=?').run('super_admin', 'approved', existing.id);
      const updated = db.prepare('SELECT id,username,email,fullName,role,status,className,registrationDate FROM users WHERE id=?').get(existing.id);
      return res.json({ success: true, created: false, account: updated });
    }
    const uname = generateUniqueUsername(db, fullName);
    const pw = defaultPasswordFor('super_admin');
    const r = db.prepare('INSERT INTO users (username,email,password,fullName,role,status,registrationDate) VALUES (?,?,?,?,?,?,?)')
      .run(uname, email || `${uname}@ncba.edu.pk`, bcrypt.hashSync(pw, 10), fullName, 'super_admin', 'approved', new Date().toISOString().slice(0, 10));
    const user = db.prepare('SELECT id,username,email,fullName,role,status,className,registrationDate FROM users WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, created: true, account: { ...user, password: pw } });
  } catch (err) {
    console.error('create admin error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create administrator' });
  }
});

// DELETE /api/users/:id/revoke-account - demote a teacher_admin/super_admin to student (revoke access)
router.delete('/:id/revoke-account', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET role=?, crForClass=NULL, manageAllClasses=0 WHERE id=?').run('student', user.id);
  res.json({ success: true, user: { id: user.id, username: user.username, fullName: user.fullName, role: 'student' } });
});

// DELETE /api/users/:id - permanently remove a login account
router.delete('/:id', requirePermission('remove_users'), (req, res) => {
  const user = db.prepare('SELECT id,username,fullName,role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Prevent removing the seeded primary super admin
  if (user.username === 'admin') {
    return res.status(400).json({ error: 'The primary admin account cannot be removed.' });
  }
  // Prevent removing your own account
  if (req.user && req.user.id == user.id) {
    return res.status(400).json({ error: 'You cannot remove your own account.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ success: true, removed: { id: user.id, username: user.username, fullName: user.fullName } });
});


// POST /api/data/reset (moved to server init)
// Kept here for backwards-compat with the /api/users mount, but the real reset
// lives at /api/data/reset in server/index.js.
router.post('/data/reset', (req, res) => {
  const { initDatabase, seedDatabase } = requireIfAvailable();
  if (initDatabase) initDatabase();
  if (seedDatabase) seedDatabase();
  res.json({ success: true, message: 'Data reset to defaults' });
});

function requireIfAvailable() {
  try {
    return import('../db.js');
  } catch {
    return {};
  }
}

export default router;
