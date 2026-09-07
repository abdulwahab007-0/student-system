import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import Approvals from "./pages/Approvals";
import ApproveAttendance from "./pages/ApproveAttendance";
import AttendanceGeofence from "./pages/AttendanceGeofence";
import AttendanceReport from "./pages/AttendanceReport";
import Chat from "./pages/Chat";
import Classes from "./pages/Classes";
import ClassSchedule from "./pages/ClassSchedule";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import ManageCR from "./pages/ManageCR";
import ManageSystemAdmin from "./pages/ManageSystemAdmin";
import ManageTeacher from "./pages/ManageTeacher";
import ManageUsers from "./pages/ManageUsers";
import Marks from "./pages/Marks";
import MarkAttendance from "./pages/MarkAttendance";
import MyAttendance from "./pages/MyAttendance";
import MyCard from "./pages/MyCard";
import MyTeacherCard from "./pages/MyTeacherCard";
import Register from "./pages/Register";
import StudentAttendance from "./pages/StudentAttendance";
import Students from "./pages/Students";
import StudentCards from "./pages/StudentCards";
import Subjects from "./pages/Subjects";
import TeacherCards from "./pages/TeacherCards";
import Teachers from "./pages/Teachers";
import TodoList from "./pages/TodoList";
import UserRights from "./pages/UserRights";

function PrivateRoute({ children, allowed, permission }) {
    const { currentUser, hasPermission } = useAuth();
    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }
    if (allowed && !allowed.includes(currentUser.role)) {
        return <Navigate to="/" replace />;
    }
    // If a permission key is specified, check it (Super Admin always passes)
    if (permission && !hasPermission(permission)) {
        return <Navigate to="/" replace />;
    }
    return children;
}

function App() {
    const { currentUser } = useAuth();
    const isSuperAdmin = currentUser?.role === "super_admin";

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
                <Route
                    path="students"
                    element={
                        <PrivateRoute permission="view_students">
                            <Students />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="teachers"
                    element={
                        <PrivateRoute permission="view_teachers">
                            <Teachers />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="marks"
                    element={
                        <PrivateRoute permission="view_marks">
                            <Marks />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="subjects"
                    element={
                        <PrivateRoute permission="view_subjects">
                            <Subjects />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="classes"
                    element={
                        <PrivateRoute permission="view_classes">
                            <Classes />
                        </PrivateRoute>
                    }
                />
                {/* Attendance */}
                <Route
                    path="mark-attendance"
                    element={
                        <PrivateRoute permission="mark_attendance">
                            <MarkAttendance />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="student-attendance"
                    element={
                        <PrivateRoute permission="view_attendance_report">
                            <StudentAttendance />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="my-attendance"
                    element={
                        <PrivateRoute permission="view_own_attendance">
                            <MyAttendance />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="approve-attendance"
                    element={
                        <PrivateRoute permission="approve_attendance">
                            <ApproveAttendance />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="attendance-report"
                    element={
                        <PrivateRoute permission="view_attendance_report">
                            <AttendanceReport />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="attendance-areas"
                    element={
                        <PrivateRoute permission="manage_geofences">
                            <AttendanceGeofence />
                        </PrivateRoute>
                    }
                />
                {/* Chat */}
                <Route
                    path="chat"
                    element={
                        <PrivateRoute permission="use_chat">
                            <Chat />
                        </PrivateRoute>
                    }
                />
                {/* Class Schedule */}
                <Route
                    path="class-schedule"
                    element={
                        <PrivateRoute permission="view_class_schedule">
                            <ClassSchedule />
                        </PrivateRoute>
                    }
                />
                {/* ID Cards */}
                <Route
                    path="student-cards"
                    element={
                        <PrivateRoute permission="view_student_cards">
                            <StudentCards />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="teacher-cards"
                    element={
                        <PrivateRoute permission="view_teacher_cards">
                            <TeacherCards />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="my-card"
                    element={
                        <PrivateRoute permission="view_own_card">
                            <MyCard />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="my-teacher-card"
                    element={
                        <PrivateRoute permission="view_own_teacher_card">
                            <MyTeacherCard />
                        </PrivateRoute>
                    }
                />
                {/* System */}
                <Route
                    path="approvals"
                    element={
                        <PrivateRoute permission="approve_users">
                            <Approvals />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="manage-users"
                    element={
                        <PrivateRoute permission="view_users">
                            <ManageUsers />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="user-rights"
                    element={
                        <PrivateRoute allowed={["super_admin"]}>
                            <UserRights />
                        </PrivateRoute>
                    }
                />
                {isSuperAdmin && <Route path="manage-cr" element={<ManageCR />} />}
                <Route
                    path="manage-teachers"
                    element={
                        <PrivateRoute allowed={["super_admin"]}>
                            <ManageTeacher />
                        </PrivateRoute>
                    }
                />
                <Route
                    path="manage-admins"
                    element={
                        <PrivateRoute allowed={["super_admin"]}>
                            <ManageSystemAdmin />
                        </PrivateRoute>
                    }
                />
                {/* Todo */}
                <Route
                    path="todo-list"
                    element={
                        <PrivateRoute permission="view_todo_list">
                            <TodoList />
                        </PrivateRoute>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}

export default App;
12;
