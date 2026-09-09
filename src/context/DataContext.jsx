import { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

// ── localStorage stale-while-revalidate cache ────────────────────────────
// Keyed by the current user's id so each account gets its own independent
// snapshot. On page load the cache is applied synchronously so the dashboard
// renders instantly, then a background fetch of the bootstrap endpoint keeps
// the data fresh. Writes are best-effort (private / incognito tabs limit
// storage).
const DATA_CACHE_PREFIX = 'sms_data_';

function readDataCache(userId) {
  try {
    const raw = localStorage.getItem(DATA_CACHE_PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeDataCache(userId, data) {
  try { localStorage.setItem(DATA_CACHE_PREFIX + userId, JSON.stringify(data)); } catch {}
}

function clearDataCache(userId) {
  try { localStorage.removeItem(DATA_CACHE_PREFIX + userId); } catch {}
}

const DataContext = createContext();

export function DataProvider({ children }) {
  const { currentUser } = useAuth();
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [marks, setMarks] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Track the user id across the previous render so we can clear stale cache
  // entries when the user logs out (ref avoids stale closure issues).
  const prevUserId = useRef(currentUser?.id ?? null);

  // Apply one bootstrap payload to all five lists.
  const applyData = (data) => {
    setStudents(Array.isArray(data.students) ? data.students : []);
    setTeachers(Array.isArray(data.teachers) ? data.teachers : []);
    setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
    setMarks(Array.isArray(data.marks) ? data.marks : []);
    setClasses(Array.isArray(data.classes) ? data.classes : []);
  };

  // Fetch all data when a user logs in (or when an already-signed-in user
  // loads the page — currentUser is restored from localStorage on mount).
  // Uses the single /api/bootstrap endpoint (deduped via api.getBootstrap)
  // instead of the old 5-call Promise.allSettled.
  useEffect(() => {
    if (!currentUser) {
      // Logged out — wipe this tab's cache so a re-login by a different user
      // doesn't see stale data.
      clearDataCache(prevUserId.current);
      prevUserId.current = null;
      setStudents([]); setTeachers([]); setSubjects([]);
      setMarks([]); setClasses([]);
      setLoading(false);
      return;
    }
    prevUserId.current = currentUser.id;

    // Stale-while-revalidate: if the user's previous visit cached its data,
    // paint it immediately so the dashboard is usable without waiting.
    const cached = readDataCache(currentUser.id);
    if (cached) {
      applyData(cached);
      setLoading(false);        // no spinner — cached data shown
    } else {
      setLoading(true);         // no cache → show loading state
    }

    api.getBootstrap()
      .then(data => {
        applyData(data);
        writeDataCache(currentUser.id, data);
      })
      .catch(err => console.error('Failed to load data:', err))
      .finally(() => setLoading(false));
  }, [currentUser?.id]);

  // Keep data in sync across browser tabs. When any tab mutates data it bumps
  // the version marker in localStorage; the storage event fires in *other* tabs
  // (never the tab that wrote it), so they re-fetch the fresh lists via resetData.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'sms_data_version' && e.newValue !== e.oldValue) {
        // resetData is idempotent and reloads all lists from the server
        resetData().catch(err => console.error('Failed to sync data:', err));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ── Student CRUD ──
  const addStudent = async (data) => {
    const created = await api.createStudent(data);
    setStudents(prev => [...prev, created]);
    // Adding a student with a brand-new class auto-creates that class on the
    // server, so refresh the class list to keep the Classes section in sync.
    try { setClasses(await api.getClasses()); } catch {}
    api.invalidateSwr('/cards', '/cards/my');   // new student → new card row
    bumpDataVersion();
    return created.id;
  };
  const updateStudent = async (id, data) => {
    const updated = await api.updateStudent(id, data);
    setStudents(prev => prev.map(s => s.id === id ? updated : s));
    api.invalidateSwr('/cards', '/cards/my');   // name/class change → cards update
    bumpDataVersion();
  };
  const deleteStudent = async (id) => {
    await api.deleteStudent(id);
    setStudents(prev => prev.filter(s => s.id !== id));
    setMarks(prev => prev.filter(m => m.studentId !== id));
    api.invalidateSwr('/cards', '/cards/my');   // removed student → cards update
    bumpDataVersion();
  };
  const bulkDeleteStudents = async (ids) => {
    await api.bulkDeleteStudents(ids);
    setStudents(prev => prev.filter(s => !ids.includes(s.id)));
    setMarks(prev => prev.filter(m => !ids.includes(m.studentId)));
    api.invalidateSwr('/cards', '/cards/my');
    bumpDataVersion();
  };

  // ── Teacher CRUD ──
  const addTeacher = async (data) => {
    const created = await api.createTeacher(data);
    setTeachers(prev => [...prev, created]);
    api.invalidateSwr('/teacher-cards', '/teacher-cards/my');   // new teacher → new card row
    bumpDataVersion();
    return created.id;
  };
  const updateTeacher = async (id, data) => {
    const updated = await api.updateTeacher(id, data);
    setTeachers(prev => prev.map(t => t.id === id ? updated : t));
    api.invalidateSwr('/teacher-cards', '/teacher-cards/my');   // name/class change → cards update
    bumpDataVersion();
  };
  const deleteTeacher = async (id) => {
    await api.deleteTeacher(id);
    setTeachers(prev => prev.filter(t => t.id !== id));
    api.invalidateSwr('/teacher-cards', '/teacher-cards/my');   // removed teacher → cards update
    bumpDataVersion();
  };

  // ── Subject CRUD ──
  // Recompute each teacher's className from the (updated) subjects list, so the
  // teachers array on the client stays in sync with the classes selected on the
  // subjects that teacher teaches. Same rule as the server-side sync.
  const recomputeTeacherClasses = (subjectsList) => {
    setTeachers(prev => prev.map(t => {
      const name = (t.name || '').trim().toLowerCase();
      if (!name) return t;
      const classes = new Set();
      subjectsList.forEach(s => {
        if ((s.teacher || '').trim().toLowerCase() !== name) return;
        (s.className || '').split(',').map(c => c.trim()).filter(Boolean).forEach(c => classes.add(c));
      });
      const joined = [...classes].sort().join(', ');
      return t.className === joined ? t : { ...t, className: joined };
    }));
  };

  const addSubject = async (data) => {
    const created = await api.createSubject(data);
    const next = [...subjects, created];
    setSubjects(next);
    recomputeTeacherClasses(next);   // keep teachers' classes in sync from subjects
    api.invalidateSwr('/teacher-cards', '/teacher-cards/my');   // subjects drive the teacher roster
    bumpDataVersion();
    return created.id;
  };
  const updateSubject = async (id, data) => {
    const updated = await api.updateSubject(id, data);
    const next = subjects.map(s => s.id === id ? updated : s);
    setSubjects(next);
    recomputeTeacherClasses(next);   // keep teachers' classes in sync from subjects
    api.invalidateSwr('/teacher-cards', '/teacher-cards/my');   // teacher field may change
    bumpDataVersion();
  };
  const deleteSubject = async (id) => {
    await api.deleteSubject(id);
    const next = subjects.filter(s => s.id !== id);
    setSubjects(next);
    recomputeTeacherClasses(next);   // keep teachers' classes in sync from subjects
    api.invalidateSwr('/teacher-cards', '/teacher-cards/my');   // a teacher may disappear
    bumpDataVersion();
  };

  // ── Marks CRUD ──
  const addMarks = async (data) => {
    const created = await api.createMarks(data);
    setMarks(prev => [...prev, created]);
    bumpDataVersion();
    return created.id;
  };
  const updateMarks = async (id, data) => {
    const updated = await api.updateMarks(id, data);
    setMarks(prev => prev.map(m => m.id === id ? updated : m));
    bumpDataVersion();
  };
  const deleteMark = async (id) => {
    await api.deleteMark(id);
    setMarks(prev => prev.filter(m => m.id !== id));
    bumpDataVersion();
  };

  // ── Class CRUD ──
  const addClass = async (data) => {
    const created = await api.createClass(data);
    setClasses(prev => [...prev, created]);
    bumpDataVersion();
    return created.id;
  };
  const updateClass = async (id, data) => {
    const updated = await api.updateClass(id, data);
    setClasses(prev => prev.map(c => c.id === id ? updated : c));
    bumpDataVersion();
  };
  const deleteClass = async (id) => {
    await api.deleteClass(id);
    setClasses(prev => prev.filter(c => c.id !== id));
    bumpDataVersion();
  };

  // ── Reset ──
  // Write a version marker to localStorage so that OTHER open tabs see a
  // storage event and re-fetch. This tab already has fresh state via setState,
  // so it doesn't need to re-fetch after its own mutation.
  const bumpDataVersion = () => {
    try { localStorage.setItem('sms_data_version', String(Date.now())); } catch {}
  };

  const resetData = async () => {
    // Reload all data from server via the single bootstrap endpoint and
    // update both React state and the localStorage cache.
    const uid = prevUserId.current;
    const data = await api.getBootstrap();
    applyData(data);
    if (uid) writeDataCache(uid, data);
  };

  const value = {
    students, teachers, subjects, marks, classes, loading,
    addStudent, updateStudent, deleteStudent, bulkDeleteStudents,
    addTeacher, updateTeacher, deleteTeacher,
    addSubject, updateSubject, deleteSubject,
    addMarks, updateMarks, deleteMark,
    addClass, updateClass, deleteClass,
    resetData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within a DataProvider');
  return context;
}