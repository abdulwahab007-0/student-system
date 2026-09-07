// ============================================================================
// server/index.js — Entry point for local development.
// In production (Vercel), api/index.js imports the app directly.
// ============================================================================

import app from './app.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  const backend = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) ? 'Supabase/Postgres' : 'SQLite';
  console.log(`Server running on http://localhost:${PORT} [backend: ${backend}]`);
});
