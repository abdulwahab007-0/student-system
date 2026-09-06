# 🎓 NCBA & E - Student Management System

A modern, feature-rich front-end for managing students, teachers, subjects, and marks at National College of Business Administration & Economics (NCBA & E).

## 🔐 Authentication & Roles

The system includes a full authentication flow with role-based access control:

- **Super Admin** - Full system access, manages everything
- **CR Admin** - Class Representative with admin access (manages their class's students)
- **Teacher Admin** - Teacher with admin access (manages their subjects' marks)
- **Student** - Limited access (their own dashboard, marks, and subjects)

### Approval System

When someone registers for the first time, their registration goes into a **pending** state. It appears in the **Approvals** page (visible to Super Admin, CR Admin, and Teacher Admin). The admin can then:
- **Approve** the registration - granting the user login access
- **Reject** the registration
- **Review** the registration details first

### Demo Accounts

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `admin` | `admin123` |
| CR Admin | `cr.admin` | `cr123` |
| Teacher Admin | `teacher.admin` | `teacher123` |

## Features

### 📊 Dashboard
- Total students, teachers, subjects, and marks records overview
- Top 3 students ranked by average score
- Complete list of all students with average scores
- Recent activity feed

### 👨🎓 Student Management (CRUD)
- Add, view, edit, and delete student records
- Search by name, email, or roll number
- Filter by class
- Student details modal with full information
- Auto-generated roll numbers
- View average scores per student

### 👩🏫 Teacher Management
- Add, view, edit, and delete teacher records
- Search by name, email, or subject
- Filter by subject
- Card-based layout with teacher details
- Qualification, experience, and class assignments

### 📝 Student Marks
- Add, edit, and delete marks records
- Auto-grade calculation (A+, A, A-, B+, etc.)
- Per-student performance cards with average scores
- Visual progress bars for marks
- Color-coded grades by performance
- Filter by subject, exam type, and student
- Summary statistics (total records, graded students, A+ grades)

### 📚 Subject Management
- Add, edit, and delete subjects
- Assign teachers to subjects
- Subject codes, credits, and class assignments
- Color-coded subject cards

## Tech Stack

- **React 18** - UI framework
- **Vite 5** - Build tool and dev server
- **React Router 6** - Navigation
- **Context API** - State management
- **LocalStorage** - Data persistence

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
npm run build
npm run preview
```

## Project Structure

```
student-system/
├── src/
│   ├── components/
│   │   ├── ConfirmDialog.jsx    # Delete confirmation dialog
│   │   ├── Layout.jsx           # Sidebar + topbar layout
│   │   ├── Modal.jsx            # Reusable modal component
│   │   └── Toast.jsx            # Toast notification system
│   ├── context/
│   │   └── DataContext.jsx      # Global state management (CRUD operations)
│   ├── data/
│   │   └── mockData.js          # Initial sample data
│   ├── pages/
│   │   ├── Dashboard.jsx        # Overview dashboard with stats and top students
│   │   ├── Students.jsx         # Student CRUD page
│   │   ├── Teachers.jsx         # Teacher management page
│   │   ├── Marks.jsx            # Student marks management page
│   │   └── Subjects.jsx         # Subject management page
│   ├── App.jsx                  # Routing setup
│   ├── main.jsx                 # Entry point
│   └── index.css                # Global styles
├── index.html                   # HTML entry point
├── package.json
└── vite.config.js
```

## Data Persistence

All data is automatically saved to `localStorage`. Changes persist between browser sessions. Use the reset functionality in the data context to restore default data.

## License

MIT# student-system
