"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Plus, Users, Search, KeyRound, X, UserPlus,
  Mail, Phone, Shield, Building2, Target, Calendar,
  Lock, Eye, EyeOff, CheckCircle2, AlertCircle,
  RotateCcw, UserCog, ChevronDown,
} from "lucide-react";
import { formatDate, getRoleBadgeColor, getRoleLabel, ALL_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from "@/lib/utils";
import { useBranding } from "@/app/branding-context";
import { UserRole } from "@/types";

interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  dateOfBirth?: string;
  branch: { _id: string; name: string } | null;
  target?: number;
  currentCount?: number;
  isActive: boolean;
  createdAt: string;
  permissions: string[];
}

const ROLES: UserRole[] = [
  "counsellor", "telecaller", "front_desk",
  "application_team", "admission_team", "visa_team", "super_admin",
];

const emptyForm = {
  name: "", email: "", password: "", role: "counsellor" as UserRole,
  branch: "", phone: "", dateOfBirth: "", target: "0",
  permissions: [...ROLE_DEFAULT_PERMISSIONS["counsellor"]] as string[],
};

/* ─── Role icon color ─── */
const roleIconMap: Record<UserRole, string> = {
  super_admin: "text-red-500",
  counsellor: "text-blue-500",
  telecaller: "text-green-500",
  application_team: "text-purple-500",
  admission_team: "text-yellow-600",
  visa_team: "text-orange-500",
  front_desk: "text-gray-500",
};

export default function UsersPage() {
  const { data: session } = useSession();
  const branding = useBranding();

  /* ─── State ─── */
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<{ _id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  /* form modals */
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  /* reset password modal */
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  /* ─── Fetch ─── */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
    fetch("/api/branches").then((r) => r.json()).then(setBranches);
  }, [fetchUsers]);

  /* ─── Filtered list ─── */
  const filtered = users.filter((u) => {
    if (search) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter === "active" && !u.isActive) return false;
    if (statusFilter === "inactive" && u.isActive) return false;
    return true;
  });

  /* ─── Create / Edit submit ─── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    setFormLoading(true);

    const payload = { ...form, target: Number(form.target) };

    if (editUser) {
      /* edit mode — don't send password */
      const { password: _, ...rest } = payload; // eslint-disable-line @typescript-eslint/no-unused-vars
      const res = await fetch(`/api/users/${editUser._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFormError(d.error || "Failed to update user");
        setFormLoading(false);
        return;
      }
      setFormSuccess("User updated successfully!");
    } else {
      /* create mode */
      if (!form.password || form.password.length < 6) {
        setFormError("Password must be at least 6 characters");
        setFormLoading(false);
        return;
      }
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFormError(d.error || "Failed to create user");
        setFormLoading(false);
        return;
      }
      setFormSuccess("User created successfully!");
    }
    setFormLoading(false);
    fetchUsers();
    setTimeout(() => { closeForm(); }, 1200);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      branch: u.branch?._id || "",
      phone: u.phone || "",
      dateOfBirth: u.dateOfBirth || "",
      target: String(u.target || 0),
      permissions: u.permissions?.length
        ? [...u.permissions]
        : [...(ROLE_DEFAULT_PERMISSIONS[u.role] ?? [])] as string[],
    });
    setFormError("");
    setFormSuccess("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditUser(null);
    setForm(emptyForm);
    setFormError("");
    setFormSuccess("");
  };

  /* ─── Toggle active ─── */
  const toggleActive = async (u: User) => {
    const action = u.isActive ? "Deactivate" : "Reactivate";
    if (!confirm(`${action} ${u.name}?`)) return;
    await fetch(`/api/users/${u._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    fetchUsers();
  };

  /* ─── Reset password ─── */
  const openReset = (u: User) => {
    setResetTarget(u);
    setNewPassword("");
    setConfirmPassword("");
    setResetError("");
    setResetSuccess("");
  };
  const closeReset = () => {
    setResetTarget(null);
    setNewPassword("");
    setConfirmPassword("");
    setResetError("");
    setResetSuccess("");
  };
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");

    if (newPassword.length < 6) { setResetError("Password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setResetError("Passwords do not match"); return; }

    setResetLoading(true);
    const res = await fetch(`/api/users/${resetTarget!._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      setResetError("Failed to reset password");
      setResetLoading(false);
      return;
    }
    setResetSuccess("Password reset successfully!");
    setResetLoading(false);
    setTimeout(closeReset, 1500);
  };

  /* ─── Stats ─── */
  const activeCount = users.filter((u) => u.isActive).length;
  const inactiveCount = users.length - activeCount;

  /* ─── Render ─── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <div className="p-2 rounded-xl" style={{ backgroundColor: `${branding.brandColor}15` }}>
              <Users size={22} style={{ color: branding.brandColor }} />
            </div>
            Team Members
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage your team — {users.length} members</p>
        </div>
        <button
          onClick={() => { closeForm(); setShowForm(true); }}
          className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          style={{ backgroundColor: branding.brandColor }}
        >
          <UserPlus size={16} /> Add Team Member
        </button>
      </div>

      {/* Stat pills */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Total", value: users.length, color: "bg-blue-50 text-blue-700 border-blue-100" },
          { label: "Active", value: activeCount, color: "bg-green-50 text-green-700 border-green-100" },
          { label: "Inactive", value: inactiveCount, color: "bg-gray-50 text-gray-600 border-gray-200" },
        ].map((s) => (
          <div key={s.label} className={`px-4 py-2 rounded-xl border text-sm font-medium ${s.color}`}>
            {s.label}: <span className="font-bold">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 bg-white"
          />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | "all")}
            className="appearance-none pl-4 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white cursor-pointer"
          >
            <option value="all">All Roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            className="appearance-none pl-4 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                {["Member", "Role", "Branch", "Target", "Status", "Joined", "Actions"].map((h) => (
                  <th key={h} className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={7} className="text-center py-16 text-gray-400">
                  <div className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /> Loading…</div>
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-16 text-gray-400">No users found</td></tr>
              )}
              {filtered.map((user) => (
                <tr key={user._id} className="hover:bg-gray-50/60 transition-colors">
                  {/* Member */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ backgroundColor: branding.brandColor }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{user.name}</p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  {/* Role */}
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${getRoleBadgeColor(user.role)}`}>
                      <Shield size={11} className={roleIconMap[user.role]} />
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  {/* Branch */}
                  <td className="px-5 py-3.5 text-gray-600">{user.branch?.name || "—"}</td>
                  {/* Target */}
                  <td className="px-5 py-3.5">
                    {user.role === "counsellor" ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, ((user.currentCount || 0) / (user.target || 1)) * 100)}%`,
                              backgroundColor: branding.brandColor,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 font-medium">{user.currentCount || 0}/{user.target || 0}</span>
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  {/* Status */}
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      user.isActive ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-50 text-gray-500 border border-gray-200"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-green-500" : "bg-gray-400"}`} />
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {/* Joined */}
                  <td className="px-5 py-3.5 text-gray-500 text-xs">{formatDate(user.createdAt)}</td>
                  {/* Actions */}
                  <td className="px-5 py-3.5">
                    {user._id !== session?.user?.id && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(user)}
                          title="Edit user"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <UserCog size={15} />
                        </button>
                        <button
                          onClick={() => openReset(user)}
                          title="Reset password"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <KeyRound size={15} />
                        </button>
                        <button
                          onClick={() => toggleActive(user)}
                          title={user.isActive ? "Deactivate" : "Reactivate"}
                          className={`p-1.5 rounded-lg transition-colors ${
                            user.isActive
                              ? "text-gray-400 hover:text-red-600 hover:bg-red-50"
                              : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                          }`}
                        >
                          <RotateCcw size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Add / Edit User Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: branding.brandColor }}>
                  {editUser ? <UserCog size={20} /> : <UserPlus size={20} />}
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">{editUser ? "Edit Team Member" : "Add Team Member"}</h2>
                  <p className="text-xs text-gray-500">{editUser ? "Update member details" : "Fill in the details to create a new user"}</p>
                </div>
              </div>
              <button onClick={closeForm} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {/* Status messages */}
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0" /> {formError}
                </div>
              )}
              {formSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <CheckCircle2 size={16} className="shrink-0" /> {formSuccess}
                </div>
              )}

              {/* Name & Email row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <UserPlus size={13} className="text-gray-400" /> Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text" required value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="John Doe"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-300"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <Mail size={13} className="text-gray-400" /> Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email" required value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="john@company.com"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-300"
                  />
                </div>
              </div>

              {/* Password (only for create) */}
              {!editUser && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <Lock size={13} className="text-gray-400" /> Password <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password" required value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 6 characters"
                    minLength={6}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-300"
                  />
                </div>
              )}

              {/* Phone & DOB */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <Phone size={13} className="text-gray-400" /> Phone
                  </label>
                  <input
                    type="tel" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-300"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <Calendar size={13} className="text-gray-400" /> Date of Birth
                  </label>
                  <input
                    type="date" value={form.dateOfBirth}
                    onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-gray-700"
                  />
                </div>
              </div>

              {/* Role & Branch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <Shield size={13} className="text-gray-400" /> Role <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required value={form.role}
                      onChange={(e) => {
                        const newRole = e.target.value as UserRole;
                        setForm({
                          ...form,
                          role: newRole,
                          permissions: [...(ROLE_DEFAULT_PERMISSIONS[newRole] ?? [])] as string[],
                        });
                      }}
                      className="appearance-none w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-white cursor-pointer"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <Building2 size={13} className="text-gray-400" /> Branch <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required value={form.branch}
                      onChange={(e) => setForm({ ...form, branch: e.target.value })}
                      className="appearance-none w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-white cursor-pointer"
                    >
                      <option value="">Select branch</option>
                      {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Module Permissions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                      <Shield size={13} className="text-gray-400" /> Module Permissions
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Role defaults pre-filled — customise freely.</p>
                  </div>
                  {form.role !== "super_admin" && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, permissions: ALL_PERMISSIONS.map((p) => p.key) })}
                        className="text-[11px] font-medium text-blue-600 hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-gray-300 text-xs">|</span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, permissions: [] })}
                        className="text-[11px] font-medium text-gray-500 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {form.role === "super_admin" ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                    <Shield size={16} className="text-red-500 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-red-700">Full System Access</p>
                      <p className="text-[11px] text-red-500 mt-0.5">Super Admins bypass all permission checks automatically.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_PERMISSIONS.map((perm) => {
                      const checked = form.permissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                            checked
                              ? "bg-blue-50 border-blue-300"
                              : "bg-gray-50 border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? form.permissions.filter((p) => p !== perm.key)
                                : [...form.permissions, perm.key];
                              setForm({ ...form, permissions: next });
                            }}
                            className="mt-0.5 accent-blue-600 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 leading-tight">{perm.label}</p>
                            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{perm.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Target — only for counsellor */}
              {form.role === "counsellor" && (
                <div className="max-w-[50%]">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <Target size={13} className="text-gray-400" /> Monthly Visa Target
                  </label>
                  <input
                    type="number" min="0" value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                  />
                </div>
              )}

              {/* Footer buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={closeForm}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-6 py-2.5 text-white rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                  style={{ backgroundColor: branding.brandColor }}
                >
                  {formLoading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                  ) : (
                    <><Plus size={16} /> {editUser ? "Update User" : "Create User"}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Reset Password Modal ─── */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeReset}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <KeyRound size={20} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Reset Password</h2>
                  <p className="text-xs text-gray-500">for {resetTarget.name}</p>
                </div>
              </div>
              <button onClick={closeReset} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleReset} className="px-6 py-5 space-y-4">
              {resetError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0" /> {resetError}
                </div>
              )}
              {resetSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <CheckCircle2 size={16} className="shrink-0" /> {resetSuccess}
                </div>
              )}

              {/* Info box */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
                You are about to reset the password for <span className="font-bold">{resetTarget.email}</span>. The user will need to use the new password to log in.
              </div>

              {/* New password */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                  <Lock size={13} className="text-gray-400" /> New Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPw ? "text" : "password"}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-3.5 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all placeholder:text-gray-300"
                  />
                  <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                  <Lock size={13} className="text-gray-400" /> Confirm Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPw ? "text" : "password"}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className={`w-full px-3.5 py-2.5 pr-10 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all placeholder:text-gray-300 ${
                      confirmPassword && confirmPassword !== newPassword
                        ? "border-red-300 focus:ring-red-500/30 focus:border-red-400"
                        : confirmPassword && confirmPassword === newPassword
                        ? "border-green-300 focus:ring-green-500/30 focus:border-green-400"
                        : "border-gray-200 focus:ring-amber-500/30 focus:border-amber-400"
                    }`}
                  />
                  <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={12} /> Passwords do not match</p>
                )}
                {confirmPassword && confirmPassword === newPassword && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> Passwords match</p>
                )}
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={closeReset}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {resetLoading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Resetting…</>
                  ) : (
                    <><KeyRound size={16} /> Reset Password</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
