// importUtils.js - shared parsing helpers for bulk-importing
// students / teachers / subjects / classes from Excel files or OCR'd images.

export const ENTITY_COLUMNS = {
  student: {
    label: 'Student',
    required: ['name'],
    columns: [
      { key: 'name', aliases: ['name', 'student', 'studentname', 'fullname'] },
      { key: 'email', aliases: ['email', 'emailaddress'] },
      { key: 'phone', aliases: ['phone', 'mobile', 'contact', 'phonenumber'] },
      { key: 'rollNo', aliases: ['rollno', 'roll', 'rollnumber'] },
      { key: 'className', aliases: ['classname', 'class', 'section', 'cls'] },
      { key: 'gender', aliases: ['gender', 'sex'] },
      { key: 'address', aliases: ['address', 'addr'] },
      { key: 'dateOfBirth', aliases: ['dateofbirth', 'dob'] },
      { key: 'admissionDate', aliases: ['admissiondate', 'admission'] },
      { key: 'status', aliases: ['status', 'state'] },
    ],
    defaults: { status: 'Active' },
  },
  teacher: {
    label: 'Teacher',
    required: ['name'],
    columns: [
      { key: 'name', aliases: ['name', 'teacher', 'teachername', 'fullname'] },
      { key: 'email', aliases: ['email', 'emailaddress'] },
      { key: 'phone', aliases: ['phone', 'mobile', 'contact'] },
      { key: 'subject', aliases: ['subject', 'subjectname', 'course'] },
      { key: 'qualification', aliases: ['qualification', 'degree'] },
      { key: 'experience', aliases: ['experience', 'years'] },
      { key: 'className', aliases: ['classname', 'class', 'section'] },
      { key: 'joiningDate', aliases: ['joiningdate', 'hiredate'] },
    ],
    defaults: {},
  },
  subject: {
    label: 'Subject',
    required: ['name', 'code'],
    columns: [
      { key: 'name', aliases: ['name', 'subject', 'subjectname', 'title'] },
      { key: 'code', aliases: ['code', 'subjectcode'] },
      { key: 'teacher', aliases: ['teacher', 'teachername'] },
      { key: 'credits', aliases: ['credits', 'credit'] },
      { key: 'className', aliases: ['classname', 'class', 'section'] },
    ],
    defaults: { credits: '3' },
  },
  class: {
    label: 'Class',
    required: ['name', 'code'],
    columns: [
      { key: 'name', aliases: ['name', 'class', 'classname', 'title'] },
      { key: 'code', aliases: ['code', 'classcode'] },
      { key: 'description', aliases: ['description', 'desc'] },
      { key: 'semester', aliases: ['semester', 'sem'] },
    ],
    defaults: {},
  },
};

// ── Helpers ──

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '');
}

function fieldForHeader(type, header) {
  const norm = normalizeHeader(header);
  if (!norm) return null;
  const def = ENTITY_COLUMNS[type];
  for (const col of def.columns) {
    for (const alias of col.aliases) {
      if (normalizeHeader(alias) === norm) return col.key;
    }
  }
  return null;
}

function cleanCell(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// ── Excel parser ──

/**
 * Parse an array-of-arrays (sheet data) into entity objects.
 * If hasHeader, the first row is treated as headers matched by label aliases;
 * otherwise columns follow the canonical order.
 */
export function buildRows(type, sheetData, hasHeader) {
  const def = ENTITY_COLUMNS[type];
  const order = def.columns.map(c => c.key);
  const rows = [];

  // skip leading empty rows
  let start = 0;
  while (start < sheetData.length &&
         (sheetData[start] || []).every(c => !String(c || '').trim())) start++;

  if (start >= sheetData.length) return rows;

  let headerMap = null;
  let bodyIndex = start;

  if (hasHeader) {
    headerMap = {};
    const headerRow = sheetData[start];
    headerRow.forEach((h, idx) => {
      const field = fieldForHeader(type, h);
      if (field) headerMap[idx] = field;
    });
    bodyIndex = start + 1;
    if (Object.keys(headerMap).length === 0) {
      headerMap = null;
      bodyIndex = start;
    }
  }

  for (let i = bodyIndex; i < sheetData.length; i++) {
    const cells = sheetData[i] || [];
    if (cells.every(c => !String(c || '').trim())) continue;

    const obj = {};
    if (headerMap) {
      for (const idx in headerMap) {
        obj[headerMap[idx]] = cleanCell(cells[Number(idx)]);
      }
    } else {
      const limit = Math.min(order.length, cells.length);
      for (let j = 0; j < limit; j++) {
        const val = cleanCell(cells[j]);
        if (val !== '') obj[order[j]] = val;
      }
    }

    if (Object.values(obj).every(v => !String(v || '').trim())) continue;
    rows.push(obj);
  }
  return rows;
}

// ── OCR / pasted text parser ──

/**
 * Parse OCR / pasted text lines into entity objects.
 * Supports tab, comma, pipe and multi-space separators.
 * Auto-detects header row if first line matches known header aliases.
 */
export function parseTextRows(type, text) {
  const def = ENTITY_COLUMNS[type];
  const order = def.columns.map(c => c.key);
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return { rows: [], hasHeader: null };

  const splitCells = (line) => {
    if (line.includes('\t')) return line.split('\t').map(c => c.trim());
    if (line.includes('|')) return line.split('|').map(c => c.trim());
    if (line.includes(',')) return line.split(',').map(c => c.trim());
    return line.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);
  };

  const firstSplit = splitCells(lines[0]);
  const headerDetected = firstSplit.some(h => fieldForHeader(type, h) !== null)
    && firstSplit.length >= 2;

  let headerMap = null;
  let start = 0;
  if (headerDetected) {
    headerMap = {};
    firstSplit.forEach((h, idx) => {
      const field = fieldForHeader(type, h);
      if (field) headerMap[idx] = field;
    });
    start = 1;
  }

  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    if (cells.length === 0) continue;
    const obj = {};
    if (headerMap) {
      for (const idx in headerMap) {
        obj[headerMap[idx]] = cells[Number(idx)] || '';
      }
    } else {
      const limit = Math.min(order.length, cells.length);
      for (let j = 0; j < limit; j++) {
        if (cells[j]) obj[order[j]] = cells[j];
      }
    }
    if (Object.values(obj).every(v => !String(v).trim())) continue;
    rows.push(obj);
  }
  return { rows, hasHeader: headerDetected };
}

// ── Validation & defaults ──

/** Validate a row; returns list of missing required field keys. */
export function validateRow(type, row) {
  const def = ENTITY_COLUMNS[type];
  return def.required.filter(k => !String(row[k] || '').trim());
}

/** Apply default values for empty fields. */
export function applyDefaults(type, row, index = 0) {
  const def = ENTITY_COLUMNS[type];
  const out = { ...row };
  for (const [k, v] of Object.entries(def.defaults)) {
    if (!out[k] || out[k] === '') out[k] = v;
  }
  // Auto-generate unique rollNo for students when not provided (prevents UNIQUE constraint collisions)
  if (type === 'student' && (!out.rollNo || !String(out.rollNo).trim())) {
    out.rollNo = `STU-${String(Date.now()).slice(-5)}${String(index + 1).padStart(3, '0')}`;
  }
  return out;
}
