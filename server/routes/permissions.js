import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/permissions - returns overrides as { role: { rightKey: bool } }
router.get('/', async (req, res) => {
  const rows = await db.all('SELECT role, rightKey, granted FROM role_permissions');
  const overrides = {};
  for (const r of rows) {
    if (!overrides[r.role]) overrides[r.role] = {};
    overrides[r.role][r.rightKey] = !!r.granted;
  }
  res.json(overrides);
});

// PUT /api/permissions - save entire override map
router.put('/', async (req, res) => {
  const overrides = req.body || {};
  await db.exec('DELETE FROM role_permissions');
  const insertAll = db.transaction(async ({ run }) => {
    for (const [role, rights] of Object.entries(overrides)) {
      for (const [key, val] of Object.entries(rights)) {
        await run('INSERT INTO role_permissions (role, rightKey, granted) VALUES (?, ?, ?)', [role, key, val ? 1 : 0]);
      }
    }
  });
  await insertAll();
  res.json({ success: true });
});

// POST /api/permissions/reset - clear all overrides
router.post('/reset', async (req, res) => {
  await db.exec('DELETE FROM role_permissions');
  res.json({ success: true });
});

// ── Per-user permission overrides ──

// GET /api/permissions/users - returns { userId: { rightKey: bool } }
router.get('/users', async (req, res) => {
  const rows = await db.all('SELECT userId, rightKey, granted FROM user_permissions');
  const overrides = {};
  for (const r of rows) {
    if (!overrides[r.userId]) overrides[r.userId] = {};
    overrides[r.userId][r.rightKey] = !!r.granted;
  }
  res.json(overrides);
});

// PUT /api/permissions/users - save entire user override map
router.put('/users', async (req, res) => {
  const overrides = req.body || {};
  await db.exec('DELETE FROM user_permissions');
  const insertAll = db.transaction(async ({ run }) => {
    for (const [userId, rights] of Object.entries(overrides)) {
      for (const [key, val] of Object.entries(rights)) {
        await run('INSERT INTO user_permissions (userId, rightKey, granted) VALUES (?, ?, ?)', [Number(userId), key, val ? 1 : 0]);
      }
    }
  });
  await insertAll();
  res.json({ success: true });
});

// POST /api/permissions/users/reset - clear all user overrides
router.post('/users/reset', async (req, res) => {
  await db.exec('DELETE FROM user_permissions');
  res.json({ success: true });
});

export default router;
