// ============================================================================
// server/app.js — Express application (no listen).
//
// This module is imported by both:
//   • server/index.js  (local dev — calls app.listen)
//   • api/index.js     (Vercel serverless — exports the handler)
// ============================================================================

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDatabase, seedDatabase } from './db.js';
import { authMiddleware, requirePermission } from './middleware/auth.js';
import { UPLOAD_DIR, ensureUploadDir } from './uploadUtils.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import permissionsRoutes from './routes/permissions.js';
import studentsRoutes from './routes/students.js';
import teachersRoutes from './routes/teachers.js';
import subjectsRoutes from './routes/subjects.js';
import marksRoutes from './routes/marks.js';
import classesRoutes from './routes/classes.js';
import schedulesRoutes from './routes/schedules.js';
import attendanceRoutes from './routes/attendance.js';
import chatRoutes from './routes/chat.js';
import cardsRoutes from './routes/cards.js';
import teacherCardsRoutes from './routes/teacherCards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const useSupabase = !!(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);

// ── Ensure upload directory exists (locally persistent; /tmp on Vercel)
ensureUploadDir();

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded card photos. UPLOAD_DIR is <project>/uploads/cards locally and
// /tmp/uploads/cards on Vercel — the parent dir is what we export statically.
app.use('/uploads', express.static(path.join(UPLOAD_DIR, '..')));

// ── Initialise database (idempotent — safe to call on every cold start) ──
await initDatabase();
await seedDatabase();

// ── Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Data reset (auth + super-admin)
app.post('/api/data/reset', authMiddleware, requirePermission('assign_cr'), async (req, res) => {
  await db.exec('DELETE FROM role_permissions; DELETE FROM marks; DELETE FROM students; DELETE FROM teachers; DELETE FROM subjects; DELETE FROM classes; DELETE FROM class_schedules; DELETE FROM chat_messages; DELETE FROM student_cards; DELETE FROM teacher_cards;');
  res.json({ success: true, message: 'Data reset; restart server to reseed defaults.' });
});

app.use('/api/users', authMiddleware, adminRoutes);
app.use('/api/permissions', authMiddleware, permissionsRoutes);
app.use('/api/students', authMiddleware, studentsRoutes);
app.use('/api/teachers', authMiddleware, teachersRoutes);
app.use('/api/subjects', authMiddleware, subjectsRoutes);
app.use('/api/marks', authMiddleware, marksRoutes);
app.use('/api/classes', authMiddleware, classesRoutes);
app.use('/api/schedules', authMiddleware, schedulesRoutes);
app.use('/api/attendance', authMiddleware, attendanceRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/cards', authMiddleware, cardsRoutes);
app.use('/api/teacher-cards', authMiddleware, teacherCardsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', backend: useSupabase ? 'supabase' : 'sqlite' }));

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled server error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default app;