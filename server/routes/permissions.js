import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/permissions - returns overrides as { role: { rightKey: bool } }
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT role, rightKey, granted FROM role_permissions').all();
  const overrides = {};
  for (const r of rows) {
    if (!overrides[r.role]) overrides[r.role] = {};
    overrides[r.role][r.rightKey] = !!r.granted;
  }
  res.json(overrides);
});

// PUT /api/permissions - save entire override map
router.put('/', (req, res) => {
  const overrides = req.body || {};
  db.exec('DELETE FROM role_permissions');
  const ins = db.prepare('INSERT INTO role_permissions (role, rightKey, granted) VALUES (?, ?, ?)');
  const insertAll = db.transaction(() => {
    for (const [role, rights] of Object.entries(overrides)) {
      for (const [key, val] of Object.entries(rights)) {
        ins.run(role, key, val ? 1 : 0);
      }
    }
  });
  insertAll();
  res.json({ success: true });
});

// POST /api/permissions/reset - clear all overrides
router.post('/reset', (req, res) => {
  db.exec('DELETE FROM role_permissions');
  res.json({ success: true });
});

// ── Per-user permission overrides ──

// GET /api/permissions/users - returns { userId: { rightKey: bool } }
router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT userId, rightKey, granted FROM user_permissions').all();
  const overrides = {};
  for (const r of rows) {
    if (!overrides[r.userId]) overrides[r.userId] = {};
    overrides[r.userId][r.rightKey] = !!r.granted;
  }
  res.json(overrides);
});

// PUT /api/permissions/users - save entire user override map
router.put('/users', (req, res) => {
  const overrides = req.body || {};
  db.exec('DELETE FROM user_permissions');
  const ins = db.prepare('INSERT INTO user_permissions (userId, rightKey, granted) VALUES (?, ?, ?)');
  const insertAll = db.transaction(() => {
    for (const [userId, rights] of Object.entries(overrides)) {
      for (const [key, val] of Object.entries(rights)) {
        ins.run(Number(userId), key, val ? 1 : 0);
      }
    }
  });
  insertAll();
  res.json({ success: true });
});

// POST /api/permissions/users/reset - clear all user overrides
router.post('/users/reset', (req, res) => {
  db.exec('DELETE FROM user_permissions');
  res.json({ success: true });
});

export default router;
