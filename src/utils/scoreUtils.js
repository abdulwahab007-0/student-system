// Shared score calculation utilities used consistently across Dashboard,
// Students, and Marks pages so a student's average is always the same value.

// ── Semester exam scheme ───────────────────────────────────────────────────
// Each component has its own maximum total.  Assignment, Attendance & Quiz
// are "sessional"; then Mid Term and Final Term bring the subject total to 100.
export const EXAM_SCHEME = [
  { key: 'Assignment', short: 'Assign',  max: 10, group: 'Sessional' },
  { key: 'Attendance', short: 'Attend',  max: 5,  group: 'Sessional' },
  { key: 'Quiz',       short: 'Quiz',    max: 15, group: 'Sessional' },
  { key: 'Mid',        short: 'Mid',     max: 30, group: 'Mid Term' },
  { key: 'Final',      short: 'Final',   max: 40, group: 'Final Term' },
];

export const SCHEME_TOTAL = EXAM_SCHEME.reduce((s, e) => s + e.max, 0); // 100

export const SCHEME_MAX = {};
EXAM_SCHEME.forEach(e => { SCHEME_MAX[e.key] = e.max; });

export const SCHEME_KEYS = new Set(EXAM_SCHEME.map(e => e.key));

/** Sessional keys (first 3). */
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
      return !SCHEME_MAX[key] || (Number(r.marks) || 0) > (SCHEME_MAX[key] || 100);
    });

    let possible;
    if (isLegacy) {
      // Legacy: each record was originally out of 100
      possible = records.length * 100;
    } else {
      // New scheme: sum of component maxes
      possible = records.reduce((sum, r) => sum + (SCHEME_MAX[normalizeExamType(r.examType)] || 100), 0);
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
  const total = list.reduce((sum, m) => sum + (Number(m.marks) || 0), 0);
  const maxPossible = list.reduce((sum, m) => {
    const key = normalizeExamType(m.examType);
    return sum + (SCHEME_MAX[key] || 100);
  }, 0);
  return { total, maxPossible: maxPossible || list.length * 100 };
}