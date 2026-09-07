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
router.get('/', requirePermission('view_class_schedule'), async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM class_schedules ORDER BY id');
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
router.get('/:className', requirePermission('view_class_schedule'), async (req, res) => {
  try {
    const className = req.params.className;
    let row = await db.get('SELECT * FROM class_schedules WHERE className = ?', [className]);
    if (!row) {
      // Auto-create with default structure for new classes
      await db.run('INSERT INTO class_schedules (className, structure, slots) VALUES (?, ?, ?)',
        [className, DEFAULT_STRUCTURE, '{}']);
      row = await db.get('SELECT * FROM class_schedules WHERE className = ?', [className]);
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
router.put('/:className', requirePermission('edit_class_schedule'), async (req, res) => {
  try {
    const className = req.params.className;
    const { structure, slots } = req.body;

    const structureStr = JSON.stringify(structure || { days: [] });
    const slotsStr = JSON.stringify(slots || {});

    const existing = await db.get('SELECT id FROM class_schedules WHERE className = ?', [className]);
    if (existing) {
      await db.run('UPDATE class_schedules SET structure = ?, slots = ? WHERE className = ?',
        [structureStr, slotsStr, className]);
    } else {
      await db.run('INSERT INTO class_schedules (className, structure, slots) VALUES (?, ?, ?)',
        [className, structureStr, slotsStr]);
    }

    const row = await db.get('SELECT * FROM class_schedules WHERE className = ?', [className]);
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
router.delete('/:className', requirePermission('edit_class_schedule'), async (req, res) => {
  try {
    await db.run('DELETE FROM class_schedules WHERE className = ?', [req.params.className]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;