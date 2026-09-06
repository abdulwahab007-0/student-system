// Class suggestions for class fields across the system.
// The official `classes` list (managed in the admin Classes page) is the primary
// source; any class names found in students/teachers/subjects data are also
// included so existing records always show up.
export function getAllClassSuggestions(classes = [], students = [], teachers = [], subjects = [], { officialOnly = false } = {}) {
  const names = new Set();

  // Official classes list first (single source of truth)
  classes.forEach(c => { if (c.name) names.add(c.name); });

  // When only official classes should be offered (e.g. the teacher class menu),
  // stop here so deleted classes never reappear from data or defaults.
  if (officialOnly) return [...names].sort();

  // Data scan as fallback / for legacy records
  students.forEach(s => { if (s.className) names.add(s.className); });
  teachers.forEach(t => { if (t.className) names.add(t.className); });
  // Subjects may hold comma-separated multi-class assignments; expand them
  subjects.forEach(s => {
    if (s.className) (s.className.split(',').map(c => c.trim()).filter(Boolean)).forEach(c => names.add(c));
  });

  return [...names].sort();
}