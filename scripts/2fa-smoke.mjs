// E2E smoke test: full TOTP 2FA flow against the real Express app (SQLite backend)
import Database from 'better-sqlite3';
import { authenticator } from 'otplib';
import app from '../server/app.js';
import { initDatabase } from '../server/db.js';

// Apply schema migrations (adds the 2FA columns to the existing DB), then give a
// fresh 2FA slate so the test exercises the whole flow deterministically.
await initDatabase();
const sqlite = new Database('./database.sqlite');
sqlite.prepare("UPDATE users SET twoFactorEnabled=0, twoFactorSecret=NULL WHERE username IN ('admin','student')").run();
sqlite.close();

const BASE = 'http://localhost:3199';
const server = app.listen(3199);
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, data: await r.json() }));

let failed = false;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : '')); if (!cond) failed = true; };

try {
  await new Promise(r => server.on('listening', r));

  // 1) Wrong password still rejected
  let r = await post('/api/auth/login', { username: 'admin', password: 'wrong' });
  ok('wrong password rejected', r.status === 401);

  // 2) First admin login → setup mode with QR
  r = await post('/api/auth/login', { username: 'admin', password: 'admin123' });
  ok('admin first login returns twoFactor=setup', r.data.twoFactor === 'setup');
  ok('setup provides base32 secret', /^[A-Z2-7]{16,}$/.test(r.data.secret || ''));
  ok('setup provides otpauth URL', (r.data.otpauthUrl || '').startsWith('otpauth://totp/'));
  ok('setup provides a QR data URL', (r.data.qrDataUrl || '').startsWith('data:image/png;base64,'));
  ok('setup does NOT issue a token', !r.data.token);
  const secret = r.data.secret;

  // 3) Wrong OTP rejected
  r = await post('/api/auth/2fa/verify', { username: 'admin', otp: '000000' });
  ok('wrong OTP rejected', r.status === 401);

  // 4) Correct OTP from the same secret → activates 2FA + issues token
  const totp = authenticator.generate(secret);
  r = await post('/api/auth/2fa/verify', { username: 'admin', otp: totp });
  ok('correct OTP activates + returns token', !!r.data.token && r.data.twoFactorJustSetup === true);
  ok('token response does not leak secret', !('twoFactorSecret' in (r.data.user || {})));
  const token = r.data.token;

  // 5) Token actually works against a protected route
  const boot = await fetch(BASE + '/api/bootstrap', { headers: { Authorization: 'Bearer ' + token } });
  ok('issued token authorizes /api/bootstrap', boot.status === 200);

  // 6) Second login now demands the OTP (verify mode)
  r = await post('/api/auth/login', { username: 'admin', password: 'admin123' });
  ok('second admin login returns twoFactor=verify', r.data.twoFactor === 'verify');
  ok('verify mode does not re-expose the secret/QR', !r.data.secret && !r.data.qrDataUrl);
  ok('verify mode does not issue a token', !r.data.token);

  // 7) Re-entering the OTP completes the login
  r = await post('/api/auth/2fa/verify', { username: 'admin', otp: authenticator.generate(secret) });
  ok('OTP completes subsequent login', !!r.data.token && r.data.twoFactorJustSetup === false);

  // 8) Other admins are also forced through setup (cr.admin)
  r = await post('/api/auth/login', { username: 'cr.admin', password: 'cr123' });
  ok('other admins also forced through setup', r.data.twoFactor === 'setup');

  // 9) Students are NOT forced through 2FA (seed student username: ahmed.khan)
  const sdb = new Database('./database.sqlite');
  sdb.prepare("UPDATE users SET status='approved' WHERE username='ahmed.khan'").run();
  sdb.close();
  r = await post('/api/auth/login', { username: 'ahmed.khan', password: 'student123' });
  ok('student login is single-step (no 2FA)', !!r.data.token && !r.data.twoFactor);

  // 10) Non-6-digit code rejected with 400
  r = await post('/api/auth/2fa/verify', { username: 'admin', otp: '123' });
  ok('short OTP rejected', r.status === 400);

  // 11) Rate limiting: 5+ failed attempts blocks
  for (let i = 0; i < 5; i++) await post('/api/auth/2fa/verify', { username: 'admin', otp: '111111' });
  r = await post('/api/auth/2fa/verify', { username: 'admin', otp: '111111' });
  ok('brute-force throttle blocks after 5 failures', r.status === 429);

  // cleanup: reset 2FA so manual QA can re-run the setup flow
  const db2 = new Database('./database.sqlite');
  db2.prepare("UPDATE users SET twoFactorEnabled=0, twoFactorSecret=NULL WHERE username IN ('admin','cr.admin')").run();
  db2.prepare("UPDATE users SET status='pending' WHERE username='ahmed.khan'").run();
  db2.close();
} catch (err) {
  console.error('SMOKE TEST CRASHED:', err);
  failed = true;
} finally {
  server.close();
  console.log(failed ? '\nRESULT: FAILURES' : '\nRESULT: ALL PASSED');
  process.exit(failed ? 1 : 0);
}