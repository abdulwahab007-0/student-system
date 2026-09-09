import { Router } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { requirePermission, userHasRight } from '../middleware/auth.js';
import { UPLOAD_DIR, ensureUploadDir } from '../uploadUtils.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

ensureUploadDir();

function detectImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// Teachers are derived from the teachers table + subjects.teacher field
// This ensures teachers added via subject assignment appear in the card module
async function listTeacherNames() {
  const fromTable = (await db.all("SELECT name FROM teachers WHERE name IS NOT NULL AND trim(name) != ''"))
    .map(t => t.name.trim());
  const fromSubjects = (await db.all("SELECT DISTINCT teacher FROM subjects WHERE teacher IS NOT NULL AND trim(teacher) != ''"))
    .map(s => (s.teacher || '').trim());
  return [...new Set([...fromTable, ...fromSubjects])]
    .filter(n => n.toLowerCase() !== 'nill')
    .sort((a, b) => a.localeCompare(b));
}

async function teacherInfo(name) {
  const enrolled = await db.all("SELECT DISTINCT name, code, className FROM subjects WHERE trim(teacher) = ?", [name]);
  const subjects = enrolled.map(s => ({ name: s.name, code: s.code, className: s.className }));
  const classes = [...new Set(enrolled.map(s => s.className).filter(Boolean))];
  return { name, subjects, className: classes.join(', ') };
}

async function ensureCardRow(teacherName) {
  let row = await db.get('SELECT * FROM teacher_cards WHERE teacherName = ?', [teacherName]);
  if (!row) {
    await db.run('INSERT INTO teacher_cards (teacherName, cardStatus, updatedAt) VALUES (?, ?, ?)',
      [teacherName, 'none', new Date().toISOString()]);
    row = await db.get('SELECT * FROM teacher_cards WHERE teacherName = ?', [teacherName]);
  }
  return row;
}

function deleteOldPhoto(photoUrl) {
  if (photoUrl && photoUrl.startsWith('/uploads/cards/')) {
    const filename = photoUrl.replace('/uploads/cards/', '');
    const filePath = path.join(UPLOAD_DIR, filename);
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}

// GET / — every known teacher with their card state (batch-loaded, no N+1)
router.get('/', requirePermission('view_teacher_cards'), async (req, res) => {
  try {
    const names = await listTeacherNames();
    if (names.length === 0) return res.json([]);

    // Batch: load all subjects for every teacher in ONE query
    const allSubjects = await db.all(
      `SELECT DISTINCT teacher, name, code, className FROM subjects WHERE trim(teacher) IN (${names.map(() => '?').join(',')})`,
      names
    );
    const subjectsByName = {};
    for (const s of allSubjects) {
      const n = (s.teacher || '').trim();
      if (!subjectsByName[n]) subjectsByName[n] = [];
      subjectsByName[n].push({ name: s.name, code: s.code, className: s.className });
    }

    // Batch: load all existing card rows in ONE query; auto-create missing ones
    const existingCards = await db.all(
      `SELECT * FROM teacher_cards WHERE teacherName IN (${names.map(() => '?').join(',')})`,
      names
    );
    const cardsByName = {};
    for (const c of existingCards) cardsByName[c.teacherName] = c;

    // Auto-create card rows for teachers that don't have one yet
    const missing = names.filter(n => !cardsByName[n]);
    if (missing.length > 0) {
      const now = new Date().toISOString();
      const insertTx = db.transaction(async ({ run }) => {
        for (const n of missing) {
          await run('INSERT INTO teacher_cards (teacherName, cardStatus, updatedAt) VALUES (?, ?, ?)',
            [n, 'none', now]);
        }
      });
      await insertTx();
      // Re-fetch the newly created rows
      if (missing.length > 0) {
        const newCards = await db.all(
          `SELECT * FROM teacher_cards WHERE teacherName IN (${missing.map(() => '?').join(',')})`,
          missing
        );
        for (const c of newCards) cardsByName[c.teacherName] = c;
      }
    }

    const rows = names.map(name => {
      const enrolled = subjectsByName[name] || [];
      const classes = [...new Set(enrolled.map(s => s.className).filter(Boolean))];
      const card = cardsByName[name];
      return {
        name,
        className: classes.join(', '),
        subjects: enrolled.map(s => ({ name: s.name, code: s.code, className: s.className })),
        cardId: card?.id,
        photoUrl: card?.photoUrl,
        photoMime: card?.photoMime,
        cardStatus: card?.cardStatus || 'none',
        reviewNote: card?.reviewNote,
        reviewedBy: card?.reviewedBy,
        issuedAt: card?.issuedAt,
      };
    });
    res.json(rows);
  } catch (err) {
    console.error('Error listing teacher cards:', err);
    return res.status(500).json({ error: err.message || 'Failed to load teacher cards' });
  }
});

// GET /my — logged-in teacher's own card
router.get('/my', requirePermission('view_own_teacher_card'), async (req, res) => {
  try {
    const user = await db.get('SELECT fullName, linkedTeacherId FROM users WHERE id = ?', [req.user.id]);
    let teacherName = null;
    if (user && user.linkedTeacherId) {
      const t = await db.get('SELECT name FROM teachers WHERE id = ?', [user.linkedTeacherId]);
      if (t) teacherName = t.name;
    }
    if (!teacherName && user) {
      const names = await listTeacherNames();
      const found = names.find(n => n.toLowerCase() === (user.fullName || '').toLowerCase());
      if (found) teacherName = found;
    }
    if (!teacherName) {
      return res.json({ linked: false, message: 'No teacher profile is linked to this account.' });
    }
    const info = await teacherInfo(teacherName);
    const card = await ensureCardRow(teacherName);
    res.json({ linked: true, teacher: { name: teacherName, className: info.className, subjects: info.subjects }, card });
  } catch (err) {
    console.error('Error loading own teacher card:', err);
    return res.status(500).json({ error: err.message || 'Failed to load your card' });
  }
});

// POST /upload/:name — raw image bytes (JPG/PNG/WebP) via express.raw.
// Managers may upload for any teacher; a teacher may only upload their own photo.
router.post('/upload/:name',
  async (req, res, next) => {
    if (await userHasRight(req.user.id, req.user.role, 'upload_teacher_card_photos')) return next();
    if (await userHasRight(req.user.id, req.user.role, 'upload_own_teacher_card_photo')) {
      const name = decodeURIComponent(req.params.name).trim();
      const user = await db.get('SELECT fullName, linkedTeacherId FROM users WHERE id = ?', [req.user.id]);
      let isSelf = user && user.fullName === name;
      if (!isSelf && user && user.linkedTeacherId) {
        const t = await db.get('SELECT name FROM teachers WHERE id = ?', [user.linkedTeacherId]);
        if (t && t.name === name) isSelf = true;
      }
      if (isSelf) return next();
      return res.status(403).json({ error: 'You can only upload your own card photo.' });
    }
    return res.status(403).json({ error: 'You do not have permission to upload card photos' });
  },
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }),
  async (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name).trim();
      const known = await listTeacherNames();
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

      const existing = await ensureCardRow(name);
      deleteOldPhoto(existing.photoUrl);

      await db.run('UPDATE teacher_cards SET photoUrl=?, photoMime=?, cardStatus=?, reviewNote=?, reviewedBy=?, issuedAt=?, updatedAt=? WHERE id=?',
        [`/uploads/cards/${filename}`, `image/${ext === 'jpg' ? 'jpeg' : ext}`, 'pending', null, null, null, new Date().toISOString(), existing.id]);

      const card = await db.get('SELECT * FROM teacher_cards WHERE id = ?', [existing.id]);
      res.json({ success: true, card, message: 'Photo uploaded. Awaiting approval before the card can be issued.' });
    } catch (err) {
      console.error('Error uploading teacher card photo:', err);
      return res.status(500).json({ error: err.message || 'Failed to save photo' });
    }
  });

// PUT /:id/approve — approve the photo so the card is ready to issue
router.put('/:id/approve', requirePermission('approve_teacher_card_photos'), async (req, res) => {
  try {
    const card = await db.get('SELECT * FROM teacher_cards WHERE id = ?', [req.params.id]);
    if (!card) return res.status(404).json({ error: 'Card record not found' });
    if (!card.photoUrl) return res.status(400).json({ error: 'No photo uploaded yet for this teacher' });
    await db.run('UPDATE teacher_cards SET cardStatus=?, reviewNote=?, reviewedBy=?, issuedAt=?, updatedAt=? WHERE id=?',
      ['approved', null, req.user.username, new Date().toISOString().slice(0, 10), new Date().toISOString(), card.id]);
    const updated = await db.get('SELECT * FROM teacher_cards WHERE id = ?', [card.id]);
    res.json({ success: true, card: updated, message: 'Photo approved — the ID card is now ready to issue.' });
  } catch (err) {
    console.error('Error approving teacher card photo:', err);
    return res.status(500).json({ error: err.message || 'Failed to approve card photo' });
  }
});

// PUT /:id/reject — reject the photo; teacher must upload a correct one
router.put('/:id/reject', requirePermission('approve_teacher_card_photos'), async (req, res) => {
  try {
    const card = await db.get('SELECT * FROM teacher_cards WHERE id = ?', [req.params.id]);
    if (!card) return res.status(404).json({ error: 'Card record not found' });
    const note = (((req.body || {}).note) || '').toString().trim()
      || 'Photo does not meet the requirements. Please upload a clear photo of the teacher.';
    await db.run('UPDATE teacher_cards SET cardStatus=?, reviewNote=?, reviewedBy=?, issuedAt=?, updatedAt=? WHERE id=?',
      ['rejected', note, req.user.username, null, new Date().toISOString(), card.id]);
    const updated = await db.get('SELECT * FROM teacher_cards WHERE id = ?', [card.id]);
    res.json({ success: true, card: updated, message: 'Photo rejected. The teacher needs to upload a correct photo.' });
  } catch (err) {
    console.error('Error rejecting teacher card photo:', err);
    return res.status(500).json({ error: err.message || 'Failed to reject card photo' });
  }
});

export default router;

