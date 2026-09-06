import jwt from 'jsonwebtoken';
import db from '../db.js';

const SECRET = process.env.JWT_SECRET || 'ncba-e-sms-dev-secret-2026';
const EXPIRES_IN = '24h';

export function generateToken(user) {
  return jwt.sign({ id: user.id, role: user.role, username: user.username }, SECRET, { expiresIn: EXPIRES_IN });
}

// Route-level permission guard: checks role_permissions overrides + defaults
const DEFAULT_RIGHTS = {
  view_dashboard: ['super_admin', 'cr_admin', 'teacher_admin', 'student'],
  view_students: ['super_admin', 'cr_admin', 'teacher_admin'],
  add_students: ['super_admin', 'cr_admin', 'teacher_admin'],
  edit_students: ['super_admin', 'cr_admin', 'teacher_admin'],
  delete_students: ['super_admin'],
  view_teachers: ['super_admin', 'cr_admin', 'teacher_admin'],
  add_teachers: ['super_admin', 'cr_admin', 'teacher_admin'],
  edit_teachers: ['super_admin', 'cr_admin', 'teacher_admin'],
  delete_teachers: ['super_admin'],
  view_subjects: ['super_admin', 'cr_admin', 'teacher_admin', 'student'],
  add_subjects: ['super_admin', 'cr_admin', 'teacher_admin'],
  edit_subjects: ['super_admin', 'cr_admin', 'teacher_admin'],
  delete_subjects: ['super_admin'],
  view_classes: ['super_admin', 'cr_admin', 'teacher_admin'],
  add_classes: ['super_admin', 'cr_admin', 'teacher_admin'],
  edit_classes: ['super_admin', 'cr_admin', 'teacher_admin'],
  delete_classes: ['super_admin'],
  view_marks: ['super_admin', 'cr_admin', 'teacher_admin', 'student'],
  record_marks: ['super_admin', 'cr_admin', 'teacher_admin'],
  delete_marks: ['super_admin'],
  approve_users: ['super_admin', 'cr_admin', 'teacher_admin'],
  view_users: ['super_admin', 'cr_admin', 'teacher_admin'],
  reset_passwords: ['super_admin'],
  create_accounts: ['super_admin', 'cr_admin', 'teacher_admin'],
  remove_users: ['super_admin'],
  assign_cr: ['super_admin', 'cr_admin'],
  view_todo_list: ['super_admin', 'cr_admin', 'student'],
  manage_todo_list: ['super_admin', 'cr_admin', 'student'],
  view_class_schedule: ['super_admin', 'cr_admin', 'teacher_admin', 'student'],
  edit_class_schedule: ['super_admin', 'cr_admin', 'teacher_admin'],
  view_attendance: ['super_admin', 'cr_admin', 'teacher_admin', 'student'],
  mark_attendance: ['super_admin', 'student'],
  manage_geofences: ['super_admin', 'cr_admin'],
  approve_attendance: ['super_admin', 'cr_admin', 'teacher_admin'],
  view_attendance_report: ['super_admin', 'cr_admin', 'teacher_admin'],
  view_own_attendance: ['super_admin', 'student'],
  use_chat: ['super_admin', 'cr_admin', 'teacher_admin', 'student'],
  post_announcements: ['super_admin', 'cr_admin', 'teacher_admin'],
  view_student_cards: ['super_admin', 'cr_admin', 'teacher_admin'],
  upload_card_photos: ['super_admin', 'cr_admin', 'teacher_admin'],
  approve_card_photos: ['super_admin', 'cr_admin', 'teacher_admin'],
  view_own_card: ['student', 'cr_admin'],
  upload_own_card_photo: ['student', 'cr_admin'],
  view_teacher_cards: ['super_admin', 'cr_admin', 'teacher_admin'],
  upload_teacher_card_photos: ['super_admin', 'cr_admin', 'teacher_admin'],
  approve_teacher_card_photos: ['super_admin', 'cr_admin', 'teacher_admin'],
  view_own_teacher_card: ['teacher_admin'],
  upload_own_teacher_card_photo: ['teacher_admin'],
};

function roleHasRight(role, rightKey) {
  const defaults = DEFAULT_RIGHTS[rightKey] || [];
  const row = db.prepare('SELECT granted FROM role_permissions WHERE role = ? AND rightKey = ?').get(role, rightKey);
  if (row) return !!row.granted;
  return defaults.includes(role);
}

export function userHasRight(userId, role, rightKey) {
  // Check user-level override first, then fall back to role-level
  const userRow = db.prepare('SELECT granted FROM user_permissions WHERE userId = ? AND rightKey = ?').get(userId, rightKey);
  if (userRow) return !!userRow.granted;
  return roleHasRight(role, rightKey);
}

export function requirePermission(rightKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (userHasRight(req.user.id, req.user.role, rightKey)) return next();
    return res.status(403).json({ error: 'You do not have permission to perform this action' });
  };
}

export function authMiddleware(req, res, next) {
  // Support both Authorization header and ?token= query param (for SSE/EventSource)
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

