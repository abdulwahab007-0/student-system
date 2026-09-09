import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ChangePasswordModal from './ChangePasswordModal';
import LanInfoBanner from './LanInfoBanner';
import Icon from './Icon';

/* ── Icon name mapping for sidebar nav items ── */
const NAV_ICONS = {
  dashboard: 'dashboard',
  students: 'users',
  teachers: 'academic',
  marks: 'document',
  subjects: 'book',
  classes: 'building',
  calendar: 'calendar',
  attendance: 'attendance',
  location: 'location',
  approvals: 'checkCircle',
  users: 'key',
  rights: 'shield',
  cr: 'usersGroup',
  todo: 'todo',
  manageTeacher: 'academic',
  manageAdmin: 'shield',
  chat: 'chat',
  idCard: 'idCard',
};

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, pendingUsers, canApproveUsers, roleLabel, isSuperAdmin, hasPermission } = useAuth();

  const { darkMode, toggleTheme } = useTheme();

  // Role-based navigation organized by sections
  const allSections = [
    {
      label: 'Main',
      items: [
        { path: '/', label: 'Dashboard', iconKey: 'dashboard', end: true, permission: 'view_dashboard' },
        { path: '/chat', label: 'Chat', iconKey: 'chat', permission: 'use_chat' },
      ],
    },
    {
      label: 'Academics',
      items: [
        { path: '/students', label: 'Students', iconKey: 'students', permission: 'view_students' },
        { path: '/teachers', label: 'Teachers', iconKey: 'teachers', permission: 'view_teachers' },
        { path: '/marks', label: 'Student Marks', iconKey: 'marks', permission: 'view_marks' },
        { path: '/subjects', label: 'Subjects', iconKey: 'subjects', permission: 'view_subjects' },
        { path: '/classes', label: 'Classes', iconKey: 'classes', permission: 'view_classes' },
        { path: '/class-schedule', label: 'Class Schedule', iconKey: 'calendar', permission: 'view_class_schedule' },
        { path: '/student-cards', label: 'Student Cards', iconKey: 'idCard', permission: 'view_student_cards' },
        { path: '/teacher-cards', label: 'Teacher Cards', iconKey: 'idCard', permission: 'view_teacher_cards' },
        { path: '/my-card', label: 'My ID Card', iconKey: 'idCard', permission: 'view_own_card' },
        { path: '/my-teacher-card', label: 'My Teacher Card', iconKey: 'idCard', permission: 'view_own_teacher_card' },
      ],
    },
    {
      label: 'Attendance',
      items: [
        { path: '/mark-attendance', label: 'Mark Attendance', iconKey: 'attendance', permission: 'mark_attendance' },
        { path: '/student-attendance', label: 'Student Attendance', iconKey: 'attendance', permission: 'view_attendance_report' },
        { path: '/my-attendance', label: 'My Attendance', iconKey: 'attendance', permission: 'view_own_attendance', condition: () => currentUser?.role === 'student' },
        { path: '/approve-attendance', label: 'Approve Attendance', iconKey: 'approvals', permission: 'approve_attendance' },
        { path: '/attendance-report', label: 'Attendance Report', iconKey: 'document', permission: 'view_attendance_report' },
        { path: '/attendance-areas', label: 'Geographical Areas', iconKey: 'location', permission: 'manage_geofences' },
      ],
    },
    {
      label: 'System',
      items: [
        { path: '/approvals', label: 'Approvals', iconKey: 'approvals', permission: 'approve_users' },
        { path: '/manage-users', label: 'User Management', iconKey: 'users', permission: 'view_users' },
        { path: '/manage-cr', label: 'Manage CR', iconKey: 'cr', permission: 'assign_cr', condition: () => isSuperAdmin() || currentUser?.manageAllClasses },
        { path: '/user-rights', label: 'User Rights', iconKey: 'rights', permission: null, condition: () => isSuperAdmin() },
        { path: '/manage-teachers', label: 'Manage Teacher', iconKey: 'manageTeacher', permission: null, condition: () => isSuperAdmin() },
        { path: '/manage-admins', label: 'System Admins', iconKey: 'manageAdmin', permission: null, condition: () => isSuperAdmin() },
        { path: '/todo-list', label: 'Todo List', iconKey: 'todo', permission: 'view_todo_list' },
      ],
    },
  ];

  // Filter sections and items by permissions, remove empty sections
  const navSections = allSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (item.condition && !item.condition()) return false;
        if (item.permission && !hasPermission(item.permission)) return false;
        return true;
      }),
    }))
    .filter(section => section.items.length > 0);

  // Flatten for currentPage lookup
  const navItems = navSections.flatMap(section => section.items);

  const currentPage = navItems.find(
    item => (item.end ? location.pathname === item.path : location.pathname.startsWith(item.path))
  );

  const pendingCount = canApproveUsers() ? pendingUsers.length : 0;

  const getRoleBadgeClass = (role) => {
    const classes = {
      super_admin: 'role-badge-admin',
      cr_admin: 'role-badge-cr',
      teacher_admin: 'role-badge-teacher',
      student: 'role-badge-student'
    };
    return classes[role] || 'primary';
  };

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Logo / Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <img src="/ncba-logo.webp" alt="NCBA&F Logo" style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'contain' }} />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">NCBA &amp; E</span>
            <span className="sidebar-brand-sub">Student Management</span>
          </div>
        </div>

        {/* User profile (top, next to brand — like the Pinterest dashboard) */}
        <div className="sidebar-user-card sidebar-user-card-top">
          <div className="sidebar-user-avatar">
            {currentUser?.fullName?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{currentUser?.fullName}</span>
            <span className="sidebar-user-role">{currentUser ? roleLabel(currentUser.role) : ''}</span>
          </div>
          <button
            className="sidebar-theme-toggle"
            onClick={toggleTheme}
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
          >
            <Icon name={darkMode ? 'sun' : 'moon'} size={18} />
          </button>
        </div>

        <LanInfoBanner />

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navSections.map(section => (
            <div className="sidebar-nav-section" key={section.label}>
              <span className="sidebar-section-label">{section.label}</span>
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="sidebar-link-icon"><Icon name={NAV_ICONS[item.iconKey] || item.iconKey} size={20} /></span>
                  <span className="sidebar-link-text">{item.label}</span>
                  {item.path === '/approvals' && pendingCount > 0 && (
                    <span className="sidebar-badge">{pendingCount}</span>
                  )}
                  <Icon name="chevronRight" size={14} className="sidebar-link-chevron" />
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Sidebar footer – actions */}
        <div className="sidebar-footer sidebar-footer-actions">
          <div className="sidebar-actions">
            <button className="sidebar-action-btn" onClick={() => setShowChangePassword(true)}>
              <Icon name="lock" size={18} />
              <span>Change Password</span>
            </button>
            <button className="sidebar-action-btn sidebar-action-logout" onClick={() => { logout(); navigate('/login'); }}>
              <Icon name="logout" size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-brand">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Icon name="menu" size={22} />
            </button>
            <h1><Icon name="academic" size={22} /> {currentPage?.label || 'Dashboard'}</h1>
            <span>Welcome back, {currentUser?.fullName || 'User'}</span>
          </div>
          <div className="topbar-right">
            {/* Theme toggle button */}
            <button
              onClick={toggleTheme}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--white)',
                color: 'var(--dark)',
                fontSize: '1.15rem',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                marginRight: '12px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {darkMode ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
            </button>
            <div className="admin-badge">
              <div className="admin-avatar">
                {currentUser?.fullName?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="admin-info">
                <p>{currentUser?.fullName}</p>
                <span style={{ textTransform: 'capitalize' }}>{currentUser ? roleLabel(currentUser.role) : ''}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>

        <footer style={{
          textAlign: 'center',
          padding: '15px 30px',
          fontSize: '0.78rem',
          color: 'var(--gray)',
          borderTop: '1px solid var(--border)',
          background: 'var(--white)'
        }}>
          NCBA & E © 2026 - Student Management System
        </footer>
      </div>

      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </div>
  );
}

export default Layout;