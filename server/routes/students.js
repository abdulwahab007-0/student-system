import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

// ── Helpers ──
// Compute the next unique "STU-###" roll number based on the highest existing
// STU-… value (NOT a row count — count-based generation collides when students
// are deleted, and when called from within a transaction it cannot see that
// transaction's own uncommitted inserts).
async function nextRollNo() {
  const row = await db.get(
    "SELECT COALESCE(MAX(CAST(SUBSTRING(rollNo FROM 5) AS INTEGER)), 0) AS maxNum FROM students WHERE rollNo LIKE 'STU-%'"
  );
  let num = (row && row.maxnum ? row.maxnum : 0) + 1;
  let roll = 'STU-' + String(num).padStart(3, '0');
  while (await db.get('SELECT 1 FROM students WHERE rollNo = ?', [roll])) {
    num += 1;
    roll = 'STU-' + String(num).padStart(3, '0');
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

// ── Bulk import (per-row error handling) ──
// NOTE: deliberately NOT wrapped in a single db.transaction(). SQLite lets a
// failed statement coexist with successful ones inside a transaction, but
// PostgreSQL aborts the ENTIRE transaction when any statement errors — so a
// single bad row would silently discard every otherwise-successful insert even
// though the helper functions below (ensureClassExists / resolveRollNo) also
// query the DB using the module-level pool, which cannot see a transaction's
// uncommitted rows. Importing each row independently keeps valid rows durable
// and surfaces per-row errors, which is what the UI promises.
router.post('/import', requirePermission('add_students'), async (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'students array is required' });
    }
    const results = [];
    const errors  = [];
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      try {
        if (!s.name) { errors.push({ index: i, name: s.name || `Row ${i+1}`, error: 'Name is required' }); continue; }
        await ensureClassExists(s.className);
        const finalRollNo = await resolveRollNo(s.rollNo);
        const r = await db.run('INSERT INTO students (name,email,phone,rollNo,className,gender,address,dateOfBirth,admissionDate,status,isCR) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [s.name, s.email||'', s.phone||'', finalRollNo, s.className||'', s.gender||'', s.address||'', s.dateOfBirth||'', s.admissionDate||'', s.status||'Active', s.isCR?1:0]);
        results.push(await db.get('SELECT * FROM students WHERE id = ?', [r.lastInsertRowid]));
      } catch (rowErr) {
        console.error(`Bulk import error row ${i} (${s.name}):`, rowErr);
        errors.push({ index: i, name: s.name||`Row ${i+1}`, error: rowErr.message || 'Unknown error' });
      }
    }
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

    // Keep the student's portal login account in sync so that when the student
    // logs in, their class (and profile fields) reflect the latest admin change.
    // Without this, the student portal would show a stale / wrong class and the
    // wrong set of subjects after the admin edits the student record.
    //
    // Prefer the account explicitly linked to this student (linkedStudentId);
    // fall back to an email match, then a normalized name match. We only update
    // className and the linkedStudentId back-reference — never email/fullName —
    // because name/email are the users table's UNIQUE keys and a greedy match
    // across similarly-named users would otherwise violate uniqueness.
    const linkedUser = await db.get('SELECT id FROM users WHERE linkedStudentId = ?', [req.params.id])
      || await db.get('SELECT id FROM users WHERE email = ?', [email || ''])
      || await db.get('SELECT id FROM users WHERE fullName IS NOT NULL AND LOWER(fullName) = LOWER(?)', [name || '']);
    if (linkedUser) {
      const newClass = className !== undefined ? className : existing.className;
      await db.run('UPDATE users SET className = ?, linkedStudentId = ? WHERE id = ?',
        [newClass ? String(newClass).trim() : null, req.params.id, linkedUser.id]);
      // Two-way link so the admin portal's student list reflects the portal login.
      await db.run('UPDATE students SET linkedUserId = ? WHERE id = ?', [linkedUser.id, req.params.id]);
    }

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
