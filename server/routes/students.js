import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

// ── Helpers ──
async function nextRollNo() {
  const cnt = await db.get('SELECT COUNT(*) as c FROM students');
  let roll = 'STU-' + String(cnt.c + 1).padStart(3, '0');
  while (await db.get('SELECT 1 FROM students WHERE rollNo = ?', [roll])) {
    roll = 'STU-' + String(parseInt(roll.split('-')[1]) + 1).padStart(3, '0');
  }
  return roll;
}

async function resolveRollNo(rollNo) {
  let finalRollNo = (rollNo || '').trim();
  if (!finalRollNo) return nextRollNo();
  if (await db.get('SELECT 1 FROM students WHERE rollNo = ?', [finalRollNo])) return nextRollNo();
  return finalRollNo;
}

// Auto-create a class entry if one with this name does not already exist, so that
// a class entered while adding a student also appears in the Classes section.
// Returns nothing meaningful; used for its side effect.
async function ensureClassExists(className) {
  const name = (className || '').trim();
  if (!name) return;
  const existing = await db.get('SELECT 1 FROM classes WHERE name = ?', [name]);
  if (existing) return;
  // Derive a short uppercase code from the class name (e.g. "BSCS" -> "BSCS",
  // "BS Computer Science" -> "BSCS"), falling back to the name itself.
  const words = name.split(/\s+/).filter(Boolean);
  let code = words.length > 1
    ? words.map(w => w[0]).join('').toUpperCase()
    : name.toUpperCase();
  // Ensure uniqueness against existing class codes.
  let suffix = 0;
  while (await db.get('SELECT 1 FROM classes WHERE code = ?', [code])) {
    suffix += 1;
    code = (words.length > 1 ? words.map(w => w[0]).join('').toUpperCase() : name.toUpperCase()) + suffix;
  }
  await db.run('INSERT INTO classes (name, code) VALUES (?, ?)', [name, code]);
}

router.get('/', requirePermission('view_students'), async (req, res) => {
  const rows = await db.all('SELECT * FROM students ORDER BY id');
  res.json(rows);
});

router.post('/', requirePermission('add_students'), async (req, res) => {
  try {
    const { name, email, phone, rollNo, className, gender, address, dateOfBirth, admissionDate, status, isCR } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const finalRollNo = await resolveRollNo(rollNo);
    await ensureClassExists(className);
    const r = await db.run('INSERT INTO students (name,email,phone,rollNo,className,gender,address,dateOfBirth,admissionDate,status,isCR) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [name, email||'', phone||'', finalRollNo, className||'', gender||'', address||'', dateOfBirth||'', admissionDate||'', status||'Active', isCR?1:0]);
    const student = await db.get('SELECT * FROM students WHERE id = ?', [r.lastInsertRowid]);
    res.json(student);
  } catch (err) {
    console.error('Error creating student:', err);
    return res.status(500).json({ error: err.message || 'Failed to create student' });
  }
});

// ── Bulk import (transaction with per-row error handling) ──
router.post('/import', requirePermission('add_students'), async (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'students array is required' });
    }
    const results = [];
    const errors  = [];
    const bulkInsert = db.transaction(async ({ run, get }) => {
      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        try {
          if (!s.name) { errors.push({ index: i, name: s.name || `Row ${i+1}`, error: 'Name is required' }); continue; }
          await ensureClassExists(s.className);
          const finalRollNo = await resolveRollNo(s.rollNo);
          const r = await run('INSERT INTO students (name,email,phone,rollNo,className,gender,address,dateOfBirth,admissionDate,status,isCR) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [s.name, s.email||'', s.phone||'', finalRollNo, s.className||'', s.gender||'', s.address||'', s.dateOfBirth||'', s.admissionDate||'', s.status||'Active', s.isCR?1:0]);
          results.push(await get('SELECT * FROM students WHERE id = ?', [r.lastInsertRowid]));
        } catch (rowErr) {
          console.error(`Bulk import error row ${i} (${s.name}):`, rowErr);
          errors.push({ index: i, name: s.name||`Row ${i+1}`, error: rowErr.message || 'Unknown error' });
        }
      }
    });
    await bulkInsert();
    res.json({ success: errors.length === 0, imported: results.length, failed: errors.length, students: results, errors });
  } catch (err) {
    console.error('Bulk import error:', err);
    return res.status(500).json({ error: err.message || 'Bulk import failed' });
  }
});

router.put('/:id', requirePermission('edit_students'), async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Student not found' });
    const b = req.body;
    const name        = b.name        !== undefined ? b.name        : existing.name;
    const email       = b.email       !== undefined ? b.email       : existing.email;
    const phone       = b.phone       !== undefined ? b.phone       : existing.phone;
    const rollNo      = b.rollNo      !== undefined ? b.rollNo      : existing.rollNo;
    const className   = b.className   !== undefined ? b.className   : existing.className;
    const gender      = b.gender      !== undefined ? b.gender      : existing.gender;
    const address     = b.address     !== undefined ? b.address     : existing.address;
    const dateOfBirth = b.dateOfBirth !== undefined ? b.dateOfBirth : existing.dateOfBirth;
    const admissionDate = b.admissionDate !== undefined ? b.admissionDate : existing.admissionDate;
    const status      = b.status      !== undefined ? b.status      : existing.status;
    const isCR        = b.isCR        !== undefined ? (b.isCR ? 1 : 0) : existing.isCR;
    await db.run('UPDATE students SET name=?,email=?,phone=?,rollNo=?,className=?,gender=?,address=?,dateOfBirth=?,admissionDate=?,status=?,isCR=? WHERE id=?',
      [name, email||'', phone||'', rollNo||'', className||'', gender||'', address||'', dateOfBirth||'', admissionDate||'', status||'Active', isCR, req.params.id]);
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    res.json(student);
  } catch (err) {
    console.error('Error updating student:', err);
    return res.status(500).json({ error: err.message || 'Failed to update student' });
  }
});

// ── Bulk delete (transaction) ──
router.post('/bulk-delete', requirePermission('delete_students'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const bulkDelete = db.transaction(async ({ run, get }) => {
      for (const id of ids) {
        const row = await get('SELECT id, linkedUserId FROM students WHERE id = ?', [id]);
        // Also remove any linked login account so nothing is left in the backend
        if (row && row.linkedUserId) await run('DELETE FROM users WHERE id = ?', [row.linkedUserId]);
        await run('DELETE FROM marks WHERE studentId = ?', [id]);
        await run('DELETE FROM students WHERE id = ?', [id]);
      }
    });
    await bulkDelete();
    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Bulk delete students error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete students' });
  }
});

router.delete('/:id', requirePermission('delete_students'), async (req, res) => {
  try {
    // Also remove any linked login account so nothing is left in the backend
    const row = await db.get('SELECT id, linkedUserId FROM students WHERE id = ?', [req.params.id]);
    if (row && row.linkedUserId) {
      await db.run('DELETE FROM users WHERE id = ?', [row.linkedUserId]);
    }
    await db.run('DELETE FROM marks WHERE studentId = ?', [req.params.id]);
    await db.run('DELETE FROM students WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting student:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete student' });
  }
});

export default router;
