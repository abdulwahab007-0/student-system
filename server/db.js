import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'database.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, fullName TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      status TEXT NOT NULL DEFAULT 'pending',
      className TEXT, registrationDate TEXT NOT NULL,
      linkedStudentId INTEGER, crForClass TEXT,
      manageAllClasses INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT, phone TEXT,
      rollNo TEXT UNIQUE, className TEXT, gender TEXT,
      address TEXT, dateOfBirth TEXT, admissionDate TEXT,
      status TEXT DEFAULT 'Active', isCR INTEGER DEFAULT 0,
      linkedUserId INTEGER
    );
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT, phone TEXT, subject TEXT,
      qualification TEXT, experience TEXT, className TEXT, joiningDate TEXT
    );
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, code TEXT NOT NULL, teacher TEXT,
      credits INTEGER DEFAULT 3, className TEXT
    );
    CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL, studentName TEXT,
      subject TEXT NOT NULL, marks INTEGER, grade TEXT, examType TEXT,
      FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, code TEXT NOT NULL,
      description TEXT, semester TEXT
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT NOT NULL, rightKey TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (role, rightKey)
    );
    CREATE TABLE IF NOT EXISTS user_permissions (
      userId INTEGER NOT NULL, rightKey TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (userId, rightKey)
    );
    CREATE TABLE IF NOT EXISTS class_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      className TEXT NOT NULL UNIQUE,
      structure TEXT NOT NULL DEFAULT '{}',
      slots TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS student_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL UNIQUE,
      photoUrl TEXT,
      photoMime TEXT,
      cardStatus TEXT NOT NULL DEFAULT 'none',
      reviewNote TEXT,
      reviewedBy TEXT,
      issuedAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE
    );
  `);

  // Migration: add manageAllClasses to users if missing (existing databases)
  const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
  if (!userColumns.includes('manageAllClasses')) {
    db.exec('ALTER TABLE users ADD COLUMN manageAllClasses INTEGER DEFAULT 0');
  }

  // Migration: add linkedTeacherId to users if missing (to link teacher logins)
  if (!userColumns.includes('linkedTeacherId')) {
    db.exec('ALTER TABLE users ADD COLUMN linkedTeacherId INTEGER');
  }

  // Migration: drop coordinator column from classes (feature removed)
  const classColumns = db.prepare(`PRAGMA table_info(classes)`).all().map(c => c.name);
  if (classColumns.includes('coordinator')) {
    db.exec('ALTER TABLE classes DROP COLUMN coordinator');
  }

  // Chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      userName TEXT NOT NULL,
      userRole TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'public',
      message TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: create class_schedules table if not exists (existing databases)
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='class_schedules'`).all();
  if (tables.length === 0) {
    db.exec(`CREATE TABLE IF NOT EXISTS class_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      className TEXT NOT NULL UNIQUE,
      structure TEXT NOT NULL DEFAULT '{}',
      slots TEXT NOT NULL DEFAULT '{}'
    )`);
  }

  // Seed default class schedules for existing databases (no-op if already seeded)
  seedClassSchedules();

  // Migration: create student_cards table if not exists (existing databases)
  const cardTables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='student_cards'`).all();
  if (cardTables.length === 0) {
    db.exec(`CREATE TABLE IF NOT EXISTS student_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL UNIQUE,
      photoUrl TEXT,
      photoMime TEXT,
      cardStatus TEXT NOT NULL DEFAULT 'none',
      reviewNote TEXT,
      reviewedBy TEXT,
      issuedAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE
    )`);
  }

  // Migration: create teacher_cards table if not exists (existing databases).
  // Teachers are derived from the teachers table (and, when empty, from the
  // teacher names assigned to subjects), so cards are keyed by teacher name.
  const teacherCardTables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='teacher_cards'`).all();
  if (teacherCardTables.length === 0) {
    db.exec(`CREATE TABLE IF NOT EXISTS teacher_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacherName TEXT NOT NULL UNIQUE,
      photoUrl TEXT,
      photoMime TEXT,
      cardStatus TEXT NOT NULL DEFAULT 'none',
      reviewNote TEXT,
      reviewedBy TEXT,
      issuedAt TEXT,
      updatedAt TEXT
    )`);
  }

  // Migration: create attendance tables if they don't exist
  const existingTables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);
  if (!existingTables.includes('attendance_geofences')) {
    db.exec(`CREATE TABLE IF NOT EXISTS attendance_geofences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      country TEXT,
      province TEXT,
      city TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius REAL NOT NULL DEFAULT 100,
      className TEXT,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )`);
  } else {
    // Migration: add country, province, city columns if missing
    const geoCols = db.prepare(`PRAGMA table_info(attendance_geofences)`).all().map(c => c.name);
    if (!geoCols.includes('country')) {
      db.exec('ALTER TABLE attendance_geofences ADD COLUMN country TEXT');
    }
    if (!geoCols.includes('province')) {
      db.exec('ALTER TABLE attendance_geofences ADD COLUMN province TEXT');
    }
    if (!geoCols.includes('city')) {
      db.exec('ALTER TABLE attendance_geofences ADD COLUMN city TEXT');
    }
  }
  if (!existingTables.includes('attendance_records')) {
    db.exec(`CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      className TEXT NOT NULL,
      subject TEXT,
      day TEXT NOT NULL,
      periodIndex INTEGER NOT NULL,
      studentId INTEGER NOT NULL,
      studentName TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      presence TEXT NOT NULL DEFAULT 'present',
      markedAt TEXT NOT NULL,
      scheduledDate TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      distanceFromCenter REAL,
      notes TEXT,
      approvedBy TEXT,
      approvedAt TEXT,
      createdAt TEXT NOT NULL
    )`);
  } else {
    // Migration: add presence column (present / late / absent) if missing
    const recCols = db.prepare(`PRAGMA table_info(attendance_records)`).all().map(c => c.name);
    if (!recCols.includes('presence')) {
      db.exec("ALTER TABLE attendance_records ADD COLUMN presence TEXT NOT NULL DEFAULT 'present'");
    }
  }
}

function seedStudents(iS) {
  [
    ['Ahmed Khan','ahmed.khan@school.edu','+91 98765 43210','STU-001','BSCS','Male','12 Main St Mumbai','2009-05-15','2020-06-01','Active',1],
    ['Priya Sharma','priya.sharma@school.edu','+91 91234 56789','STU-002','BSCS','Female','45 Park Ave Delhi','2009-08-22','2020-06-01','Active',0],
    ['Rahul Verma','rahul.verma@school.edu','+91 99887 76655','STU-003','BSIT','Male','78 Lake View Bangalore','2009-01-10','2020-06-01','Active',1],
    ['Sneha Patel','sneha.patel@school.edu','+91 98776 55443','STU-004','BSIT','Female','234 River St Ahmedabad','2008-12-05','2020-06-01','Active',0],
    ['Arjun Singh','arjun.singh@school.edu','+91 96543 21098','STU-005','BBA','Male','56 Hill View Jaipur','2010-03-18','2021-06-01','Active',1],
    ['Fatima Sheikh','fatima.sheikh@school.edu','+91 90099 88776','STU-006','BBA','Female','89 Rose Garden Hyderabad','2010-07-30','2021-06-01','Active',0],
    ['Vikram Mehta','vikram.mehta@school.edu','+91 87654 32109','STU-007','BSAF','Male','123 Green Park Pune','2009-11-25','2021-06-01','Inactive',1],
    ['Ananya Gupta','ananya.gupta@school.edu','+91 94455 66778','STU-008','BSCS','Female','678 Sunny St Lucknow','2009-04-12','2020-06-01','Active',0],
    ['Rohan Joshi','rohan.joshi@school.edu','+91 93322 11009','STU-009','BSIT','Male','34 Mountain View Nashik','2008-09-08','2020-06-01','Active',0],
    ['Kavya Nair','kavya.nair@school.edu','+91 91122 33445','STU-010','BSAF','Female','567 Marine Drive Kochi','2010-02-20','2021-06-01','Active',0],
  ].forEach(r => iS.run(...r));
}
function seedTeachers(iT) {
  [
    ['Dr. Rajesh Kumar','rajesh.kumar@school.edu','+91 98765 43211','Mathematics','Ph.D. Mathematics','15 years','BSCS','2018-06-01'],
    ['Prof. Sneha Iyer','sneha.iyer@school.edu','+91 98765 43212','Physics','M.Sc. Physics','10 years','BSIT','2019-01-15'],
    ['Dr. Amit Patel','amit.patel@school.edu','+91 98765 43213','Chemistry','Ph.D. Chemistry','12 years','BBA','2018-08-01'],
    ['Ms. Priya Desai','priya.desai@school.edu','+91 98765 43214','English','M.A. English','8 years','BSCS','2020-01-10'],
    ['Mr. Vikram Singh','vikram.singh@school.edu','+91 98765 43215','Computer Science','M.Tech CS','6 years','BSIT','2021-06-01'],
    ['Dr. Neha Sharma','neha.sharma@school.edu','+91 98765 43216','Biology','Ph.D. Biology','9 years','BSAF','2019-08-15'],
  ].forEach(r => iT.run(...r));
}
function seedSubjects(iSub) {
  [
    ['Mathematics','MATH-101','Dr. Rajesh Kumar',4,'BSCS'],
    ['Physics','PHY-101','Prof. Sneha Iyer',4,'BSCS'],
    ['Chemistry','CHEM-101','Dr. Amit Patel',3,'BSCS'],
    ['English','ENG-101','Ms. Priya Desai',3,'BSCS'],
    ['Computer Science','CS-101','Mr. Vikram Singh',4,'BSIT'],
    ['Biology','BIO-101','Dr. Neha Sharma',3,'BSAF'],
  ].forEach(r => iSub.run(...r));
}
function seedClasses(iC) {
  [
    ['BSCS','BSCS','Bachelor of Science in Computer Science','3rd'],
    ['BSIT','BSIT','Bachelor of Science in Information Technology','3rd'],
    ['BBA','BBA','Bachelor of Business Administration','2nd'],
    ['BSAF','BSAF','Bachelor of Science in Accounting & Finance','3rd'],
  ].forEach(r => iC.run(...r));
}
function seedAttendanceRecords(iA) {
  // Demo records over the last 6 days so the Attendance Report + student self view
  // have meaningful data immediately. Statuses rotate so approved/rejected/pending
  // are all represented per student.
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const students = db.prepare('SELECT id, name, className FROM students WHERE status = \'Active\'').all();
  if (students.length === 0) return;
  const recentDays = [];
  const now = new Date();
  for (let i = 6; i >= 1; i--) recentDays.push(new Date(now.getTime() - i * 86400000));
  const statuses = ['approved', 'approved', 'rejected', 'approved', 'pending', 'late', 'approved'];
  students.forEach((s, si) => {
    recentDays.forEach((d, di) => {
      [0, 2].forEach(periodIndex => {
        const hash = (si * 7 + di + periodIndex) % statuses.length;
        const presence = statuses[hash] === 'late' ? 'late' : 'present';
        iA.run(
          s.className, 'General', dayNames[d.getDay()], periodIndex,
          s.id, s.name, statuses[hash], presence, '08:30',
          iso(d), null, null, null, d.toISOString()
        );
      });
    });
  });
}
function seedClassSchedules() {
  const existing = db.prepare('SELECT COUNT(*) as c FROM class_schedules').get().c;
  if (existing > 0) return;
  // Seed based on all classes present in the DB (so new/renamed classes get a schedule too)
  const classNames = db.prepare('SELECT name FROM classes').all().map(r => r.name);
  if (classNames.length === 0) return;
  const defaultStructure = JSON.stringify({
    days: [
      { name: 'Friday', periods: ['08:00 - 09:30'] },
      { name: 'Saturday', periods: ['08:00 - 09:30', '09:30 - 11:00', '11:00 - 12:30'] },
      { name: 'Sunday', periods: ['08:00 - 09:30', '09:30 - 11:00', '11:00 - 12:30'] },
    ],
  });
  const emptySlots = '{}';
  const iS = db.prepare('INSERT INTO class_schedules (className, structure, slots) VALUES (?, ?, ?)');
  classNames.forEach(cls => {
    iS.run(cls, defaultStructure, emptySlots);
  });
}
function seedMarks(iM) {
  [
    [1,'Ahmed Khan','Mathematics',92,'A+','Final'],[1,'Ahmed Khan','Physics',88,'A','Final'],[1,'Ahmed Khan','Chemistry',95,'A+','Final'],
    [2,'Priya Sharma','Mathematics',90,'A+','Final'],[2,'Priya Sharma','Physics',85,'A','Final'],[2,'Priya Sharma','Chemistry',92,'A+','Final'],
    [3,'Rahul Verma','Mathematics',85,'A','Final'],[3,'Rahul Verma','Physics',78,'B+','Final'],[3,'Rahul Verma','Chemistry',80,'A-','Final'],
    [4,'Sneha Patel','Mathematics',88,'A','Final'],[4,'Sneha Patel','Physics',82,'A-','Final'],[4,'Sneha Patel','Chemistry',86,'A','Final'],
    [5,'Arjun Singh','Biology',91,'A+','Midterm'],[5,'Arjun Singh','English',84,'A','Midterm'],[5,'Arjun Singh','Computer Science',90,'A+','Midterm'],
    [6,'Fatima Sheikh','Biology',93,'A+','Midterm'],[6,'Fatima Sheikh','English',87,'A','Midterm'],[6,'Fatima Sheikh','Computer Science',94,'A+','Midterm'],
    [7,'Vikram Mehta','Biology',72,'B','Midterm'],[7,'Vikram Mehta','English',75,'B+','Midterm'],[7,'Vikram Mehta','Computer Science',68,'B-','Midterm'],
    [8,'Ananya Gupta','Mathematics',89,'A','Final'],[8,'Ananya Gupta','Physics',93,'A+','Final'],[8,'Ananya Gupta','Chemistry',87,'A','Final'],
    [9,'Rohan Joshi','Mathematics',76,'B+','Final'],[9,'Rohan Joshi','Physics',70,'B','Final'],[9,'Rohan Joshi','Chemistry',74,'B+','Final'],
    [10,'Kavya Nair','Biology',86,'A','Midterm'],[10,'Kavya Nair','English',92,'A+','Midterm'],[10,'Kavya Nair','Computer Science',83,'A-','Midterm'],
  ].forEach(r => iM.run(...r));
}

export function seedDatabase() {
  const cnt = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (cnt > 0) return;
  const h = pw => bcrypt.hashSync(pw, 10);
  const now = '2026-09-02';
  const iU = db.prepare('INSERT INTO users (username,email,password,fullName,role,status,className,registrationDate) VALUES (?,?,?,?,?,?,?,?)');
  const iS = db.prepare('INSERT INTO students (name,email,phone,rollNo,className,gender,address,dateOfBirth,admissionDate,status,isCR) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const iT = db.prepare('INSERT INTO teachers (name,email,phone,subject,qualification,experience,className,joiningDate) VALUES (?,?,?,?,?,?,?,?)');
  const iSub = db.prepare('INSERT INTO subjects (name,code,teacher,credits,className) VALUES (?,?,?,?,?)');
  const iC = db.prepare('INSERT INTO classes (name,code,description,semester) VALUES (?,?,?,?)');
  const iM = db.prepare('INSERT INTO marks (studentId,studentName,subject,marks,grade,examType) VALUES (?,?,?,?,?,?)');
  const iA = db.prepare('INSERT INTO attendance_records (className, subject, day, periodIndex, studentId, studentName, status, presence, markedAt, scheduledDate, latitude, longitude, distanceFromCenter, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  db.transaction(() => {
    iU.run('admin','admin@ncba.edu.pk',h('admin123'),'System Administrator','super_admin','approved',null,now);
    iU.run('cr.admin','cr@ncba.edu.pk',h('cr123'),'Class Representative','cr_admin','approved','BSCS',now);
    iU.run('teacher.admin','teacher@ncba.edu.pk',h('teacher123'),'Professor Admin','teacher_admin','approved',null,now);
    iU.run('ahmed.khan','ahmed.khan@ncba.edu.pk',h('student123'),'Ahmed Khan','student','pending','BSCS',now);
    seedStudents(iS); seedTeachers(iT); seedSubjects(iSub);
    seedClasses(iC); seedMarks(iM); seedClassSchedules(); seedAttendanceRecords(iA);
  })();
  console.log('Database seeded');
}

export default db;

