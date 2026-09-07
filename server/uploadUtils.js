// ============================================================================
// server/uploadUtils.js — shared card-photo upload directory logic.
//
// Local dev  →  <project>/uploads/cards  (persistent, served by Express static)
// Vercel     →  /tmp/uploads/cards       (writable — but EPHEMERAL between
//              cold starts; for durable photo storage use Supabase Storage)
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const isVercel = process.env.VERCEL === '1';

export const UPLOAD_DIR = isVercel
  ? path.join(os.tmpdir(), 'uploads', 'cards')
  : path.join(__dirname, '..', '..', 'uploads', 'cards');

export function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}