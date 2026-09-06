// Shared score calculation utilities used consistently across Dashboard,
// Students, and Marks pages so a student's average is always the same value.

/**
 * Calculate a student's overall average percentage from their mark records.
 * Each subject is averaged across its exam records first, then subject
 * averages are averaged together so subjects are not double-counted.
 * Returns 0 when there are no marks.
 */
export function getStudentAverage(marks) {
  if (!marks || marks.length === 0) return 0;

  const grouped = {};
  marks.forEach(m => {
    const subject = m.subject || 'Subject';
    if (!grouped[subject]) grouped[subject] = [];
    grouped[subject].push(Number(m.marks) || 0);
  });

  const subjectAverages = Object.values(grouped).map(
    scores => scores.reduce((a, b) => a + b, 0) / scores.length
  );
  const overall = subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length;
  return Math.round(overall * 10) / 10;
}

/**
 * Get total marks obtained and total marks possible (each exam out of 100).
 */
export function getMarksTotals(marks) {
  const list = Array.isArray(marks) ? marks : [];
  const total = list.reduce((sum, m) => sum + (Number(m.marks) || 0), 0);
  const maxPossible = list.length * 100;
  return { total, maxPossible };
}