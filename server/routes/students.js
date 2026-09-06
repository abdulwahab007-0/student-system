import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

// ── Helpers ──
function nextRollNo() {
  const cnt = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
  let roll = 'STU-' + String(cnt + 1).padStart(3, '0');
  while (db.prepare('SELECT 1 FROM students WHERE rollNo = ?').get(roll)) {
    roll = 'STU-' + String(parseInt(roll.split('-')[1]) + 1).padStart(3, '0');
  }
  return roll;
}

function resolveRollNo(rollNo) {
  let finalRollNo = (rollNo || '').trim();
  if (!finalRollNo) return nextRollNo();
  if (db.prepare('SELECT 1 FROM students WHERE rollNo = ?').get(finalRollNo)) return nextRollNo();
  return finalRollNo;
}

// Auto-create a class entry if one with this name does not already exist, so that
// a class entered while adding a student also appears in the Classes section.
// Returns nothing meaningful; used for its side effect.
function ensureClassExists(className) {
  const name = (className || '').trim();
  if (!name) return;
  const existing = db.prepare('SELECT 1 FROM classes WHERE name = ?').get(name);
  if (existing) return;
  // Derive a short uppercase code from the class name (e.g. "BSCS" -> "BSCS",
  // "BS Computer Science" -> "BSCS"), falling back to the name itself.
  const words = name.split(/\s+/).filter(Boolean);
  let code = words.length > 1
    ? words.map(w => w[0]).join('').toUpperCase()
    : name.toUpperCase();
  // Ensure uniqueness against existing class codes.
  let suffix = 0;
  while (db.prepare('SELECT 1 FROM classes WHERE code = ?').get(code)) {
    suffix += 1;
    code = (words.length > 1 ? words.map(w => w[0]).join('').toUpperCase() : name.toUpperCase()) + suffix;
  }
  db.prepare('INSERT INTO classes (name, code) VALUES (?, ?)').run(name, code);
}

router.get('/', requirePermission('view_students'), (req, res) => {
  res.json(db.prepare('SELECT * FROM students ORDER BY id').all());
});

router.post('/', requirePermission('add_students'), (req, res) => {
  try {
    const { name, email, phone, rollNo, className, gender, address, dateOfBirth, admissionDate, status, isCR } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const finalRollNo = resolveRollNo(rollNo);
    ensureClassExists(className);
    const r = db.prepare('INSERT INTO students (name,email,phone,rollNo,className,gender,address,dateOfBirth,admissionDate,status,isCR) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(name, email||'', phone||'', finalRollNo, className||'', gender||'', address||'', dateOfBirth||'', admissionDate||'', status||'Active', isCR?1:0);
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(r.lastInsertRowid);
    res.json(student);
  } catch (err) {
    console.error('Error creating student:', err);
    return res.status(500).json({ error: err.message || 'Failed to create student' });
  }
});

// ── Bulk import (transaction with per-row error handling) ──
router.post('/import', requirePermission('add_students'), (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'students array is required' });
    }
    const insertStmt = db.prepare('INSERT INTO students (name,email,phone,rollNo,className,gender,address,dateOfBirth,admissionDate,status,isCR) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const selectStmt = db.prepare('SELECT * FROM students WHERE id = ?');
    const results = [];
    const errors  = [];
    const bulkInsert = db.transaction(() => {
      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        try {
          if (!s.name) { errors.push({ index: i, name: s.name || `Row ${i+1}`, error: 'Name is required' }); continue; }
          ensureClassExists(s.className);
          const finalRollNo = resolveRollNo(s.rollNo);
          const r = insertStmt.run(s.name, s.email||'', s.phone||'', finalRollNo, s.className||'', s.gender||'', s.address||'', s.dateOfBirth||'', s.admissionDate||'', s.status||'Active', s.isCR?1:0);
          results.push(selectStmt.get(r.lastInsertRowid));
        } catch (rowErr) {
          console.error(`Bulk import error row ${i} (${s.name}):`, rowErr);
          errors.push({ index: i, name: s.name||`Row ${i+1}`, error: rowErr.message || 'Unknown error' });
        }
      }
    });
    bulkInsert();
    res.json({ success: errors.length === 0, imported: results.length, failed: errors.length, students: results, errors });
  } catch (err) {
    console.error('Bulk import error:', err);
    return res.status(500).json({ error: err.message || 'Bulk import failed' });
  }
});

router.put('/:id', requirePermission('edit_students'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
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
    db.prepare('UPDATE students SET name=?,email=?,phone=?,rollNo=?,className=?,gender=?,address=?,dateOfBirth=?,admissionDate=?,status=?,isCR=? WHERE id=?')
      .run(name, email||'', phone||'', rollNo||'', className||'', gender||'', address||'', dateOfBirth||'', admissionDate||'', status||'Active', isCR, req.params.id);
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    res.json(student);
  } catch (err) {
    console.error('Error updating student:', err);
    return res.status(500).json({ error: err.message || 'Failed to update student' });
  }
});

// ── Bulk delete (transaction) ──
router.post('/bulk-delete', requirePermission('delete_students'), (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const getLinkedUser = db.prepare('SELECT id, linkedUserId FROM students WHERE id = ?');
    const deleteMarks = db.prepare('DELETE FROM marks WHERE studentId = ?');
    const deleteStudent = db.prepare('DELETE FROM students WHERE id = ?');
    const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');
    const bulkDelete = db.transaction(() => {
      for (const id of ids) {
        const row = getLinkedUser.get(id);
        // Also remove any linked login account so nothing is left in the backend
        if (row && row.linkedUserId) deleteUser.run(row.linkedUserId);
        deleteMarks.run(id);
        deleteStudent.run(id);
      }
    });
    bulkDelete();
    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Bulk delete students error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete students' });
  }
});

router.delete('/:id', requirePermission('delete_students'), (req, res) => {
  try {
    // Also remove any linked login account so nothing is left in the backend
    const row = db.prepare('SELECT id, linkedUserId FROM students WHERE id = ?').get(req.params.id);
    if (row && row.linkedUserId) {
      db.prepare('DELETE FROM users WHERE id = ?').run(row.linkedUserId);
    }
    db.prepare('DELETE FROM marks WHERE studentId = ?').run(req.params.id);
    db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting student:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete student' });
  }
});

export default router;
