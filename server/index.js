import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, seedDatabase } from './db.js';
import db from './db.js';
import { authMiddleware, requirePermission } from './middleware/auth.js';
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

const app = express();
const PORT = process.env.PORT || 3001;

// Uploaded files (student card photos) live under /uploads and are served statically
const __dirname = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'cards'), { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

initDatabase();
seedDatabase();

// Auth routes don't need auth
app.use('/api/auth', authRoutes);

// Data reset (auth + super-admin)
app.post('/api/data/reset', authMiddleware, requirePermission('assign_cr'), (req, res) => {
  db.exec('DELETE FROM role_permissions; DELETE FROM marks; DELETE FROM students; DELETE FROM teachers; DELETE FROM subjects; DELETE FROM classes; DELETE FROM class_schedules; DELETE FROM chat_messages; DELETE FROM student_cards; DELETE FROM teacher_cards;');
  res.json({ success: true, message: 'Data reset; restart server to reseed defaults.' });
});

// All other routes require authentication
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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler — always return JSON so the client never gets an empty body
app.use((err, req, res, _next) => {
  console.error('Unhandled server error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
