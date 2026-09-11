const BASE = '/api';

function getToken() {
  return localStorage.getItem('sms_token');
}

function setToken(token) {
  localStorage.setItem('sms_token', token);
}

function clearToken() {
  clearSwrForToken(getToken());
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

// Single-flight bootstrap: AuthContext and DataContext both need (different
// slices of) the same post-login payload, so collapse them into ONE HTTP
// request. Keyed by token so a different user logging in never inherits the
// previous user's memoised response.
let bootstrapInFlight = null;

// ── Cached GET helper (single-flight + TTL) ──────────────────────────────
// Large list endpoints (cards, attendance) are re-fetched every time a user
// navigates to their page. Cache the result in memory for a short TTL and
// collapse concurrent callers into one request, so navigating away and back —
// or two components fetching the same list — hits the server once instead of
// repeatedly. Keyed by token + path so different users never share data.
const SWR_CACHE_PREFIX = 'sms_swr_';
const swrCache = new Map();   // path → { t, data }
const swrInFlight = {};       // path → Promise

function swrCacheKey(path) {
  return `${getToken() || 'anon'}|${path}`;
}

function readSwrLocal(path) {
  try {
    const raw = localStorage.getItem(SWR_CACHE_PREFIX + swrCacheKey(path));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeSwrLocal(path, data) {
  try {
    localStorage.setItem(SWR_CACHE_PREFIX + swrCacheKey(path), JSON.stringify(data));
  } catch { /* private mode — best effort */ }
}

function clearSwrForToken(token) {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SWR_CACHE_PREFIX)) keys.push(k);
    }
    const prefix = SWR_CACHE_PREFIX + `${token || 'anon'}|`;
    for (const k of keys) {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
  swrCache.clear();
}

// cachedGet(path, opts):
//   • Fresh in-memory entry (< ttl)   → return it with no network
//   • Another caller already fetching → share that promise (single-flight)
//   • Otherwise → fetch once, cache in memory + localStorage for the next
//     navigation/visit within the TTL window.
async function cachedGet(path, { ttl = 60000 } = {}) {
  const key = swrCacheKey(path);
  const now = Date.now();

  const mem = swrCache.get(key);
  if (mem && now - mem.t < ttl) return mem.data;

  if (swrInFlight[path]) return swrInFlight[path];

  const req = request('GET', path)
    .then(data => {
      swrCache.set(key, { t: Date.now(), data });
      writeSwrLocal(path, data);
      return data;
    })
    .finally(() => { delete swrInFlight[path]; });

  swrInFlight[path] = req;
  return req;
}

// Drop the cached copies after a mutation so the next read revalidates.
// Matches by exact path AND by prefix, so query-string variants
// (e.g. /attendance/student-records?studentId=X&from=…) are also cleared.
function invalidateSwr(...pathPatterns) {
  for (const p of pathPatterns) {
    if (swrCache.has(p)) swrCache.delete(p);
    // Prefix sweep: any cachedGet entry whose token-keyed path starts with p
    for (const [k] of swrCache) {
      const sep = k.indexOf('|');
      const pathPart = sep >= 0 ? k.slice(sep + 1) : k;
      if (pathPart.startsWith(p)) swrCache.delete(k);
    }
    delete swrInFlight[p];
    try {
      const localPrefix = SWR_CACHE_PREFIX + swrCacheKey(p);
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(localPrefix)) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch { /* ignore */ }
  }
}

const api = {
  // Auth
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  verify2FA: (username, otp) => request('POST', '/auth/2fa/verify', { username, otp }),
  register: (data) => request('POST', '/auth/register', data),
  changePassword: (userId, oldPassword, newPassword) =>
    request('PUT', '/auth/change-password', { userId, oldPassword, newPassword }),
  resetPassword: (id) => request('PUT', `/auth/reset-password/${id}`),
  reset2FA: (id) => request('PUT', `/auth/reset-2fa/${id}`),
  enable2FA: (id) => request('PUT', `/auth/enable-2fa/${id}`),
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
  getClassSchedule: (className) => cachedGet(`/schedules/${encodeURIComponent(className)}`, { ttl: 120000 }),
  saveClassSchedule: (className, data) => {
    invalidateSwr(`/schedules/${encodeURIComponent(className)}`);
    return request('PUT', `/schedules/${encodeURIComponent(className)}`, data);
  },
  deleteClassSchedule: (className) => {
    invalidateSwr(`/schedules/${encodeURIComponent(className)}`);
    return request('DELETE', `/schedules/${encodeURIComponent(className)}`);
  },

  // Attendance
  getGeofences: () => request('GET', '/attendance/geofences'),
  getGeofencesForClass: (className) => cachedGet(`/attendance/geofences/${encodeURIComponent(className)}`, { ttl: 120000 }),
  createGeofence: (data) => {
    invalidateSwr('/attendance/geofences');
    return request('POST', '/attendance/geofences', data);
  },
  updateGeofence: (id, data) => {
    invalidateSwr('/attendance/geofences');
    return request('PUT', `/attendance/geofences/${id}`, data);
  },
  deleteGeofence: (id) => {
    invalidateSwr('/attendance/geofences');
    return request('DELETE', `/attendance/geofences/${id}`);
  },
  markAttendance: (data) => {
    // Clear cached attendance for the affected student so history refreshes
    const sId = data?.studentId;
    invalidateSwr('/attendance/my', `/attendance/student/${sId}`);
    return request('POST', '/attendance/mark', data);
  },
  getAttendanceRecords: (params) => {
    const qs = new URLSearchParams(params).toString();
    return cachedGet(`/attendance/records${qs ? '?' + qs : ''}`, { ttl: 30000 });
  },
  getStudentAttendance: (studentId) => cachedGet(`/attendance/student/${studentId}`, { ttl: 30000 }),
  getStudentAttendanceRecords: (studentId, from, to) => {
    const qs = new URLSearchParams({ studentId });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return cachedGet(`/attendance/student-records?${qs.toString()}`, { ttl: 30000 });
  },
  getAttendanceSummary: (className, date) => {
    const qs = date ? `?date=${date}` : '';
    return request('GET', `/attendance/summary/${encodeURIComponent(className)}${qs}`);
  },
  approveAttendance: (id, action) => {
    invalidateSwr('/attendance/records', '/attendance/my', '/attendance/report');
    return request('PUT', `/attendance/approve/${id}`, { action });
  },
  bulkAttendanceAction: (ids, action) => {
    invalidateSwr('/attendance/records', '/attendance/my', '/attendance/report');
    return request('PUT', '/attendance/bulk-action', { ids, action });
  },
  updateAttendancePresence: (id, presence) => {
    invalidateSwr('/attendance/records', '/attendance/my');
    return request('PUT', `/attendance/${id}/presence`, { presence });
  },
  deleteAttendanceRecord: (id) => {
    invalidateSwr('/attendance/records', '/attendance/my', '/attendance/report');
    return request('DELETE', `/attendance/${id}`);
  },
  getAttendanceReport: (params) => {
    const qs = new URLSearchParams(params).toString();
    return cachedGet(`/attendance/report${qs ? '?' + qs : ''}`, { ttl: 30000 });
  },
  reportAttendanceAction: (studentId, from, to, action) => {
    invalidateSwr('/attendance/report', `/attendance/student/${studentId}`, `/attendance/student-records`);
    return request('PUT', '/attendance/report-action', { studentId, from, to, action });
  },
  getMyAttendance: () => cachedGet('/attendance/my', { ttl: 30000 }),

  // Chat
  getChatMessages: (channel, limit = 100, before) => {
    let qs = `?limit=${limit}`;
    if (before) qs += `&before=${before}`;
    return request('GET', `/chat/messages/${channel}${qs}`);
  },
  sendChatMessage: (channel, message) => request('POST', '/chat/messages', { channel, message }),
  deleteChatMessage: (id) => request('DELETE', `/chat/messages/${id}`),

  // Student Cards
  getStudentCards: () => cachedGet('/cards'),
  getMyCard: () => cachedGet('/cards/my', { ttl: 30000 }),
  uploadCardPhoto: (studentId, file) => {
    // Raw-bytes upload (JPG/PNG/WebP) — the server validates the actual image content
    const headers = { Authorization: `Bearer ${getToken()}`, 'Content-Type': file.type || 'image/jpeg' };
    return fetch(`${BASE}/cards/upload/${studentId}`, { method: 'POST', headers, body: file })
      .then(async (res) => {
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        invalidateSwr('/cards', '/cards/my');
        return data;
      });
  },
  approveCardPhoto: (id) => {
    invalidateSwr('/cards', '/cards/my');
    return request('PUT', `/cards/${id}/approve`);
  },
  rejectCardPhoto: (id, note) => {
    invalidateSwr('/cards', '/cards/my');
    return request('PUT', `/cards/${id}/reject`, { note });
  },

  // Teacher Cards
  getTeacherCards: () => cachedGet('/teacher-cards'),
  getMyTeacherCard: () => cachedGet('/teacher-cards/my', { ttl: 30000 }),
  uploadTeacherCardPhoto: (name, file) => {
    // Raw-bytes upload (JPG/PNG/WebP) — the server validates the actual image content
    const headers = { Authorization: `Bearer ${getToken()}`, 'Content-Type': file.type || 'image/jpeg' };
    return fetch(`${BASE}/teacher-cards/upload/${encodeURIComponent(name)}`, { method: 'POST', headers, body: file })
      .then(async (res) => {
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        invalidateSwr('/teacher-cards', '/teacher-cards/my');
        return data;
      });
  },
  approveTeacherCardPhoto: (id) => {
    invalidateSwr('/teacher-cards', '/teacher-cards/my');
    return request('PUT', `/teacher-cards/${id}/approve`);
  },
  rejectTeacherCardPhoto: (id, note) => {
    invalidateSwr('/teacher-cards', '/teacher-cards/my');
    return request('PUT', `/teacher-cards/${id}/reject`, { note });
  },

  // Bootstrap — one request replaces the old 9-call login data storm
  getBootstrap: () => {
    const token = getToken();
    if (bootstrapInFlight && bootstrapInFlight.token === token) {
      return bootstrapInFlight.promise;
    }
    const promise = request('GET', '/bootstrap').finally(() => {
      if (bootstrapInFlight && bootstrapInFlight.promise === promise) bootstrapInFlight = null;
    });
    bootstrapInFlight = { token, promise };
    return promise;
  },

  // Read a cached copy (memory → localStorage) so pages can paint instantly
  // before the background revalidation replaces it with fresh data. Matches
  // exact key first, then any cached entry whose path starts with `path`
  // (covers query-string variants like /attendance/records?className=…).
  getSwrCache: (path) => {
    const key = swrCacheKey(path);
    if (swrCache.has(key)) return swrCache.get(key).data;
    // Prefix sweep on the in-memory map
    for (const [k, entry] of swrCache) {
      const sep = k.indexOf('|');
      const pathPart = sep >= 0 ? k.slice(sep + 1) : k;
      if (pathPart.startsWith(path)) return entry.data;
    }
    return readSwrLocal(path);
  },

  // Expose for DataContext to invalidate card caches after student/teacher CRUD
  invalidateSwr,

  // Token management
  setToken,
  getToken,
  clearToken,
};

export default api;
