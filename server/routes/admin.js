import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { defaultPasswordFor, generateUniqueUsername } from './defaults.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

// GET /api/users - all users
router.get('/', async (req, res) => {
  const users = await db.all('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses FROM users ORDER BY id');
  res.json(users);
});

// GET /api/users/pending
router.get('/pending', async (req, res) => {
  const pending = await db.all('SELECT id,username,email,fullName,role,status,className,registrationDate FROM users WHERE status = ? ORDER BY id', ['pending']);
  res.json(pending);
});

// POST /api/users/:id/approve
router.post('/:id/approve', async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await db.run('UPDATE users SET status = ? WHERE id = ?', ['approved', user.id]);
  // If student, create student record
  if (user.role === 'student') {
    const exists = await db.get('SELECT id FROM students WHERE email = ? OR name = ?', [user.email, user.fullName]);
    if (!exists) {
      const cnt = await db.get('SELECT COUNT(*) as c FROM students');
      const roll = 'STU-' + String(cnt.c + 1).padStart(3, '0');
      await db.run('INSERT INTO students (name,email,phone,rollNo,className,gender,address,dateOfBirth,admissionDate,status) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [user.fullName, user.email, '', roll, user.className || 'BSCS', 'Male', '', '', new Date().toISOString().slice(0, 10), 'Active']);
    }
  }
  res.json({ success: true });
});

// DELETE /api/users/:id/reject
router.delete('/:id/reject', async (req, res) => {
  const user = await db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await db.run('UPDATE users SET status = ? WHERE id = ?', ['rejected', user.id]);
  res.json({ success: true });
});

// POST /api/users/create-account (admin auto-creates an approved account)
router.post('/create-account', async (req, res) => {
  try {
    const { fullName, email, role, className, linkedStudentId } = req.body;
    if (!fullName) return res.status(400).json({ error: 'fullName required' });
    const username = await generateUniqueUsername(db, fullName);
    const existing = await db.get('SELECT * FROM users WHERE email = ? OR fullName = ?', [email, fullName]);
    if (existing) {
      await db.run('UPDATE users SET role=?, status=?, className=?, linkedStudentId=? WHERE id=?',
        [role || 'student', 'approved', className || existing.className, linkedStudentId || existing.linkedStudentId, existing.id]);
      const updated = await db.get('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses FROM users WHERE id=?', [existing.id]);
      return res.json({ success: true, created: false, account: updated });
    }
    // Check pending users
    const pending = await db.get('SELECT * FROM users WHERE email = ? AND status = ?', [email, 'pending']);
    if (pending) {
      await db.run('UPDATE users SET role=?, status=?, className=?, linkedStudentId=? WHERE id=?',
        [role || 'student', 'approved', className || pending.className, linkedStudentId || null, pending.id]);
      const updated = await db.get('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses FROM users WHERE id=?', [pending.id]);
      return res.json({ success: true, created: false, upgradedFromPending: true, account: updated });
    }
    const defaultPw = defaultPasswordFor(role || 'student');
    const r = await db.run('INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate,linkedStudentId) VALUES (?,?,?,?,?,?,?,?,?)',
      [username, email || `${username}@ncba.edu.pk`, bcrypt.hashSync(defaultPw, 10), fullName, role || 'student', 'approved', className || null, new Date().toISOString().slice(0, 10), linkedStudentId || null]);
    const user = await db.get('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,crForClass,manageAllClasses FROM users WHERE id=?', [r.lastInsertRowid]);
    res.json({ success: true, created: true, account: { ...user, password: defaultPw } });
  } catch (err) {
    console.error('Error creating account:', err);
    return res.status(500).json({ error: err.message || 'Failed to create account' });
  }
});

// GET /api/users/teacher-accounts - list teachers with their linked account status
router.get('/teacher-accounts', async (req, res) => {
  const teachers = await db.all('SELECT * FROM teachers ORDER BY id');
  const users = await db.all("SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,linkedTeacherId FROM users WHERE status = 'approved'");
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
router.get('/admin-accounts', async (req, res) => {
  const admins = await db.all("SELECT id,username,email,fullName,role,status,className,registrationDate,linkedStudentId,linkedTeacherId FROM users WHERE role = ? ORDER BY id", ['super_admin']);
  res.json(admins);
});

// POST /api/users/teachers/:id/grant-account - grant a teacher_admin login to a teacher
router.post('/teachers/:id/grant-account', async (req, res) => {
  try {
    const teacher = await db.get('SELECT * FROM teachers WHERE id = ?', [req.params.id]);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    // Find existing linked, or matching email/name account to upgrade
    let acc = await db.get('SELECT * FROM users WHERE linkedTeacherId = ? OR email = ? OR fullName = ?', [teacher.id, teacher.email || '', teacher.name]);
    if (acc) {
      await db.run('UPDATE users SET role=?, status=?, className=?, linkedTeacherId=? WHERE id=?',
        ['teacher_admin', 'approved', teacher.className || acc.className, teacher.id, acc.id]);
      const updated = await db.get('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedTeacherId FROM users WHERE id=?', [acc.id]);
      return res.json({ success: true, created: false, account: updated });
    }
    const uname = await generateUniqueUsername(db, teacher.name);
    const pw = defaultPasswordFor('teacher_admin');
    const r = await db.run('INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate,linkedTeacherId) VALUES (?,?,?,?,?,?,?,?,?)',
      [uname, teacher.email || `${uname}@ncba.edu.pk`, bcrypt.hashSync(pw, 10), teacher.name, 'teacher_admin', 'approved', teacher.className || null, new Date().toISOString().slice(0, 10), teacher.id]);
    const user = await db.get('SELECT id,username,email,fullName,role,status,className,registrationDate,linkedTeacherId FROM users WHERE id=?', [r.lastInsertRowid]);
    res.json({ success: true, created: true, account: { ...user, password: pw } });
  } catch (err) {
    console.error('grant teacher account error:', err);
    return res.status(500).json({ error: err.message || 'Failed to grant account' });
  }
});

// POST /api/users/admins - create a super_admin login
router.post('/admins', async (req, res) => {
  try {
    const { fullName, email } = req.body;
    if (!fullName) return res.status(400).json({ error: 'fullName required' });
    const existing = await db.get('SELECT * FROM users WHERE lower(email)=lower(?) OR lower(fullName)=lower(?)', [email || '', fullName]);
    if (existing) {
      if (existing.role === 'super_admin') return res.status(400).json({ error: 'An administrator with this name/email already exists.' });
      await db.run('UPDATE users SET role=?, status=? WHERE id=?', ['super_admin', 'approved', existing.id]);
      const updated = await db.get('SELECT id,username,email,fullName,role,status,className,registrationDate FROM users WHERE id=?', [existing.id]);
      return res.json({ success: true, created: false, account: updated });
    }
    const uname = await generateUniqueUsername(db, fullName);
    const pw = defaultPasswordFor('super_admin');
    const r = await db.run('INSERT INTO users (username,email,password,fullName,role,status,registrationDate) VALUES (?,?,?,?,?,?,?)',
      [uname, email || `${uname}@ncba.edu.pk`, bcrypt.hashSync(pw, 10), fullName, 'super_admin', 'approved', new Date().toISOString().slice(0, 10)]);
    const user = await db.get('SELECT id,username,email,fullName,role,status,className,registrationDate FROM users WHERE id=?', [r.lastInsertRowid]);
    res.json({ success: true, created: true, account: { ...user, password: pw } });
  } catch (err) {
    console.error('create admin error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create administrator' });
  }
});

// DELETE /api/users/:id/revoke-account - demote a teacher_admin/super_admin to student (revoke access)
router.delete('/:id/revoke-account', async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await db.run('UPDATE users SET role=?, crForClass=NULL, manageAllClasses=0 WHERE id=?', ['student', user.id]);
  res.json({ success: true, user: { id: user.id, username: user.username, fullName: user.fullName, role: 'student' } });
});

// DELETE /api/users/:id - permanently remove a login account
router.delete('/:id', requirePermission('remove_users'), async (req, res) => {
  const user = await db.get('SELECT id,username,fullName,role FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Prevent removing the seeded primary super admin
  if (user.username === 'admin') {
    return res.status(400).json({ error: 'The primary admin account cannot be removed.' });
  }
  // Prevent removing your own account
  if (req.user && req.user.id == user.id) {
    return res.status(400).json({ error: 'You cannot remove your own account.' });
  }
  await db.run('DELETE FROM users WHERE id = ?', [user.id]);
  res.json({ success: true, removed: { id: user.id, username: user.username, fullName: user.fullName } });
});


// POST /api/data/reset (moved to server init)
// Kept here for backwards-compat with the /api/users mount, but the real reset
// lives at /api/data/reset in server/index.js.
router.post('/data/reset', async (req, res) => {
  const mod = await requireIfAvailable();
  if (mod.initDatabase) await mod.initDatabase();
  if (mod.seedDatabase) await mod.seedDatabase();
  res.json({ success: true, message: 'Data reset to defaults' });
});

async function requireIfAvailable() {
  try {
    return await import('../db.js');
  } catch {
    return {};
  }
}

export default router;
