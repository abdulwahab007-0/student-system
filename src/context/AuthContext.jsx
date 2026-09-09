import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import api from "../services/api";

const AuthContext = createContext();

const DEFAULT_PERMISSIONS = {
    view_dashboard: ["super_admin", "cr_admin", "teacher_admin", "student"],
    view_students: ["super_admin", "cr_admin", "teacher_admin"],
    add_students: ["super_admin", "cr_admin", "teacher_admin"],
    edit_students: ["super_admin", "cr_admin", "teacher_admin"],
    delete_students: ["super_admin"],
    view_teachers: ["super_admin", "cr_admin", "teacher_admin"],
    add_teachers: ["super_admin", "cr_admin", "teacher_admin"],
    edit_teachers: ["super_admin", "cr_admin", "teacher_admin"],
    delete_teachers: ["super_admin"],
    view_subjects: ["super_admin", "cr_admin", "teacher_admin", "student"],
    add_subjects: ["super_admin", "cr_admin", "teacher_admin"],
    edit_subjects: ["super_admin", "cr_admin", "teacher_admin"],
    delete_subjects: ["super_admin"],
    view_classes: ["super_admin", "cr_admin", "teacher_admin"],
    add_classes: ["super_admin", "cr_admin", "teacher_admin"],
    edit_classes: ["super_admin", "cr_admin", "teacher_admin"],
    delete_classes: ["super_admin"],
    view_marks: ["super_admin", "cr_admin", "teacher_admin", "student"],
    record_marks: ["super_admin", "cr_admin", "teacher_admin"],
    delete_marks: ["super_admin"],
    approve_users: ["super_admin", "cr_admin", "teacher_admin"],
    view_users: ["super_admin", "cr_admin", "teacher_admin"],
    reset_passwords: ["super_admin"],
    create_accounts: ["super_admin", "cr_admin", "teacher_admin"],
    remove_users: ["super_admin"],
    assign_cr: ["super_admin", "cr_admin"],
    view_todo_list: ["super_admin", "cr_admin", "student"],
    manage_todo_list: ["super_admin", "cr_admin", "student"],
    view_class_schedule: ["super_admin", "cr_admin", "teacher_admin", "student"],
    edit_class_schedule: ["super_admin", "cr_admin", "teacher_admin"],
    view_attendance: ["super_admin", "cr_admin", "teacher_admin", "student"],
    mark_attendance: ["super_admin", "student", "cr_admin"],
    manage_geofences: ["super_admin", "cr_admin"],
    approve_attendance: ["super_admin", "cr_admin", "teacher_admin"],
    view_attendance_report: ["super_admin", "cr_admin", "teacher_admin"],
    view_own_attendance: ["super_admin", "student"],
    use_chat: ["super_admin", "cr_admin", "teacher_admin", "student"],
    post_announcements: ["super_admin", "cr_admin", "teacher_admin"],
    view_student_cards: ["super_admin", "cr_admin", "teacher_admin"],
    upload_card_photos: ["super_admin", "cr_admin", "teacher_admin"],
    approve_card_photos: ["super_admin", "cr_admin", "teacher_admin"],
    view_own_card: ["student", "cr_admin"],
    upload_own_card_photo: ["student", "cr_admin"],
    view_teacher_cards: ["super_admin", "cr_admin", "teacher_admin"],
    upload_teacher_card_photos: ["super_admin", "cr_admin", "teacher_admin"],
    approve_teacher_card_photos: ["super_admin", "cr_admin", "teacher_admin"],
    view_own_teacher_card: ["teacher_admin"],
    upload_own_teacher_card_photo: ["teacher_admin"],
};

export const ALL_PERMISSION_KEYS = Object.keys(DEFAULT_PERMISSIONS);
export const DEFAULT_PASSWORDS = { super_admin:"admin@123", cr_admin:"cr@123", teacher_admin:"teacher@123", student:"student@123" };
export const defaultPasswordFor = role => DEFAULT_PASSWORDS[role] || "ncbae@123";

export function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let r = "Ncba-";
    for (let i = 0; i < 8; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return r;
}

export function AuthProvider({ children }) {
    const showToast = useToast();
    const [currentUser, setCurrentUser] = useState(() => {
        const saved = localStorage.getItem("ncba_current_user");
        return saved ? JSON.parse(saved) : null;
    });
    const [users, setUsers] = useState([]);
    const [pendingUsers, setPendingUsers] = useState([]);
    const [rolePermissions, setRolePermissions] = useState({});
    const [userPermissions, setUserPermissionsState] = useState({});
    // Track whether the user has explicitly changed permissions (so we know
    // to save an empty override map back to the server and clear stale data)
    const rolePermissionsDirty = useRef(false);
    const userPermissionsDirty = useRef(false);

    // Load users + permission overrides from the single /api/bootstrap payload.
    // DataContext uses the same request and api.getBootstrap() dedupes them
    // into ONE HTTP call. Students get users:[] yet still receive the override
    // maps — exactly what the old separate endpoints provided, minus the 403s.
    const applyBootstrapAuth = (data) => {
        if (Array.isArray(data.users)) {
            setUsers(data.users.filter(u => u.status === "approved"));
            setPendingUsers(data.users.filter(u => u.status === "pending"));
        }
        rolePermissionsDirty.current = false;
        setRolePermissions(data.rolePermissions || {});
        userPermissionsDirty.current = false;
        setUserPermissionsState(data.userPermissions || {});
    };

    const loadBootstrap = async () => {
        try {
            applyBootstrapAuth(await api.getBootstrap());
        } catch { /* network hiccup — app renders with defaults */ }
    };

    useEffect(() => {
        if (!currentUser) return;
        loadBootstrap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.id]);

    // Keep auth in sync across browser tabs: when another tab logs in/out,
    // the storage event fires here so currentUser stays consistent everywhere.
    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === "ncba_current_user") {
                const saved = e.newValue ? JSON.parse(e.newValue) : null;
                setCurrentUser(saved);
                // A (different) user just signed in from another tab — refresh
                // users/approvals and permissions so badges & rights are current.
                if (saved) {
                    loadBootstrap();
                }
            } else if (e.key === "sms_token" && !e.newValue) {
                // Token removed in another tab → treat as logged out here too.
                localStorage.removeItem("ncba_current_user");
                setCurrentUser(null);
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    const refreshUsers = async () => {
        try {
            const all = await api.getUsers();
            setUsers(all.filter(u => u.status === "approved"));
            setPendingUsers(all.filter(u => u.status === "pending"));
        } catch {}
    };

    const login = async (username, password) => {
        try {
            const { token, user } = await api.login(username, password);
            api.setToken(token);
            setCurrentUser(user);
            localStorage.setItem("ncba_current_user", JSON.stringify(user));
            showToast(`Welcome back, ${user.fullName}!`, "success");
            await loadBootstrap();
            return { success: true, user };
        } catch (err) {
            const msg = err.message || "";
            if (msg.includes("pending")) return { success: false, message: "Your registration is still pending approval." };
            return { success: false, message: msg || "Invalid username/email or password." };
        }
    };

    const logout = () => {
        setCurrentUser(null);
        api.clearToken();
        localStorage.removeItem("ncba_current_user");
        showToast("Logged out successfully", "info");
    };

    const register = async (data) => {
        try {
            const result = await api.register(data);
            showToast(result.message || "Registration submitted.", "success");
            return result;
        } catch (err) {
            return { success: false, message: err.message };
        }
    };

    const changePassword = async (currentPassword, newPassword) => {
        if (!currentUser) return { success: false, message: "You are not logged in." };
        if (!newPassword || newPassword.length < 6) return { success: false, message: "New password must be at least 6 characters." };
        try {
            await api.changePassword(currentUser.id, currentPassword, newPassword);
            showToast("Password changed successfully!", "success");
            return { success: true, message: "Password changed successfully!" };
        } catch (err) {
            return { success: false, message: err.message || "Failed to change password." };
        }
    };

    const resetPassword = async (userId) => {
        try {
            const result = await api.resetPassword(userId);
            showToast(`${result.user.fullName}'s password has been reset.`, "info");
            return { success: true, newPassword: result.user.password, user: result.user };
        } catch (err) {
            return { success: false, message: err.message };
        }
    };

    const createAccount = async (data) => {
        try {
            const result = await api.createAccount(data);
            if (result.error) throw new Error(result.error);
            await refreshUsers();
            return result;
        } catch (err) {
            return { success: false, message: err.message };
        }
    };

    const approveUser = async (userId) => {
        try {
            await api.approveUser(userId);
            await refreshUsers();
            showToast("User approved successfully!", "success");
        } catch (err) {
            showToast(err.message || "Failed to approve user.", "error");
        }
    };

    const rejectUser = async (userId) => {
        try {
            await api.rejectUser(userId);
            await refreshUsers();
            showToast("User registration rejected.", "warning");
        } catch (err) {
            showToast(err.message || "Failed to reject user.", "error");
        }
    };

    const assignCR = async (student, options) => {
        try {
            const result = await api.assignCR(student.id, options);
            await refreshUsers();
            return result;
        } catch (err) {
            return { success: false, message: err.message };
        }
    };

    const removeCR = async (student) => {
        try {
            await api.removeCR(student.id);
            await refreshUsers();
            showToast("CR removed successfully.", "info");
        } catch (err) {
            showToast(err.message || "Failed to remove CR.", "error");
        }
    };

    // ── Teacher & System Administrator account management ──
    const getTeacherAccounts = async () => {
        try { return await api.teacherAccounts(); } catch { return []; }
    };
    const getAdminAccounts = async () => {
        try { return await api.adminAccounts(); } catch { return []; }
    };
    const grantTeacherAccount = async (teacherId) => {
        try {
            const result = await api.grantTeacherAccount(teacherId);
            await refreshUsers();
            return result;
        } catch (err) {
            return { success: false, message: err.message };
        }
    };
    const createAdminAccount = async (data) => {
        try {
            const result = await api.createAdminAccount(data);
            await refreshUsers();
            return result;
        } catch (err) {
            return { success: false, message: err.message };
        }
    };
    const revokeAccount = async (userId) => {
        try {
            await api.revokeAccount(userId);
            await refreshUsers();
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    };
    const removeUser = async (userId) => {
        try {
            const result = await api.deleteUser(userId);
            await refreshUsers();
            return { success: true, removed: result.removed };
        } catch (err) {
            return { success: false, message: err.message };
        }
    };

    const isAdmin = () => currentUser && ["super_admin", "cr_admin", "teacher_admin"].includes(currentUser.role);
    const canManageStudents = () => currentUser && ["super_admin", "cr_admin", "teacher_admin"].includes(currentUser.role);
    const canApproveUsers = () => currentUser && ["super_admin", "cr_admin", "teacher_admin"].includes(currentUser.role);
    const isSuperAdmin = () => currentUser?.role === "super_admin";

    const roleHasRight = (role, rightKey) => {
        const defaults = DEFAULT_PERMISSIONS[rightKey] || [];
        const override = rolePermissions?.[role]?.[rightKey];
        return override === undefined ? defaults.includes(role) : override;
    };

    const hasPermission = rightKey => {
        if (!currentUser) return false;
        // Check user-level override first
        const userOverride = userPermissions?.[currentUser.id]?.[rightKey];
        if (userOverride !== undefined) return userOverride;
        // Check role-level override (including super_admin)
        return roleHasRight(currentUser.role, rightKey);
    };

    const setRolePermission = async (role, rightKey, granted) => {
        if (currentUser?.role !== "super_admin") return false;
        rolePermissionsDirty.current = true;
        setRolePermissions(prev => {
            const rp = { ...(prev[role] || {}) };
            const defaults = DEFAULT_PERMISSIONS[rightKey] || [];
            const defaultVal = defaults.includes(role);
            if (granted === defaultVal) delete rp[rightKey];
            else rp[rightKey] = granted;
            const next = { ...prev };
            if (Object.keys(rp).length === 0) delete next[role];
            else next[role] = rp;
            return next;
        });
        return true;
    };

    const resetRolePermissions = async () => {
        if (currentUser?.role !== "super_admin") return false;
        try { await api.resetPermissions(); } catch {}
        rolePermissionsDirty.current = false;
        setRolePermissions({});
        return true;
    };

    const setUserPermission = async (userId, rightKey, granted) => {
        if (currentUser?.role !== "super_admin") return false;
        userPermissionsDirty.current = true;
        setUserPermissionsState(prev => {
            const up = { ...(prev[userId] || {}) };
            // Find the role of this user to compute the default
            const targetUser = users.find(u => u.id === userId);
            const targetRole = targetUser?.role || "";
            const defaults = DEFAULT_PERMISSIONS[rightKey] || [];
            const defaultVal = defaults.includes(targetRole);
            if (granted === defaultVal) delete up[rightKey];
            else up[rightKey] = granted;
            const next = { ...prev };
            if (Object.keys(up).length === 0) delete next[userId];
            else next[userId] = up;
            return next;
        });
        return true;
    };

    const resetUserPermissions = async () => {
        if (currentUser?.role !== "super_admin") return false;
        try { await api.resetUserPermissions(); } catch {}
        userPermissionsDirty.current = false;
        setUserPermissionsState({});
        return true;
    };

    // Save permissions to server when they change (debounced)
    useEffect(() => {
        if (!currentUser || currentUser.role !== "super_admin") return;
        if (!rolePermissionsDirty.current) return;
        const timeout = setTimeout(() => {
            api.savePermissions(rolePermissions).then(() => {
                rolePermissionsDirty.current = false;
            }).catch(() => {});
        }, 500);
        return () => clearTimeout(timeout);
    }, [rolePermissions]);

    // Save user permissions to server when they change (debounced)
    useEffect(() => {
        if (!currentUser || currentUser.role !== "super_admin") return;
        if (!userPermissionsDirty.current) return;
        const timeout = setTimeout(() => {
            api.saveUserPermissions(userPermissions).then(() => {
                userPermissionsDirty.current = false;
            }).catch(() => {});
        }, 500);
        return () => clearTimeout(timeout);
    }, [userPermissions]);

    const roleLabel = role => ({
        super_admin: "Super Admin", cr_admin: "CR Admin",
        teacher_admin: "Teacher Admin", student: "Student",
    }[role] || role);

    const value = {
        currentUser, users, pendingUsers,
        login, logout, register, changePassword,
        assignCR, removeCR, createAccount, resetPassword,
        defaultPasswordFor, approveUser, rejectUser,
        isAdmin, canManageStudents, canApproveUsers, isSuperAdmin,
        roleLabel, rolePermissions, roleHasRight, hasPermission,
        setRolePermission, resetRolePermissions,
        userPermissions, setUserPermission, resetUserPermissions,
        getTeacherAccounts, getAdminAccounts,
        grantTeacherAccount, createAdminAccount, revokeAccount, removeUser,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}
