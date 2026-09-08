import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const DataContext = createContext();

export function DataProvider({ children }) {
  const { currentUser } = useAuth();
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [marks, setMarks] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data when a user logs in (or when an already-signed-in user
  // loads the page — currentUser is restored from localStorage on mount).
  // This removes the old "data only loads after a manual refresh" gap after login.
  useEffect(() => {
    if (!currentUser) {
      // Not logged in (or just logged out) — drop any stale data from a previous session
      setStudents([]); setTeachers([]); setSubjects([]);
      setMarks([]); setClasses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Use Promise.allSettled so that 403 errors on specific endpoints (e.g.
    // students/teachers/classes for student role) don't prevent the rest of
    // the data (subjects, marks) from loading.
    Promise.allSettled([
      api.getStudents(), api.getTeachers(), api.getSubjects(),
      api.getMarks(), api.getClasses()
    ]).then(results => {
      const ok = results.map(r => r.status === 'fulfilled' ? r.value : []);
      setStudents(ok[0]); setTeachers(ok[1]); setSubjects(ok[2]);
      setMarks(ok[3]); setClasses(ok[4]);
    }).catch(err => console.error('Failed to load data:', err))
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
    bumpDataVersion();
    return created.id;
  };
  const updateStudent = async (id, data) => {
    const updated = await api.updateStudent(id, data);
    setStudents(prev => prev.map(s => s.id === id ? updated : s));
    bumpDataVersion();
  };
  const deleteStudent = async (id) => {
    await api.deleteStudent(id);
    setStudents(prev => prev.filter(s => s.id !== id));
    setMarks(prev => prev.filter(m => m.studentId !== id));
    bumpDataVersion();
  };
  const bulkDeleteStudents = async (ids) => {
    await api.bulkDeleteStudents(ids);
    setStudents(prev => prev.filter(s => !ids.includes(s.id)));
    setMarks(prev => prev.filter(m => !ids.includes(m.studentId)));
    bumpDataVersion();
  };

  // ── Teacher CRUD ──
  const addTeacher = async (data) => {
    const created = await api.createTeacher(data);
    setTeachers(prev => [...prev, created]);
    bumpDataVersion();
    return created.id;
  };
  const updateTeacher = async (id, data) => {
    const updated = await api.updateTeacher(id, data);
    setTeachers(prev => prev.map(t => t.id === id ? updated : t));
    bumpDataVersion();
  };
  const deleteTeacher = async (id) => {
    await api.deleteTeacher(id);
    setTeachers(prev => prev.filter(t => t.id !== id));
    bumpDataVersion();
  };

  // ── Subject CRUD ──
  const addSubject = async (data) => {
    const created = await api.createSubject(data);
    setSubjects(prev => [...prev, created]);
    bumpDataVersion();
    return created.id;
  };
  const updateSubject = async (id, data) => {
    const updated = await api.updateSubject(id, data);
    setSubjects(prev => prev.map(s => s.id === id ? updated : s));
    bumpDataVersion();
  };
  const deleteSubject = async (id) => {
    await api.deleteSubject(id);
    setSubjects(prev => prev.filter(s => s.id !== id));
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
    // Reload all data from server (resilient to per-endpoint failures)
    const results = await Promise.allSettled([
      api.getStudents(), api.getTeachers(), api.getSubjects(),
      api.getMarks(), api.getClasses()
    ]);
    const [s, t, sub, m, c] = results.map(r => r.status === 'fulfilled' ? r.value : []);
    setStudents(s); setTeachers(t); setSubjects(sub);
    setMarks(m); setClasses(c);
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