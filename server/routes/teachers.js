import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';
const router = Router();

// ── Subject-code → teacher details ─────────────────────────────────────
// A teacher's Subject name and Class are sourced from the SUBJECTS table:
// given a subject `code`, we fetch the matching subject's name + className and
// use them to auto-fill the teacher record — no manual double entry.
async function resolveSubjectByCode(code) {
  if (!code || !String(code).trim()) return null;
  return db.get(
    "SELECT name, className FROM subjects WHERE lower(trim(code)) = lower(trim(?)) LIMIT 1",
    [String(code).trim()]
  );
}

// Reconcile a teacher's stored subject + className with the current Subjects
// module. If a subject's name matches the teacher's subject, the class comes
// from that subject's className. Returns null if nothing changed.
async function reconcileTeacherFromSubjects(teacher) {
  const subjectName = (teacher.subject || '').trim();
  const name = (teacher.name || '').trim();
  if (!name) return null;

  let newClass = '';
  // Class = distinct className(s) of the subjects this teacher teaches (by name)
  const rows = await db.all(
    "SELECT DISTINCT className FROM subjects WHERE lower(trim(teacher)) = lower(trim(?)) AND className IS NOT NULL AND trim(className) != ''",
    [name]
  );
  const classSet = new Set();
  rows.forEach(r => {
    (r.className || '').split(',').map(c => c.trim()).filter(Boolean).forEach(c => classSet.add(c));
  });
  newClass = [...classSet].sort().join(', ');

  // If the teacher's subject is blank but they teach a subject, inherit its name
  let newSubject = subjectName;
  if (!newSubject) {
    const s = await db.get(
      "SELECT name FROM subjects WHERE lower(trim(teacher)) = lower(trim(?)) ORDER BY id LIMIT 1",
      [name]
    );
    if (s && s.name) newSubject = s.name;
  }

  if (newSubject === subjectName && newClass === (teacher.className || '')) {
    return null;
  }
  return { subject: newSubject, className: newClass };
}

router.get('/', requirePermission('view_teachers'), async (req, res) => {
  const rows = await db.all('SELECT * FROM teachers ORDER BY id');
  // Reconcile each teacher against the Subjects module so stored records and
  // the returned payload stay in sync with the linked subjects.
  for (const t of rows) {
    const patch = await reconcileTeacherFromSubjects(t);
    if (patch) {
      await db.run('UPDATE teachers SET subject=?, className=? WHERE id=?',
        [patch.subject, patch.className, t.id]);
      t.subject = patch.subject;
      t.className = patch.className;
    }
  }
  res.json(rows);
});

router.post('/', requirePermission('add_teachers'), async (req, res) => {
  const { name, email, phone, subject, qualification, experience, className, joiningDate, subjectCode } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  // If a subject code is provided, auto-fill subject name + class from it.
  let subj = subject || '';
  let cls = className || '';
  if (subjectCode) {
    const s = await resolveSubjectByCode(subjectCode);
    if (s) {
      if (!subj) subj = s.name || '';
      if (!cls) cls = s.className || '';
    }
  }
  const r = await db.run('INSERT INTO teachers (name,email,phone,subject,qualification,experience,className,joiningDate) VALUES (?,?,?,?,?,?,?,?)',
    [name, email||'', phone||'', subj, qualification||'', experience||'', cls, joiningDate||'']);
  // Reconcile from subjects (class may come from linked subjects by teacher name)
  let row = await db.get('SELECT * FROM teachers WHERE id = ?', [r.lastInsertRowid]);
  const patch = await reconcileTeacherFromSubjects(row);
  if (patch) {
    await db.run('UPDATE teachers SET subject=?, className=? WHERE id=?',
      [patch.subject, patch.className, row.id]);
    row = await db.get('SELECT * FROM teachers WHERE id = ?', [row.id]);
  }
  res.json(row);
});

router.put('/:id', requirePermission('edit_teachers'), async (req, res) => {
  const { name, email, phone, subject, qualification, experience, className, joiningDate, subjectCode } = req.body;
  // If a subject code is provided, auto-fill subject name + class from it.
  let subj = subject ?? '';
  let cls = className ?? '';
  if (subjectCode) {
    const s = await resolveSubjectByCode(subjectCode);
    if (s) {
      if (!subj) subj = s.name || '';
      if (!cls) cls = s.className || '';
    }
  }
  await db.run('UPDATE teachers SET name=?,email=?,phone=?,subject=?,qualification=?,experience=?,className=?,joiningDate=? WHERE id=?',
    [name, email||'', phone||'', subj, qualification||'', experience||'', cls, joiningDate||'', req.params.id]);
  let row = await db.get('SELECT * FROM teachers WHERE id = ?', [req.params.id]);
  const patch = await reconcileTeacherFromSubjects(row);
  if (patch) {
    await db.run('UPDATE teachers SET subject=?, className=? WHERE id=?',
      [patch.subject, patch.className, row.id]);
    row = await db.get('SELECT * FROM teachers WHERE id = ?', [row.id]);
  }
  res.json(row);
});

router.delete('/:id', requirePermission('delete_teachers'), async (req, res) => {
  await db.run('DELETE FROM teachers WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

export default router;
