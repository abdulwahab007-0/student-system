import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { generateToken, authMiddleware, requirePermission } from '../middleware/auth.js';
import { defaultPasswordFor, generateUniqueUsername } from './defaults.js';
import otplibPkg from 'otplib';
import QRCode from 'qrcode';

const authenticator = otplibPkg.authenticator || otplibPkg.default?.authenticator;
const ISSUER = 'NCBA e-Student System';

// Roles that are forced through two-factor authentication (TOTP). Students
// keep the normal single-step login.
const ADMIN_ROLES = ['super_admin', 'teacher_admin', 'cr_admin'];

// Simple in-memory throttling for the 2FA endpoint. Serverless instances run
// a short lifetime, so this is a best-effort brute-force guard (per instance),
// not a replacement for a proper rate limiter on the edge.
const twoFactorAttempts = new Map(); // key → { fails, blockedUntil }
function twoFactorThrottled(key) {
  const now = Date.now();
  const rec = twoFactorAttempts.get(key);
  if (rec && rec.blockedUntil > now) return { blocked: true, retryInMs: rec.blockedUntil - now };
  if (rec && rec.fails >= 5) {
    rec.blockedUntil = now + 60_000; // lock for 60s after 5 failed codes
    rec.fails = 0;
    return { blocked: true, retryInMs: rec.blockedUntil - now };
  }
  return { blocked: false };
}
function twoFactorRecordFailure(key) {
  const rec = twoFactorAttempts.get(key) || { fails: 0, blockedUntil: 0 };
  rec.fails += 1;
  twoFactorAttempts.set(key, rec);
}
function twoFactorClearFailure(key) {
  twoFactorAttempts.delete(key);
}

// Never leak the TOTP secret (or password hash) back to clients in normal
// API responses. The raw secret IS returned once, during the QR setup step,
// so admins can type it in manually if their camera fails.
function toSafeUser(user) {
  const { password, twoFactorSecret, ...safe } = user;
  return safe;
}

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status !== 'approved') return res.status(403).json({ error: 'Account pending approval' });

  // ── Two-factor authentication ──────────────────────────────────────────
  if (user.twoFactorEnabled) {
    // 2FA already configured — refuse to issue a token until the OTP matches.
    return res.json({ twoFactor: 'verify', username: user.username, fullName: user.fullName });
  }

  if (ADMIN_ROLES.includes(user.role)) {
    // First-time admin login → generate (and persist) a TOTP secret, show the
    // QR code, and only issue a token after the scanned code is verified.
    let secret = user.twoFactorSecret;
    if (!secret) {
      secret = authenticator.generateSecret();
      await db.run('UPDATE users SET twoFactorSecret = ? WHERE id = ?', [secret, user.id]);
      user.twoFactorSecret = secret;
    }
    const otpauthUrl = authenticator.keyuri(user.username, ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 240, margin: 1, errorCorrectionLevel: 'M' });
    return res.json({
      twoFactor: 'setup',
      username: user.username,
      fullName: user.fullName,
      secret,
      otpauthUrl,
      qrDataUrl,
    });
  }

  // Regular (student) login — unchanged behaviour.
  const token = generateToken(user);
  res.json({ token, user: toSafeUser(user) });
});

// POST /api/auth/2fa/verify
// Verifies a TOTP code for an admin. Works for BOTH states:
//   • twoFactorEnabled = 0 → first-time setup: activating 2FA
//   • twoFactorEnabled = 1 → subsequent logins: entering the OTP
// On success the normal session token is issued (same as a plain login).
router.post('/2fa/verify', async (req, res) => {
  const { username, otp } = req.body;
  if (!username || !otp) return res.status(400).json({ error: 'Username and code required' });
  const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.twoFactorSecret) {
    return res.status(400).json({ error: 'Two-factor authentication is not set up for this account' });
  }

  const throttle = twoFactorThrottled(String(user.id));
  if (throttle.blocked) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in a moment.' });
  }

  const code = String(otp).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit code shown in your authenticator app' });
  }

  let verified = false;
  try {
    verified = authenticator.verify({ token: code, secret: user.twoFactorSecret, window: 1 });
  } catch { /* malformed secret → treated as invalid below */ }

  if (!verified) {
    twoFactorRecordFailure(String(user.id));
    return res.status(401).json({ error: 'Incorrect code. Check your authenticator app and try again.' });
  }

  twoFactorClearFailure(String(user.id));

  // First successful code → activate 2FA for this account.
  const twoFactorJustSetup = !user.twoFactorEnabled;
  if (twoFactorJustSetup) {
    await db.run('UPDATE users SET twoFactorEnabled = 1 WHERE id = ?', [user.id]);
  }

  const token = generateToken(user);
  res.json({ token, user: toSafeUser(user), twoFactorJustSetup });
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

// PUT /api/auth/reset-2fa/:id
// Clears an admin's TOTP secret and disables 2FA so they can re-set up their
// authenticator app at their next login (lost/broken phone recovery).
// Guarded by the 'reset_2fa' right — configurable per role or per user from the
// User Rights page.
router.put('/reset-2fa/:id', authMiddleware, requirePermission('reset_2fa'), async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await db.run('UPDATE users SET twoFactorSecret = NULL, twoFactorEnabled = 0 WHERE id = ?', [user.id]);
  res.json({ success: true, user: { id: user.id, username: user.username, fullName: user.fullName } });
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
