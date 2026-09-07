import fs from 'fs';

const sql = fs.readFileSync('supabase/schema.sql', 'utf8');
const lines = sql.split('\n');
// Remove full-line comments
const code = lines.filter(l => !/^\s*--/.test(l)).join('\n');

// 1. Parenthesis balance (rough but useful)
const open = (code.match(/\(/g) || []).length;
const close = (code.match(/\)/g) || []).length;
console.log('parens open:', open, 'close:', close, 'balanced:', open === close);

// 2. Idempotency: every CREATE TABLE/INDEX/FUNCTION has IF NOT EXISTS
const tables = [...code.matchAll(/CREATE TABLE\s+(\w+)/g)].map(m => m[1]);
const tablesIf = [...code.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map(m => m[1]);
console.log('tables:', tables.length, '| with IF NOT EXISTS:', tablesIf.length, '| idempotent:', tables.length === tablesIf.length);

// 3. FK targets are known tables
const known = new Set(tables);
const fks = [...code.matchAll(/REFERENCES\s+(\w+)/g)].map(m => m[1]);
const badFk = fks.filter(t => !known.has(t));
console.log('FK refs:', fks.join(','), '| broken FKs:', badFk.length ? badFk.join(',') : 'none');

// 4. No SQLite-only syntax remnants
const badSqlite = ['AUTOINCREMENT', 'INTEGER PRIMARY KEY', 'AUTO_INCREMENT', 'TIMESTAMP DEFAULT'];
for (const s of badSqlite) {
  if (code.includes(s)) console.log('WARNING: SQLite-only syntax found:', s);
}
console.log('schema.sql static checks done.');