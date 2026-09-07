// ============================================================================
// api/index.js — Vercel serverless entry point.
//
// Vercel maps every request under /api/* to this function. We re-export
// the Express app built in server/app.js.
//
// IMPORTANT: Vercel's filesystem routing delivers the full original URL
// (e.g. /api/auth/login) to this function. However, some rewrite configs
// or platform edge-cases can strip the /api prefix. Since Express routes
// are defined WITH the /api prefix, we normalise defensively.
// ============================================================================

import app from '../server/app.js';

export default function handler(req, res) {
  // Ensure req.url always starts with /api so Express can match its routes.
  if (!req.url.startsWith('/api')) {
    req.url = '/api' + req.url;
  }
  return app(req, res);
}