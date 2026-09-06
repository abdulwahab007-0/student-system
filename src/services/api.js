const BASE = '/api';

function getToken() {
  return localStorage.getItem('sms_token');
}

function setToken(token) {
  localStorage.setItem('sms_token', token);
}

function clearToken() {
  localStorage.removeItem('sms_token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, opts);
  } catch {
    throw new Error('Network error — please check your connection and try again.');
  }

  // Read the body as text first to safely handle empty / non-JSON responses
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const api = {
  // Auth
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  register: (data) => request('POST', '/auth/register', data),
  changePassword: (userId, oldPassword, newPassword) =>
    request('PUT', '/auth/change-password', { userId, oldPassword, newPassword }),
  resetPassword: (id) => request('PUT', `/auth/reset-password/${id}`),
  assignCR: (studentId, options) => request('POST', '/auth/assign-cr', { studentId, ...options }),
  removeCR: (studentId) => request('DELETE', '/auth/remove-cr', { studentId }),

  // Users
  getUsers: () => request('GET', '/users'),
  getPendingUsers: () => request('GET', '/users/pending'),
  approveUser: (id) => request('POST', `/users/${id}/approve`),
  rejectUser: (id) => request('DELETE', `/users/${id}/reject`),
  createAccount: (data) => request('POST', '/users/create-account', data),
  deleteUser: (id) => request('DELETE', `/users/${id}`),

  // Account management (manage teachers & system administrators)
  teacherAccounts: () => request('GET', '/users/teacher-accounts'),
  adminAccounts: () => request('GET', '/users/admin-accounts'),
  grantTeacherAccount: (id) => request('POST', `/users/teachers/${id}/grant-account`),
  createAdminAccount: (data) => request('POST', '/users/admins', data),
  revokeAccount: (id) => request('DELETE', `/users/${id}/revoke-account`),

  // Permissions
  getPermissions: () => request('GET', '/permissions'),
  savePermissions: (overrides) => request('PUT', '/permissions', overrides),
  resetPermissions: () => request('POST', '/permissions/reset'),

  // Per-user permissions
  getUserPermissions: () => request('GET', '/permissions/users'),
  saveUserPermissions: (overrides) => request('PUT', '/permissions/users', overrides),
  resetUserPermissions: () => request('POST', '/permissions/users/reset'),

  // Students
  getStudents: () => request('GET', '/students'),
  createStudent: (data) => request('POST', '/students', data),
  importStudents: (students) => request('POST', '/students/import', { students }),
  updateStudent: (id, data) => request('PUT', `/students/${id}`, data),
  deleteStudent: (id) => request('DELETE', `/students/${id}`),
  bulkDeleteStudents: (ids) => request('POST', '/students/bulk-delete', { ids }),

  // Teachers
  getTeachers: () => request('GET', '/teachers'),
  createTeacher: (data) => request('POST', '/teachers', data),
  updateTeacher: (id, data) => request('PUT', `/teachers/${id}`, data),
  deleteTeacher: (id) => request('DELETE', `/teachers/${id}`),

  // Subjects
  getSubjects: () => request('GET', '/subjects'),
  createSubject: (data) => request('POST', '/subjects', data),
  updateSubject: (id, data) => request('PUT', `/subjects/${id}`, data),
  deleteSubject: (id) => request('DELETE', `/subjects/${id}`),

  // Marks
  getMarks: () => request('GET', '/marks'),
  createMarks: (data) => request('POST', '/marks', data),
  updateMarks: (id, data) => request('PUT', `/marks/${id}`, data),
  deleteMark: (id) => request('DELETE', `/marks/${id}`),

  // Classes
  getClasses: () => request('GET', '/classes'),
  createClass: (data) => request('POST', '/classes', data),
  updateClass: (id, data) => request('PUT', `/classes/${id}`, data),
  deleteClass: (id) => request('DELETE', `/classes/${id}`),

  // Class Schedules
  getSchedules: () => request('GET', '/schedules'),
  getClassSchedule: (className) => request('GET', `/schedules/${encodeURIComponent(className)}`),
  saveClassSchedule: (className, data) => request('PUT', `/schedules/${encodeURIComponent(className)}`, data),
  deleteClassSchedule: (className) => request('DELETE', `/schedules/${encodeURIComponent(className)}`),

  // Attendance
  getGeofences: () => request('GET', '/attendance/geofences'),
  getGeofencesForClass: (className) => request('GET', `/attendance/geofences/${encodeURIComponent(className)}`),
  createGeofence: (data) => request('POST', '/attendance/geofences', data),
  updateGeofence: (id, data) => request('PUT', `/attendance/geofences/${id}`, data),
  deleteGeofence: (id) => request('DELETE', `/attendance/geofences/${id}`),
  markAttendance: (data) => request('POST', '/attendance/mark', data),
  getAttendanceRecords: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/attendance/records${qs ? '?' + qs : ''}`);
  },
  getStudentAttendance: (studentId) => request('GET', `/attendance/student/${studentId}`),
  getStudentAttendanceRecords: (studentId, from, to) => {
    const qs = new URLSearchParams({ studentId });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return request('GET', `/attendance/student-records?${qs.toString()}`);
  },
  getAttendanceSummary: (className, date) => {
    const qs = date ? `?date=${date}` : '';
    return request('GET', `/attendance/summary/${encodeURIComponent(className)}${qs}`);
  },
  approveAttendance: (id, action) => request('PUT', `/attendance/approve/${id}`, { action }),
  bulkAttendanceAction: (ids, action) => request('PUT', '/attendance/bulk-action', { ids, action }),
  updateAttendancePresence: (id, presence) => request('PUT', `/attendance/${id}/presence`, { presence }),
  deleteAttendanceRecord: (id) => request('DELETE', `/attendance/${id}`),
  getAttendanceReport: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/attendance/report${qs ? '?' + qs : ''}`);
  },
  reportAttendanceAction: (studentId, from, to, action) =>
    request('PUT', '/attendance/report-action', { studentId, from, to, action }),
  getMyAttendance: () => request('GET', '/attendance/my'),

  // Chat
  getChatMessages: (channel, limit = 100, before) => {
    let qs = `?limit=${limit}`;
    if (before) qs += `&before=${before}`;
    return request('GET', `/chat/messages/${channel}${qs}`);
  },
  sendChatMessage: (channel, message) => request('POST', '/chat/messages', { channel, message }),
  deleteChatMessage: (id) => request('DELETE', `/chat/messages/${id}`),

  // Student Cards
  getStudentCards: () => request('GET', '/cards'),
  getMyCard: () => request('GET', '/cards/my'),
  uploadCardPhoto: (studentId, file) => {
    // Raw-bytes upload (JPG/PNG/WebP) — the server validates the actual image content
    const headers = { Authorization: `Bearer ${getToken()}`, 'Content-Type': file.type || 'image/jpeg' };
    return fetch(`${BASE}/cards/upload/${studentId}`, { method: 'POST', headers, body: file })
      .then(async (res) => {
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        return data;
      });
  },
  approveCardPhoto: (id) => request('PUT', `/cards/${id}/approve`),
  rejectCardPhoto: (id, note) => request('PUT', `/cards/${id}/reject`, { note }),

  // Teacher Cards
  getTeacherCards: () => request('GET', '/teacher-cards'),
  getMyTeacherCard: () => request('GET', '/teacher-cards/my'),
  uploadTeacherCardPhoto: (name, file) => {
    // Raw-bytes upload (JPG/PNG/WebP) — the server validates the actual image content
    const headers = { Authorization: `Bearer ${getToken()}`, 'Content-Type': file.type || 'image/jpeg' };
    return fetch(`${BASE}/teacher-cards/upload/${encodeURIComponent(name)}`, { method: 'POST', headers, body: file })
      .then(async (res) => {
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        return data;
      });
  },
  approveTeacherCardPhoto: (id) => request('PUT', `/teacher-cards/${id}/approve`),
  rejectTeacherCardPhoto: (id, note) => request('PUT', `/teacher-cards/${id}/reject`, { note }),

  // Token management
  setToken,
  getToken,
  clearToken,
};

export default api;
