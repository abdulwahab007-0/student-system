// Default passwords for auto-created accounts / password resets
export const DEFAULT_PASSWORDS = {
  super_admin: 'admin@123',
  cr_admin: 'cr@123',
  teacher_admin: 'teacher@123',
  student: 'student@123',
};
export const defaultPasswordFor = role => DEFAULT_PASSWORDS[role] || 'ncbae@123';

// Generate a unique username from a full name, avoiding DB collisions
export function generateUniqueUsername(db, fullName, base) {
  const clean = (base || fullName).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'user';
  let username = clean;
  let i = 1;
  while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    username = `${clean}${i}`;
    i++;
  }
  return username;
}

// Default rights granted to each role
export const DEFAULT_PERMISSIONS = {
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
  assign_cr: ['super_admin'],
  view_todo_list: ['super_admin', 'cr_admin', 'student'],
  manage_todo_list: ['super_admin', 'cr_admin', 'student'],
  view_class_schedule: ['super_admin', 'cr_admin', 'teacher_admin', 'student'],
  edit_class_schedule: ['super_admin', 'cr_admin', 'teacher_admin'],
  view_attendance: ['super_admin', 'cr_admin', 'teacher_admin', 'student'],
  mark_attendance: ['super_admin', 'student'],
  manage_geofences: ['super_admin', 'cr_admin'],
  approve_attendance: ['super_admin', 'cr_admin', 'teacher_admin'],
};
