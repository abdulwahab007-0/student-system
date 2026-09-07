// ============================================================================
// api/index.js — Vercel serverless entry point.
//
// Vercel maps every request under /api/* to this function. We simply re-export
// the Express app built in server/app.js. The connection-pooled Supabase
// backend is selected automatically when SUPABASE_DB_URL / DATABASE_URL is
// configured in the Vercel project environment.
// ============================================================================

import app from '../server/app.js';

export default app;