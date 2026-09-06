import { Router } from 'express';
import db from '../db.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

// Default structure for new classes
const DEFAULT_STRUCTURE = JSON.stringify({
  days: [
    { name: 'Friday', periods: ['08:00 - 09:30'] },
    { name: 'Saturday', periods: ['08:00 - 09:30', '09:30 - 11:00', '11:00 - 12:30'] },
    { name: 'Sunday', periods: ['08:00 - 09:30', '09:30 - 11:00', '11:00 - 12:30'] },
  ],
});

// GET all schedules
router.get('/', requirePermission('view_class_schedule'), (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM class_schedules ORDER BY id').all();
    const schedules = rows.map(r => ({
      id: r.id,
      className: r.className,
      structure: JSON.parse(r.structure || '{}'),
      slots: JSON.parse(r.slots || '{}'),
    }));
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET schedule for a specific class
router.get('/:className', requirePermission('view_class_schedule'), (req, res) => {
  try {
    const className = req.params.className;
    let row = db.prepare('SELECT * FROM class_schedules WHERE className = ?').get(className);
    if (!row) {
      // Auto-create with default structure for new classes
      db.prepare('INSERT INTO class_schedules (className, structure, slots) VALUES (?, ?, ?)')
        .run(className, DEFAULT_STRUCTURE, '{}');
      row = db.prepare('SELECT * FROM class_schedules WHERE className = ?').get(className);
    }
    res.json({
      id: row.id,
      className: row.className,
      structure: JSON.parse(row.structure || '{}'),
      slots: JSON.parse(row.slots || '{}'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT (save/update) schedule for a specific class
router.put('/:className', requirePermission('edit_class_schedule'), (req, res) => {
  try {
    const className = req.params.className;
    const { structure, slots } = req.body;

    const structureStr = JSON.stringify(structure || { days: [] });
    const slotsStr = JSON.stringify(slots || {});

    const existing = db.prepare('SELECT id FROM class_schedules WHERE className = ?').get(className);
    if (existing) {
      db.prepare('UPDATE class_schedules SET structure = ?, slots = ? WHERE className = ?')
        .run(structureStr, slotsStr, className);
    } else {
      db.prepare('INSERT INTO class_schedules (className, structure, slots) VALUES (?, ?, ?)')
        .run(className, structureStr, slotsStr);
    }

    const row = db.prepare('SELECT * FROM class_schedules WHERE className = ?').get(className);
    res.json({
      id: row.id,
      className: row.className,
      structure: JSON.parse(row.structure || '{}'),
      slots: JSON.parse(row.slots || '{}'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE schedule for a specific class
router.delete('/:className', requirePermission('edit_class_schedule'), (req, res) => {
  try {
    db.prepare('DELETE FROM class_schedules WHERE className = ?').run(req.params.className);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;