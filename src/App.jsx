import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import Approvals from "./pages/Approvals";
import Classes from "./pages/Classes";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import ManageCR from "./pages/ManageCR";
import ManageUsers from "./pages/ManageUsers";
import Marks from "./pages/Marks";
import Register from "./pages/Register";
import Students from "./pages/Students";
import Subjects from "./pages/Subjects";
import Teachers from "./pages/Teachers";
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
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}

export default App;
12;
