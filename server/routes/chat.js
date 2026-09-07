import { Router } from 'express';
import db from '../db.js';
import { requirePermission, userHasRight } from '../middleware/auth.js';

const router = Router();

// SSE clients: Set of response objects
const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(payload); } catch { sseClients.delete(client); }
  }
}

// ── SSE stream ──────────────────────────────────────────────────────────
router.get('/stream', requirePermission('use_chat'), (req, res) => {
  // authMiddleware already verified the JWT via ?token= query param
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n'); // initial keepalive comment

  const client = { res };
  sseClients.add(client);
  req.on('close', () => sseClients.delete(client));
});

// ── Get messages for a channel ──────────────────────────────────────────
router.get('/messages/:channel', requirePermission('use_chat'), async (req, res) => {
  const { channel } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const before = req.query.before; // ISO datetime for pagination

  let sql = `SELECT id, userid AS "userId", username AS "userName", userrole AS "userRole",
             channel, message, createdat AS "createdAt"
             FROM chat_messages WHERE channel = ?`;
  const params = [channel];

  if (before) {
    sql += ' AND createdAt < ?';
    params.push(before);
  }

  sql += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(limit);

  try {
    const messages = (await db.all(sql, params)).reverse();
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Send a message ──────────────────────────────────────────────────────
router.post('/messages', requirePermission('use_chat'), async (req, res) => {
  const { channel, message } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  if (!channel || !message || !message.trim()) {
    return res.status(400).json({ error: 'Channel and message are required' });
  }

  if (!['public', 'announcements'].includes(channel)) {
    return res.status(400).json({ error: 'Invalid channel' });
  }

  if (message.trim().length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }

  // Announcements require the 'post_announcements' permission (User Rights page)
  if (channel === 'announcements' && !(await userHasRight(userId, userRole, 'post_announcements'))) {
    return res.status(403).json({ error: 'Only users with the Post Announcements permission can post announcements' });
  }

  // Look up user's fullName from DB (JWT doesn't include it)
  const userRow = await db.get('SELECT fullName FROM users WHERE id = ?', [userId]);
  const userName = userRow ? userRow.fullName : req.user.username;

  try {
    const result = await db.run(
      'INSERT INTO chat_messages (userId, userName, userRole, channel, message, createdAt) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))',
      [userId, userName, userRole, channel, message.trim()]
    );

    const newMsg = {
      id: result.lastInsertRowid,
      userId,
      userName,
      userRole,
      channel,
      message: message.trim(),
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };

    // Broadcast to all connected SSE clients — clients dedupe by message id
    // (so the sender's optimistic copy and the SSE copy collapse into one)
    broadcast('new-message', newMsg);

    res.json({ success: true, message: newMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete a message (admin only) ───────────────────────────────────────
router.delete('/messages/:id', requirePermission('use_chat'), async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;

  if (!['super_admin', 'cr_admin', 'teacher_admin'].includes(userRole)) {
    return res.status(403).json({ error: 'Only admins can delete messages' });
  }

  try {
    const msg = await db.get('SELECT * FROM chat_messages WHERE id = ?', [id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    await db.run('DELETE FROM chat_messages WHERE id = ?', [id]);

    broadcast('delete-message', { id: Number(id), channel: msg.channel });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
