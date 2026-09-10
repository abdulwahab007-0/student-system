// Shared score calculation utilities used consistently across Dashboard,
// Students, and Marks pages so a student's average is always the same value.

// ── Configurable defaults ─────────────────────────────────────────────────
// These are the factory-reset values. Users can override via localStorage.

const DEFAULT_SCHEME = [
  { key: 'Assignment', short: 'Assign',  max: 10, group: 'Sessional' },
  { key: 'Attendance', short: 'Attend',  max: 5,  group: 'Sessional' },
  { key: 'Quiz',       short: 'Quiz',    max: 15, group: 'Sessional' },
  { key: 'Mid',        short: 'Mid',     max: 30, group: 'Mid Term' },
  { key: 'Final',      short: 'Final',   max: 40, group: 'Final Term' },
];

const DEFAULT_GRADE_THRESHOLDS = [
  { min: 90, grade: 'A+' },
  { min: 85, grade: 'A'  },
  { min: 80, grade: 'A-' },
  { min: 75, grade: 'B+' },
  { min: 70, grade: 'B'  },
  { min: 65, grade: 'B-' },
  { min: 60, grade: 'C+' },
  { min: 50, grade: 'C'  },
  { min: 40, grade: 'D'  },
  { min: 0,  grade: 'F'  },
];

const STORAGE_KEY_SCHEME = 'sms_exam_scheme';
const STORAGE_KEY_GRADES = 'sms_grade_thresholds';

// ── Internal readers (fall back to defaults) ───────────────────────────────
function readSchemeStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCHEME);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p; }
  } catch {}
  return DEFAULT_SCHEME;
}

function readGradeStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GRADES);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p; }
  } catch {}
  return DEFAULT_GRADE_THRESHOLDS;
}

// ── Public API: exam scheme ────────────────────────────────────────────────
/** Get the current exam scheme (fresh from localStorage). */
export function getExamScheme() { return readSchemeStorage(); }

/** Save a new exam scheme. */
export function setExamScheme(scheme) {
  try { localStorage.setItem(STORAGE_KEY_SCHEME, JSON.stringify(scheme)); } catch {}
}

/** Total marks across all components. */
export function getSchemeTotal() { return readSchemeStorage().reduce((s, e) => s + e.max, 0); }

/** Map of key → max marks. */
export function getSchemeMax() {
  const m = {};
  readSchemeStorage().forEach(e => { m[e.key] = e.max; });
  return m;
}

/** Set of valid keys. */
export function getSchemeKeys() {
  return new Set(readSchemeStorage().map(e => e.key));
}

/** Sessional component keys. */
export function getSessionalKeys() {
  return readSchemeStorage().filter(e => e.group === 'Sessional').map(e => e.key);
}

// ── Public API: grade thresholds ───────────────────────────────────────────
/** Get grade thresholds sorted descending by min. */
export function getGradeThresholds() {
  return readGradeStorage().slice().sort((a, b) => b.min - a.min);
}

/** Save new grade thresholds. */
export function setGradeThresholds(thresholds) {
  try { localStorage.setItem(STORAGE_KEY_GRADES, JSON.stringify(thresholds)); } catch {}
}

/** Reset both scheme and grading to factory defaults. */
export function resetExamDefaults() {
  try {
    localStorage.removeItem(STORAGE_KEY_SCHEME);
    localStorage.removeItem(STORAGE_KEY_GRADES);
  } catch {}
}

// ── Backward-compatible aliases (read fresh each time) ─────────────────────
// These let existing import { EXAM_SCHEME, SCHEME_TOTAL, ... } continue to
// work.  However, because they're module-level constants they only capture the
// value at first import.  Prefer the getter functions above for dynamic use.
export const EXAM_SCHEME = readSchemeStorage();
export const SCHEME_TOTAL = EXAM_SCHEME.reduce((s, e) => s + e.max, 0);
export const SCHEME_MAX = {};
EXAM_SCHEME.forEach(e => { SCHEME_MAX[e.key] = e.max; });
export const SCHEME_KEYS = new Set(EXAM_SCHEME.map(e => e.key));
export const SESSIONAL_KEYS = EXAM_SCHEME.filter(e => e.group === 'Sessional').map(e => e.key);

/** Map raw/legacy exam-type strings to scheme keys. */
const SCHEME_ALIASES = {
  assignment:  'Assignment', assignments: 'Assignment',
  attendance:  'Attendance', attend:      'Attendance',
  quiz:        'Quiz',       quizzes:     'Quiz',
  mid:         'Mid',        midterm:     'Mid', 'mid-term': 'Mid', 'mid term': 'Mid',
  final:       'Final',      'final term': 'Final', 'final exam': 'Final',
};

/**
 * Normalise a legacy or raw exam-type string to a scheme key.
 * Unknown types (e.g. old Quarterly / Half Yearly) are returned as-is (lowercase).
 */
export function normalizeExamType(raw) {
  const k = String(raw || '').trim().toLowerCase();
  return SCHEME_ALIASES[k] || k;
}

/**
 * Calculate a student's overall average percentage from their mark records.
 * Uses the semester exam scheme: for each subject the total obtained across
 * components is divided by the scheme total (100).  Subject percentages are
 * averaged to produce the overall number.
 * Falls back to legacy per-record-100% calculation when data exceeds scheme caps.
 * Returns 0 when there are no marks.
 */
export function getStudentAverage(marks) {
  if (!marks || marks.length === 0) return 0;

  const schemeMax = getSchemeMax();

  const grouped = {};
  marks.forEach(m => {
    const subject = m.subject || 'Subject';
    if (!grouped[subject]) grouped[subject] = [];
    grouped[subject].push(m);
  });

  const subjectPercents = Object.values(grouped).map(records => {
    const totalObtained = records.reduce((sum, r) => sum + (Number(r.marks) || 0), 0);

    // Detect legacy mode: any record value exceeds its scheme max or is unknown type
    const isLegacy = records.some(r => {
      const key = normalizeExamType(r.examType);
      return !schemeMax[key] || (Number(r.marks) || 0) > (schemeMax[key] || 100);
    });

    let possible;
    if (isLegacy) {
      possible = records.length * 100;
    } else {
      possible = records.reduce((sum, r) => sum + (schemeMax[normalizeExamType(r.examType)] || 100), 0);
    }
    if (possible === 0) possible = Math.max(totalObtained, 1);

    const pct = Math.min(100, (totalObtained / possible) * 100);
    return Math.round(pct * 10) / 10;
  });

  const overall = subjectPercents.reduce((a, b) => a + b, 0) / subjectPercents.length;
  return Math.round(overall * 10) / 10;
}

/**
 * Get total marks obtained and total marks possible (per scheme).
 */
export function getMarksTotals(marks) {
  const list = Array.isArray(marks) ? marks : [];
  const schemeMax = getSchemeMax();
  const total = list.reduce((sum, m) => sum + (Number(m.marks) || 0), 0);
  const maxPossible = list.reduce((sum, m) => {
    const key = normalizeExamType(m.examType);
    return sum + (schemeMax[key] || 100);
  }, 0);
  return { total, maxPossible: maxPossible || list.length * 100 };
}