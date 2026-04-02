import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Permission } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getRoleBadgeColor(role: string): string {
  const colors: Record<string, string> = {
    super_admin: "bg-red-100 text-red-800",
    counsellor: "bg-blue-100 text-blue-800",
    telecaller: "bg-green-100 text-green-800",
    application_team: "bg-purple-100 text-purple-800",
    admission_team: "bg-yellow-100 text-yellow-800",
    visa_team: "bg-orange-100 text-orange-800",
    front_desk: "bg-gray-100 text-gray-800",
  };
  return colors[role] || "bg-gray-100 text-gray-800";
}

export function getRoleLabel(role: string | undefined | null, catalog?: { slug: string; label: string }[]): string {
  if (role == null || role === "") return "Member";
  const fromCatalog = catalog?.find((r) => r.slug === role);
  if (fromCatalog) return fromCatalog.label;
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    counsellor: "Counsellor",
    telecaller: "Telecaller",
    application_team: "Application Team",
    admission_team: "Admission Team",
    visa_team: "Visa Team",
    front_desk: "Front Desk",
  };
  return labels[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    heated: "bg-red-100 text-red-800",
    warm: "bg-yellow-100 text-yellow-800",
    cold: "bg-blue-100 text-blue-800",
    missed: "bg-gray-100 text-gray-600",
    counsellor: "bg-blue-100 text-blue-800",
    application: "bg-purple-100 text-purple-800",
    admission: "bg-indigo-100 text-indigo-800",
    visa: "bg-teal-100 text-teal-800",
    completed: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
    submitted: "bg-blue-100 text-blue-800",
    accepted: "bg-green-100 text-green-800",
    deferred: "bg-gray-100 text-gray-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

export const COUNTRIES = [
  "Australia", "Canada", "United Kingdom", "United States",
  "New Zealand", "Germany", "France", "Japan", "South Korea",
  "Netherlands", "Sweden", "Denmark", "Finland", "Norway",
  "Switzerland", "Austria", "Ireland", "Singapore", "Malaysia",
  "Dubai (UAE)", "Cyprus", "Malta", "Hungary", "Poland", "Czech Republic",
];

export const LEAD_STAGES: { value: string; label: string; color: string }[] = [
  // Application
  { value: "document_pending",             label: "Document Pending",                color: "bg-amber-50 text-amber-700" },
  { value: "document_submitted",           label: "Document Submitted",              color: "bg-amber-100 text-amber-800" },
  // Offer
  { value: "offer_applied",               label: "Offer Applied",                   color: "bg-blue-50 text-blue-700" },
  { value: "acknowledge",                  label: "Acknowledge",                     color: "bg-blue-100 text-blue-700" },
  { value: "document_requested",           label: "Document Requested",              color: "bg-sky-100 text-sky-700" },
  { value: "document_sent",                label: "Document Sent",                   color: "bg-sky-200 text-sky-800" },
  { value: "conditional_offer_received",   label: "Conditional Offer Received",      color: "bg-cyan-100 text-cyan-700" },
  { value: "unconditional_offer_received", label: "Unconditional Offer Received",    color: "bg-cyan-200 text-cyan-800" },
  // GS
  { value: "gs_applied",                   label: "GS Applied",                      color: "bg-purple-50 text-purple-700" },
  { value: "gs_additional_doc_requested",  label: "GS Additional Doc Requested",     color: "bg-purple-100 text-purple-700" },
  { value: "gs_additional_doc_sent",       label: "GS Additional Doc Sent",          color: "bg-purple-200 text-purple-800" },
  { value: "gs_approved",                  label: "GS Approved",                     color: "bg-violet-100 text-violet-700" },
  { value: "gs_rejected",                  label: "GS Rejected",                     color: "bg-red-100 text-red-700" },
  // COE
  { value: "coe_applied",                  label: "COE Applied",                     color: "bg-emerald-50 text-emerald-700" },
  { value: "coe_additional_doc_requested", label: "COE Additional Doc Requested",    color: "bg-emerald-100 text-emerald-700" },
  { value: "coe_additional_doc_sent",      label: "COE Additional Doc Sent",         color: "bg-emerald-200 text-emerald-800" },
  { value: "coe_received",                 label: "COE Received",                    color: "bg-green-200 text-green-800" },
  // Visa
  { value: "visa_applied",                 label: "Visa Applied",                    color: "bg-teal-50 text-teal-700" },
  { value: "visa_grant",                   label: "Visa Grant",                      color: "bg-teal-200 text-teal-800" },
  { value: "visa_reject",                  label: "Visa Reject",                     color: "bg-red-100 text-red-700" },
  { value: "visa_invalid",                 label: "Visa Invalid",                    color: "bg-orange-100 text-orange-700" },
  { value: "visa_withdrawn",               label: "Visa Withdrawn",                  color: "bg-gray-100 text-gray-600" },
];

export const FD_STATUSES: { value: string; label: string; color: string }[] = [
  { value: "FD-Junk",                      label: "FD-Junk",                         color: "bg-black text-white" },
  { value: "AP-Call Not Received",         label: "AP-Call Not Received",            color: "bg-blue-200 text-blue-900" },
  { value: "AP-Call Back Later",           label: "AP-Call Back Later",              color: "bg-blue-400 text-white" },
  { value: "AP-Not Interested",            label: "AP-Not Interested",               color: "bg-purple-500 text-white" },
  { value: "Wrong Number",                 label: "Wrong Number",                    color: "bg-pink-400 text-white" },
  { value: "Not Qualified",                label: "Not Qualified",                   color: "bg-cyan-400 text-white" },
  { value: "Not Interested",               label: "Not Interested",                  color: "bg-teal-400 text-white" },
  { value: "AP-Pending",                   label: "AP-Pending",                      color: "bg-black text-white" },
  { value: "Interested 2027",              label: "Interested 2027",                 color: "bg-teal-600 text-white" },
  { value: "FD-Future Prospective",        label: "FD-Future Prospective",           color: "bg-teal-500 text-white" },
  { value: "On Hold",                      label: "On Hold",                         color: "bg-teal-500 text-white" },
  { value: "Plan Dropped",                 label: "Plan Dropped",                    color: "bg-teal-500 text-white" },
  { value: "Counselling",                  label: "Counselling",                     color: "bg-black text-white" },
  { value: "Counselled",                   label: "Counselled",                      color: "bg-black text-white" },
  { value: "AP-Interested",                label: "AP-Interested",                   color: "bg-black text-white" },
  { value: "Negotiation",                  label: "Negotiation",                     color: "bg-green-500 text-white" },
  { value: "Open/Unassigned",              label: "Open/Unassigned",                 color: "bg-pink-400 text-white" },
  { value: "Future Prospect",              label: "Future Prospect",                 color: "bg-green-300 text-white" },
  { value: "FD-Interested",                label: "FD-Interested",                   color: "bg-teal-700 text-white" },
  { value: "Dead/Junk Lead",               label: "Dead/Junk Lead",                  color: "bg-blue-300 text-white" },
  { value: "Not Answering",                label: "Not Answering",                   color: "bg-purple-400 text-white" },
  { value: "Assigned",                     label: "Assigned",                        color: "bg-purple-500 text-white" },
  { value: "In-Progress",                  label: "In-Progress",                     color: "bg-green-400 text-white" },
  { value: "Not Genuine",                  label: "Not Genuine",                     color: "bg-black text-white" },
  { value: "Phone Counselling",            label: "Phone Counselling",               color: "bg-indigo-400 text-white" },
  { value: "Qualified Lead",               label: "Qualified Lead",                  color: "bg-blue-600 text-white" },
  { value: "Registered/Completed",         label: "Registered/Completed",            color: "bg-gray-500 text-white" },
  { value: "Interested",                   label: "Interested",                      color: "bg-teal-300 text-white" },
  { value: "Closed Lost",                  label: "Closed Lost",                     color: "bg-red-500 text-white" },
];

export function getLeadStageColor(value: string): string {
  return LEAD_STAGES.find((s) => s.value === value)?.color ?? "bg-gray-100 text-gray-600";
}

export const LEAD_STAGE_GROUPS: { label: string; dot: string; stages: string[] }[] = [
  { label: "Application", dot: "bg-amber-400", stages: ["document_pending", "document_submitted"] },
  { label: "Offer",  dot: "bg-blue-400",    stages: ["offer_applied", "acknowledge", "document_requested", "document_sent", "conditional_offer_received", "unconditional_offer_received"] },
  { label: "GS",     dot: "bg-purple-400",  stages: ["gs_applied", "gs_additional_doc_requested", "gs_additional_doc_sent", "gs_approved", "gs_rejected"] },
  { label: "COE",    dot: "bg-emerald-400", stages: ["coe_applied", "coe_additional_doc_requested", "coe_additional_doc_sent", "coe_received"] },
  { label: "Visa",   dot: "bg-teal-400",    stages: ["visa_applied", "visa_grant", "visa_reject", "visa_invalid", "visa_withdrawn"] },
];

export function getLeadStageDotColor(value: string): string {
  for (const g of LEAD_STAGE_GROUPS) {
    if (g.stages.includes(value)) return g.dot;
  }
  return "bg-gray-300";
}

export const SERVICES = [
  "Study Abroad", "Language Courses", "University Application",
  "Visa Assistance", "Test Preparation (IELTS/TOEFL)", "Scholarship Guidance",
  "Career Counselling", "Document Verification",
];

export function canAccessModule(role: string, module: string): boolean {
  const permissions: Record<string, string[]> = {
    users: ["super_admin"],
    branches: ["super_admin"],
    analytics: ["super_admin"],
    activity_logs: ["super_admin"],
    settings: ["super_admin"],
    leads: ["super_admin", "counsellor", "telecaller", "front_desk"],
    students: ["super_admin", "counsellor", "application_team", "admission_team", "visa_team"],
    documents: ["super_admin", "counsellor", "application_team", "admission_team", "visa_team"],
    applications: ["super_admin", "application_team", "counsellor"],
    admissions: ["super_admin", "admission_team"],
    visa: ["super_admin", "visa_team"],
    chat: ["super_admin", "counsellor", "telecaller", "front_desk", "application_team", "admission_team", "visa_team"],
    commission: ["super_admin", "admission_team"],
  };
  return permissions[module]?.includes(role) ?? false;
}

// ─── Permissions-based access check ─────────────────────────────────────────
// Used by layout/UI when the user's personal permissions array is available.
// Super admins always have full access regardless of stored permissions.
export function hasPermission(
  permissions: string[],
  module: string,
  role?: string
): boolean {
  if (role === "super_admin") return true;
  return permissions.includes(module);
}

// ─── Default permissions pre-filled when a role is chosen in the user form ──
export const ROLE_DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: [
    "leads", "students", "documents", "applications",
    "admissions", "visa", "analytics", "branches",
    "users", "settings", "activity_logs", "chat", "commission",
  ],
  counsellor: ["leads", "students", "documents", "applications", "chat"],
  telecaller: ["leads", "chat"],
  front_desk: ["leads", "chat"],
  application_team: ["students", "documents", "applications", "chat"],
  admission_team: ["students", "documents", "admissions", "chat", "commission"],
  visa_team: ["students", "documents", "visa", "chat"],
};

// ─── All available module permissions (used to render checkboxes) ────────────
export const ALL_PERMISSIONS: { key: Permission; label: string; description: string }[] = [
  { key: "leads",         label: "Leads",             description: "Create, view & manage leads" },
  { key: "students",      label: "Students",          description: "View & manage enrolled students" },
  { key: "documents",     label: "Documents",         description: "Upload, verify & download documents" },
  { key: "applications",  label: "Applications",      description: "Track university applications" },
  { key: "admissions",    label: "Admissions",        description: "Manage admission pipeline" },
  { key: "visa",          label: "Visa",              description: "Handle visa processing" },
  { key: "chat",          label: "Chat",              description: "Internal team messaging" },
  { key: "analytics",     label: "Analytics",         description: "View reports & performance data" },
  { key: "branches",      label: "Branches",          description: "View & manage office branches" },
  { key: "users",         label: "User Management",   description: "Create & manage team accounts" },
  { key: "activity_logs", label: "Activity Logs",     description: "Full audit trail of all actions" },
  { key: "settings",      label: "Settings",          description: "System-wide configuration" },
  { key: "commission",    label: "Commission",        description: "Record partner commissions by destination" },
];

// ─── Settings sub-permissions (which tabs inside Settings a user can access) ─
export const SETTINGS_SUB_PERMISSIONS: { key: string; label: string; tabId: string }[] = [
  { key: "settings:branding",   label: "Branding",            tabId: "branding" },
  { key: "settings:contact",    label: "Contact Info",         tabId: "contact" },
  { key: "settings:leads",      label: "Lead Configuration",   tabId: "leads" },
  { key: "settings:lists",      label: "Countries & Services", tabId: "lists" },
  { key: "settings:modules",    label: "Module Toggles",       tabId: "modules" },
  { key: "settings:email",      label: "Email & SMTP",         tabId: "email" },
  { key: "settings:checklists", label: "Document Checklists",  tabId: "checklists" },
  { key: "settings:team",       label: "Roles & telecaller",   tabId: "team" },
];

export const ALL_SETTINGS_SUB_KEYS = SETTINGS_SUB_PERMISSIONS.map((s) => s.key);
