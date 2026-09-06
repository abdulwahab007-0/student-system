import { Router } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { requirePermission, userHasRight } from '../middleware/auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'cards');

// Ensure the photo upload folder exists before any file writes
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Helpers ──
// Verify the real image format from the bytes themselves (avoids spoofed extensions)
function detectImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// A 1:1 card record always exists per student so the issuing workflow is predictable
function ensureCardRow(studentId) {
  let row = db.prepare('SELECT * FROM student_cards WHERE studentId = ?').get(studentId);
  if (!row) {
    db.prepare('INSERT INTO student_cards (studentId, cardStatus, updatedAt) VALUES (?, ?, ?)')
      .run(studentId, 'none', new Date().toISOString());
    row = db.prepare('SELECT * FROM student_cards WHERE studentId = ?').get(studentId);
  }
  return row;
}

function deleteOldPhoto(photoUrl) {
  if (photoUrl && photoUrl.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '..', '..', photoUrl.replace(/^\//, ''));
    try { fs.unlinkSync(filePath); } catch { /* already gone — ignore */ }
  }
}

// GET /api/cards — every student together with their card / photo approval state
router.get('/', requirePermission('view_student_cards'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT s.id, s.name, s.email, s.rollNo, s.className, s.isCR,
             c.id AS cardId, c.photoUrl, c.photoMime, c.cardStatus,
             c.reviewNote, c.reviewedBy, c.issuedAt, c.updatedAt
      FROM students s
      LEFT JOIN student_cards c ON c.studentId = s.id
      ORDER BY s.id
    `).all();
    res.json(rows.map(r => ({ ...r, isCR: !!r.isCR, cardStatus: r.cardStatus || 'none' })));
  } catch (err) {
    console.error('Error listing student cards:', err);
    return res.status(500).json({ error: err.message || 'Failed to load student cards' });
  }
});

// GET /api/cards/my — the logged-in user's own card (students and CR are both students)
router.get('/my', requirePermission('view_own_card'), (req, res) => {
  try {
    const user = db.prepare('SELECT linkedStudentId, fullName FROM users WHERE id = ?').get(req.user.id);
    if (!user || !user.linkedStudentId) {
      return res.json({ linked: false, message: 'No student profile is linked to this account.' });
    }
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(user.linkedStudentId);
    if (!student) return res.json({ linked: false, message: 'Linked student record not found.' });
    const card = ensureCardRow(student.id);
    res.json({ linked: true, student, card });
  } catch (err) {
    console.error('Error loading own card:', err);
    return res.status(500).json({ error: err.message || 'Failed to load your card' });
  }
});

// POST /api/cards/upload/:studentId — raw image bytes (JPG/PNG/WebP) via express.raw.
// Managers may upload for any student; students (incl. CR) may upload their own photo.
router.post('/upload/:studentId',
  (req, res, next) => {
    if (userHasRight(req.user.id, req.user.role, 'upload_card_photos')) return next();
    if (userHasRight(req.user.id, req.user.role, 'upload_own_card_photo')) {
      const u = db.prepare('SELECT linkedStudentId FROM users WHERE id = ?').get(req.user.id);
      if (u && String(u.linkedStudentId) === String(req.params.studentId)) return next();
      return res.status(403).json({ error: 'You can only upload your own card photo.' });
    }
    return res.status(403).json({ error: 'You do not have permission to upload card photos' });
  },
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }),
  (req, res) => {
    try {
      const studentId = Number(req.params.studentId);
      const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length < 24) {
        return res.status(400).json({ error: 'Please select a valid photo file (JPG, PNG or WebP).' });
      }
      const ext = detectImageType(buf);
      if (!ext) {
        return res.status(400).json({ error: 'Unsupported image. Please upload a JPG, PNG or WebP photo.' });
      }

      const filename = `${studentId}_${Date.now()}.${ext}`;
      const filePath = path.join(UPLOAD_DIR, filename);
      fs.writeFileSync(filePath, buf);

      const existing = ensureCardRow(studentId);
      deleteOldPhoto(existing.photoUrl);

      db.prepare('UPDATE student_cards SET photoUrl=?, photoMime=?, cardStatus=?, reviewNote=?, reviewedBy=?, issuedAt=?, updatedAt=? WHERE id=?')
        .run(`/uploads/cards/${filename}`, `image/${ext === 'jpg' ? 'jpeg' : ext}`, 'pending', null, null, null, new Date().toISOString(), existing.id);

      const card = db.prepare('SELECT * FROM student_cards WHERE id = ?').get(existing.id);
      res.json({ success: true, card, message: 'Photo uploaded. Awaiting approval before the card can be issued.' });
    } catch (err) {
      console.error('Error uploading card photo:', err);
      return res.status(500).json({ error: err.message || 'Failed to save photo' });
    }
  });

// PUT /api/cards/:id/approve — approve the photo so the card is ready to issue
router.put('/:id/approve', requirePermission('approve_card_photos'), (req, res) => {
  try {
    const card = db.prepare('SELECT * FROM student_cards WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card record not found' });
    if (!card.photoUrl) return res.status(400).json({ error: 'No photo uploaded yet for this student' });
    db.prepare('UPDATE student_cards SET cardStatus=?, reviewNote=?, reviewedBy=?, issuedAt=?, updatedAt=? WHERE id=?')
      .run('approved', null, req.user.username, new Date().toISOString().slice(0, 10), new Date().toISOString(), card.id);
    const updated = db.prepare('SELECT * FROM student_cards WHERE id = ?').get(card.id);
    res.json({ success: true, card: updated, message: 'Photo approved — the ID card is now ready to issue.' });
  } catch (err) {
    console.error('Error approving card photo:', err);
    return res.status(500).json({ error: err.message || 'Failed to approve card photo' });
  }
});

// PUT /api/cards/:id/reject — reject the photo; student must upload a correct one
router.put('/:id/reject', requirePermission('approve_card_photos'), (req, res) => {
  try {
    const card = db.prepare('SELECT * FROM student_cards WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card record not found' });
    const note = (((req.body || {}).note) || '').toString().trim()
      || 'Photo does not meet the requirements. Please upload a clear photo of the student.';
    db.prepare('UPDATE student_cards SET cardStatus=?, reviewNote=?, reviewedBy=?, issuedAt=?, updatedAt=? WHERE id=?')
      .run('rejected', note, req.user.username, null, new Date().toISOString(), card.id);
    const updated = db.prepare('SELECT * FROM student_cards WHERE id = ?').get(card.id);
    res.json({ success: true, card: updated, message: 'Photo rejected. The student needs to upload a correct photo.' });
  } catch (err) {
    console.error('Error rejecting card photo:', err);
    return res.status(500).json({ error: err.message || 'Failed to reject card photo' });
  }
});

export default router;