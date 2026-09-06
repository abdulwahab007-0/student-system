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

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function detectImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// Teachers are derived from the teachers table + subjects.teacher field
// This ensures teachers added via subject assignment appear in the card module
function listTeacherNames() {
  const fromTable = db.prepare("SELECT name FROM teachers WHERE name IS NOT NULL AND trim(name) != ''").all()
    .map(t => t.name.trim());
  const fromSubjects = db.prepare("SELECT DISTINCT teacher FROM subjects WHERE teacher IS NOT NULL AND trim(teacher) != ''").all()
    .map(s => (s.teacher || '').trim());
  return [...new Set([...fromTable, ...fromSubjects])]
    .filter(n => n.toLowerCase() !== 'nill')
    .sort((a, b) => a.localeCompare(b));
}

function teacherInfo(name) {
  const enrolled = db.prepare("SELECT DISTINCT name, code, className FROM subjects WHERE trim(teacher) = ?").all(name);
  const subjects = enrolled.map(s => ({ name: s.name, code: s.code, className: s.className }));
  const classes = [...new Set(enrolled.map(s => s.className).filter(Boolean))];
  return { name, subjects, className: classes.join(', ') };
}

function ensureCardRow(teacherName) {
  let row = db.prepare('SELECT * FROM teacher_cards WHERE teacherName = ?').get(teacherName);
  if (!row) {
    db.prepare('INSERT INTO teacher_cards (teacherName, cardStatus, updatedAt) VALUES (?, ?, ?)')
      .run(teacherName, 'none', new Date().toISOString());
    row = db.prepare('SELECT * FROM teacher_cards WHERE teacherName = ?').get(teacherName);
  }
  return row;
}

function deleteOldPhoto(photoUrl) {
  if (photoUrl && photoUrl.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '..', '..', photoUrl.replace(/^\//, ''));
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}

// GET / — every known teacher with their card state
router.get('/', requirePermission('view_teacher_cards'), (req, res) => {
  try {
    const names = listTeacherNames();
    const rows = names.map(name => {
      const info = teacherInfo(name);
      const card = ensureCardRow(name);
      return {
        name,
        className: info.className,
        subjects: info.subjects,
        cardId: card.id,
        photoUrl: card.photoUrl,
        photoMime: card.photoMime,
        cardStatus: card.cardStatus || 'none',
        reviewNote: card.reviewNote,
        reviewedBy: card.reviewedBy,
        issuedAt: card.issuedAt,
      };
    });
    res.json(rows);
  } catch (err) {
    console.error('Error listing teacher cards:', err);
    return res.status(500).json({ error: err.message || 'Failed to load teacher cards' });
  }
});

// GET /my — logged-in teacher's own card
router.get('/my', requirePermission('view_own_teacher_card'), (req, res) => {
  try {
    const user = db.prepare('SELECT fullName, linkedTeacherId FROM users WHERE id = ?').get(req.user.id);
    let teacherName = null;
    if (user && user.linkedTeacherId) {
      const t = db.prepare('SELECT name FROM teachers WHERE id = ?').get(user.linkedTeacherId);
      if (t) teacherName = t.name;
    }
    if (!teacherName && user) {
      const found = listTeacherNames().find(n => n.toLowerCase() === (user.fullName || '').toLowerCase());
      if (found) teacherName = found;
    }
    if (!teacherName) {
      return res.json({ linked: false, message: 'No teacher profile is linked to this account.' });
    }
    const info = teacherInfo(teacherName);
    const card = ensureCardRow(teacherName);
    res.json({ linked: true, teacher: { name: teacherName, className: info.className, subjects: info.subjects }, card });
  } catch (err) {
    console.error('Error loading own teacher card:', err);
    return res.status(500).json({ error: err.message || 'Failed to load your card' });
  }
});

// POST /upload/:name — raw image bytes (JPG/PNG/WebP) via express.raw.
// Managers may upload for any teacher; a teacher may only upload their own photo.
router.post('/upload/:name',
  (req, res, next) => {
    if (userHasRight(req.user.id, req.user.role, 'upload_teacher_card_photos')) return next();
    if (userHasRight(req.user.id, req.user.role, 'upload_own_teacher_card_photo')) {
      const name = decodeURIComponent(req.params.name).trim();
      const user = db.prepare('SELECT fullName, linkedTeacherId FROM users WHERE id = ?').get(req.user.id);
      let isSelf = user && user.fullName === name;
      if (!isSelf && user && user.linkedTeacherId) {
        const t = db.prepare('SELECT name FROM teachers WHERE id = ?').get(user.linkedTeacherId);
        if (t && t.name === name) isSelf = true;
      }
      if (isSelf) return next();
      return res.status(403).json({ error: 'You can only upload your own card photo.' });
    }
    return res.status(403).json({ error: 'You do not have permission to upload card photos' });
  },
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }),
  (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name).trim();
      const known = listTeacherNames();
      if (!known.includes(name)) {
        return res.status(404).json({ error: 'Teacher not found. Add the teacher to a subject first.' });
      }

      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length < 24) {
        return res.status(400).json({ error: 'Please select a valid photo file (JPG, PNG or WebP).' });
      }
      const ext = detectImageType(buf);
      if (!ext) {
        return res.status(400).json({ error: 'Unsupported image. Please upload a JPG, PNG or WebP photo.' });
      }

      const safeName = name.replace(/[^a-zA-Z0-9]+/g, '_');
      const filename = `teacher_${safeName}_${Date.now()}.${ext}`;
      const filePath = path.join(UPLOAD_DIR, filename);
      fs.writeFileSync(filePath, buf);

      const existing = ensureCardRow(name);
      deleteOldPhoto(existing.photoUrl);

      db.prepare('UPDATE teacher_cards SET photoUrl=?, photoMime=?, cardStatus=?, reviewNote=?, reviewedBy=?, issuedAt=?, updatedAt=? WHERE id=?')
        .run(`/uploads/cards/${filename}`, `image/${ext === 'jpg' ? 'jpeg' : ext}`, 'pending', null, null, null, new Date().toISOString(), existing.id);

      const card = db.prepare('SELECT * FROM teacher_cards WHERE id = ?').get(existing.id);
      res.json({ success: true, card, message: 'Photo uploaded. Awaiting approval before the card can be issued.' });
    } catch (err) {
      console.error('Error uploading teacher card photo:', err);
      return res.status(500).json({ error: err.message || 'Failed to save photo' });
    }
  });

// PUT /:id/approve — approve the photo so the card is ready to issue
router.put('/:id/approve', requirePermission('approve_teacher_card_photos'), (req, res) => {
  try {
    const card = db.prepare('SELECT * FROM teacher_cards WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card record not found' });
    if (!card.photoUrl) return res.status(400).json({ error: 'No photo uploaded yet for this teacher' });
    db.prepare('UPDATE teacher_cards SET cardStatus=?, reviewNote=?, reviewedBy=?, issuedAt=?, updatedAt=? WHERE id=?')
      .run('approved', null, req.user.username, new Date().toISOString().slice(0, 10), new Date().toISOString(), card.id);
    const updated = db.prepare('SELECT * FROM teacher_cards WHERE id = ?').get(card.id);
    res.json({ success: true, card: updated, message: 'Photo approved — the ID card is now ready to issue.' });
  } catch (err) {
    console.error('Error approving teacher card photo:', err);
    return res.status(500).json({ error: err.message || 'Failed to approve card photo' });
  }
});

// PUT /:id/reject — reject the photo; teacher must upload a correct one
router.put('/:id/reject', requirePermission('approve_teacher_card_photos'), (req, res) => {
  try {
    const card = db.prepare('SELECT * FROM teacher_cards WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card record not found' });
    const note = (((req.body || {}).note) || '').toString().trim()
      || 'Photo does not meet the requirements. Please upload a clear photo of the teacher.';
    db.prepare('UPDATE teacher_cards SET cardStatus=?, reviewNote=?, reviewedBy=?, issuedAt=?, updatedAt=? WHERE id=?')
      .run('rejected', note, req.user.username, null, new Date().toISOString(), card.id);
    const updated = db.prepare('SELECT * FROM teacher_cards WHERE id = ?').get(card.id);
    res.json({ success: true, card: updated, message: 'Photo rejected. The teacher needs to upload a correct photo.' });
  } catch (err) {
    console.error('Error rejecting teacher card photo:', err);
    return res.status(500).json({ error: err.message || 'Failed to reject card photo' });
  }
});

export default router;

