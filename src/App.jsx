import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Teachers from './pages/Teachers';
import Marks from './pages/Marks';
import Subjects from './pages/Subjects';
import Classes from './pages/Classes';
import Login from './pages/Login';
import Register from './pages/Register';
import Approvals from './pages/Approvals';
import ManageCR from './pages/ManageCR';
import ManageUsers from './pages/ManageUsers';
import UserRights from './pages/UserRights';
import TodoList from './pages/TodoList';
import ClassSchedule from './pages/ClassSchedule';
import MarkAttendance from './pages/MarkAttendance';
import ApproveAttendance from './pages/ApproveAttendance';
import AttendanceGeofence from './pages/AttendanceGeofence';
import AttendanceReport from './pages/AttendanceReport';
import MyAttendance from './pages/MyAttendance';
import StudentAttendance from './pages/StudentAttendance';
import ManageTeacher from './pages/ManageTeacher';
import ManageSystemAdmin from './pages/ManageSystemAdmin';
import Chat from './pages/Chat';
import StudentCards from './pages/StudentCards';
import TeacherCards from './pages/TeacherCards';
import MyCard from './pages/MyCard';
import MyTeacherCard from './pages/MyTeacherCard';
import { useAuth } from './context/AuthContext';

function PrivateRoute({ children, allowed, permission }) {
  const { currentUser, hasPermission } = useAuth();
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (allowed && !allowed.includes(currentUser.role)) {
    return <Navigate to="/" replace />;
  }
  // If a permission key is specified, check it against role & user overrides
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  const { currentUser, hasPermission } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';

  // If not logged in, show login/register
  if (!currentUser) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Logged in - show main app with protected routes
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={
          <PrivateRoute permission="view_students">
            <Students />
          </PrivateRoute>
        } />
        <Route path="teachers" element={
          <PrivateRoute permission="view_teachers">
            <Teachers />
          </PrivateRoute>
        } />
        <Route path="marks" element={
          <PrivateRoute permission="view_marks">
            <Marks />
          </PrivateRoute>
        } />
        <Route path="subjects" element={
          <PrivateRoute permission="view_subjects">
            <Subjects />
          </PrivateRoute>
        } />
        <Route path="classes" element={
          <PrivateRoute permission="view_classes">
            <Classes />
          </PrivateRoute>
        } />
        <Route path="approvals" element={
          <PrivateRoute permission="approve_users">
            <Approvals />
          </PrivateRoute>
        } />
        <Route path="manage-users" element={
          <PrivateRoute permission="view_users">
            <ManageUsers />
          </PrivateRoute>
        } />
        <Route path="user-rights" element={
          <PrivateRoute allowed={['super_admin']}>
            <UserRights />
          </PrivateRoute>
        } />
        {hasPermission('assign_cr') && (isSuperAdmin || currentUser?.manageAllClasses) && (
          <Route path="manage-cr" element={<ManageCR />} />
        )}
        {isSuperAdmin && (
          <>
            <Route path="manage-teachers" element={<ManageTeacher />} />
            <Route path="manage-admins" element={<ManageSystemAdmin />} />
          </>
        )}
        <Route path="todo-list" element={
          <PrivateRoute permission="view_todo_list">
            <TodoList />
          </PrivateRoute>
        } />
        <Route path="chat" element={
          <PrivateRoute permission="use_chat">
            <Chat />
          </PrivateRoute>
        } />
        <Route path="class-schedule" element={
          <PrivateRoute permission="view_class_schedule">
            <ClassSchedule />
          </PrivateRoute>
        } />
        <Route path="student-cards" element={
          <PrivateRoute permission="view_student_cards">
            <StudentCards />
          </PrivateRoute>
        } />
        <Route path="teacher-cards" element={
          <PrivateRoute permission="view_teacher_cards">
            <TeacherCards />
          </PrivateRoute>
        } />
        <Route path="my-card" element={
          <PrivateRoute permission="view_own_card">
            <MyCard />
          </PrivateRoute>
        } />
        <Route path="my-teacher-card" element={
          <PrivateRoute permission="view_own_teacher_card">
            <MyTeacherCard />
          </PrivateRoute>
        } />
        <Route path="mark-attendance" element={
          <PrivateRoute permission="mark_attendance">
            <MarkAttendance />
          </PrivateRoute>
        } />
        <Route path="my-attendance" element={
          <PrivateRoute permission="view_own_attendance">
            <MyAttendance />
          </PrivateRoute>
        } />
        <Route path="student-attendance" element={
          <PrivateRoute permission="view_attendance_report">
            <StudentAttendance />
          </PrivateRoute>
        } />
        <Route path="attendance-report" element={
          <PrivateRoute permission="view_attendance_report">
            <AttendanceReport />
          </PrivateRoute>
        } />
        <Route path="approve-attendance" element={
          <PrivateRoute permission="approve_attendance">
            <ApproveAttendance />
          </PrivateRoute>
        } />
        <Route path="attendance" element={
          <Navigate to="/mark-attendance" replace />
        } />
        <Route path="attendance-areas" element={
          <PrivateRoute permission="manage_geofences">
            <AttendanceGeofence />
          </PrivateRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;