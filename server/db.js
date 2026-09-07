// ============================================================================
// server/db.js — Unified database entry point.
//
// Conditionally loads either the SQLite backend (db.sqlite.js) or the
// Supabase/PostgreSQL backend (db.supabase.js) based on environment variables.
//
// Every route file and middleware imports `db` from here, so the correct
// backend is selected transparently.
//
// When SUPABASE_DB_URL (or DATABASE_URL) is set → async Postgres pool.
// Otherwise → better-sqlite3 (local dev, zero-config).
// ============================================================================

// Load .env first so the backend selection below sees SUPABASE_DB_URL.
// process.loadEnvFile() is built-in on Node ≥ 21.7. Quiet no-op otherwise.
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch { /* no .env present (e.g. Vercel injects env vars directly) */ }

const useSupabase = !!(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);

// Dynamic import — the unused backend is never loaded (no native binaries
// pulled in when running on Vercel / cloud).
const mod = useSupabase
  ? await import('./db.supabase.js')
  : await import('./db.sqlite.js');

export default mod.default;
export const initDatabase = mod.initDatabase;
export const seedDatabase = mod.seedDatabase;
