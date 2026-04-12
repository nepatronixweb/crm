"use client";
import { useEffect, useState, useRef, useCallback, type DragEvent, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import {
  Settings, Lock, Upload, Plus, Trash2, Save, CheckCircle,
  Palette, Building2, Phone, Mail, Globe, MapPin,
  Users, Tag, List, ToggleLeft, ToggleRight, Server,
  FileText, Image as ImageIcon, ChevronRight, X,
  Flame, Zap, Target, Layers, GitBranch, GraduationCap, ChevronDown, Pencil,
  UserCog, Loader2, Paperclip, BookOpen, Languages, ExternalLink, GripVertical,
  LayoutDashboard,
} from "lucide-react";
import { useBrandingRefresh } from "@/app/branding-context";
import { notifyAppSettingsChanged } from "@/lib/appSettingsSync";
import { ALL_PERMISSIONS, SETTINGS_SUB_PERMISSIONS, stripModuleGranularKeys, withFullModuleGranular } from "@/lib/utils";
import {
  audienceSupportsOrderCustomization,
  dashboardWidgetsByAudience,
  defaultDashboardWidgets,
  mergeDashboardWidgetsFromApi,
  mergeDashboardWidgetOrderFromApi,
  resolveWidgetIdsForSettingsEditor,
  type DashboardWidgetOrderState,
} from "@/lib/dashboardLayout";

const ROLE_DEFAULT_GRANULAR_KEYS: Record<string, readonly string[]> = {
  leads: ["leads_acl", "leads_add", "leads_export"],
  students: ["students_acl", "students_add", "students_export"],
};
const EXTRA_PERM_LABELS: Record<string, string> = {
  leads_acl: "Leads - granular (Add/Export below apply)",
  leads_add: "Leads - add / import",
  leads_export: "Leads - export",
  students_acl: "Students - granular (Add/Export below apply)",
  students_add: "Students - add student",
  students_export: "Students - export",
};

function defaultPermChecked(perms: string[], key: string): boolean {
  if (key === "leads" || key === "students") return perms.includes(key);
  if (key === "leads_acl") return perms.includes("leads_acl");
  if (key === "students_acl") return perms.includes("students_acl");
  if (key === "leads_add") {
    if (!perms.includes("leads")) return false;
    return perms.includes("leads_acl") ? perms.includes("leads_add") : true;
  }
  if (key === "leads_export") {
    if (!perms.includes("leads")) return false;
    return perms.includes("leads_acl") ? perms.includes("leads_export") : true;
  }
  if (key === "students_add") {
    if (!perms.includes("students")) return false;
    return perms.includes("students_acl") ? perms.includes("students_add") : true;
  }
  if (key === "students_export") {
    if (!perms.includes("students")) return false;
    return perms.includes("students_acl") ? perms.includes("students_export") : true;
  }
  return perms.includes(key);
}

function applyRoleDefaultPermissionToggle(
  roles: { slug: string; label: string; defaultPermissions: string[] }[],
  ri: number,
  key: string
): { slug: string; label: string; defaultPermissions: string[] }[] {
  const next = [...roles];
  const r = { ...next[ri] };
  let p = [...r.defaultPermissions];

  const toggleGranularSub = (module: "leads" | "students", subKey: string) => {
    if (!p.includes(module)) return;
    if (!p.includes(`${module}_acl`)) {
      p = withFullModuleGranular(stripModuleGranularKeys(p, module), module);
    }
    if (p.includes(subKey)) p = p.filter((x) => x !== subKey);
    else p.push(subKey);
  };

  if (key === "leads") {
    p = p.includes("leads") ? stripModuleGranularKeys(p, "leads") : withFullModuleGranular(p, "leads");
  } else if (key === "students") {
    p = p.includes("students") ? stripModuleGranularKeys(p, "students") : withFullModuleGranular(p, "students");
  } else if (key === "leads_add") toggleGranularSub("leads", "leads_add");
  else if (key === "leads_export") toggleGranularSub("leads", "leads_export");
  else if (key === "students_add") toggleGranularSub("students", "students_add");
  else if (key === "students_export") toggleGranularSub("students", "students_export");
  else if (key === "leads_acl") {
    if (p.includes("leads_acl")) {
      p = p.filter((x) => !["leads_acl", "leads_add", "leads_export"].includes(x));
    } else if (p.includes("leads")) {
      p = [...p, "leads_acl", "leads_add", "leads_export"];
    }
  } else if (key === "students_acl") {
    if (p.includes("students_acl")) {
      p = p.filter((x) => !["students_acl", "students_add", "students_export"].includes(x));
    } else if (p.includes("students")) {
      p = [...p, "students_acl", "students_add", "students_export"];
    }
  } else {
    const s = new Set(p);
    if (s.has(key)) {
      s.delete(key);
      if (key === "settings") {
        SETTINGS_SUB_PERMISSIONS.forEach((sub) => s.delete(sub.key));
      }
    } else {
      s.add(key);
      if (key === "settings") {
        SETTINGS_SUB_PERMISSIONS.forEach((sub) => s.add(sub.key));
      }
    }
    p = Array.from(s);
  }

  r.defaultPermissions = p;
  next[ri] = r;
  return next;
}
import { DEFAULT_APPLICATION_ROLES } from "@/lib/applicationRoles";
import { DEFAULT_TELECALLER_TRANSFER_OUTCOMES } from "@/lib/telecallerTransferConfig";
import type { TelecallerTransferOutcome } from "@/types/telecallerTransfer";
import {
  universityEntriesFromNames,
  normalizeUniversitiesArray,
  safeExternalUrl,
  type UniversityEntry,
  type UniversityAttachment,
} from "@/lib/countryUniversities";

// ─── Types ──────────────────────────────────────────────────────────────────
interface AppSettings {
  companyName: string;
  shortCode: string;
  tagline: string;
  logoPath: string;
  faviconPath: string;
  brandColor: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  leadStatuses: string[];
  leadSources: string[];
  leadStandings: string[];
  fdStatuses: string[];
  leadStageGroups: string[];
  leadStages: { value: string; label: string; group: string }[];
  countryStages: Record<string, { value: string; label: string; pipeline: string }[]>;
  b2bNames: string[];
  remarkOptions: string[];
  remarkOptionsApplication: string[];
  remarkOptionsAdmission: string[];
  remarkOptionsVisa: string[];
  courses: string[];
  educationLevels: string[];
  countries: { name: string; universities: UniversityEntry[] }[];
  services: string[];
  enabledModules: string[];
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  emailFromName: string;
  paymentQrPath: string;
  applicationRoles: { slug: string; label: string; defaultPermissions: string[] }[];
  telecallerTransferOutcomes: TelecallerTransferOutcome[];
  dashboardWidgets: Record<string, boolean>;
  dashboardWidgetOrder: DashboardWidgetOrderState;
}

interface ChecklistItem { name: string; description?: string; isRequired: boolean; }
interface Checklist { _id?: string; country: string; documents: ChecklistItem[]; }

const TABS = [
  { id: "branding",    label: "Branding",            icon: Palette },
  { id: "contact",     label: "Contact Info",         icon: Building2 },
  { id: "leads",       label: "Lead Configuration",   icon: Users },
  { id: "lists",       label: "Countries & Services", icon: List },
  { id: "modules",     label: "Module Toggles",       icon: ToggleRight },
  { id: "email",       label: "Email & SMTP",         icon: Mail },
  { id: "team",        label: "Roles & telecaller",   icon: UserCog },
  { id: "checklists",  label: "Document Checklists",  icon: FileText },
] as const;

type TabId = typeof TABS[number]["id"];

const ALL_MODULES = [
  { key: "leads",         label: "Leads" },
  { key: "students",      label: "Students" },
  { key: "documents",     label: "Documents" },
  { key: "applications",  label: "Applications" },
  { key: "admissions",    label: "Admissions" },
  { key: "visa",          label: "Visa" },
  { key: "analytics",     label: "Analytics / Reports" },
  { key: "branches",      label: "Branches" },
  { key: "users",         label: "User Management" },
  { key: "activity_logs", label: "Activity Logs" },
  { key: "settings",      label: "Settings" },
  { key: "commission",    label: "Commission" },
  { key: "inventory",     label: "Inventory" },
  { key: "hr",            label: "HR management" },
  { key: "chat",          label: "Internal chat" },
];

const DEFAULT_SETTINGS: AppSettings = {
  companyName: "Education Tree Global",
  shortCode: "ETG",
  tagline: "Your global education partner",
  logoPath: "",
  faviconPath: "",
  brandColor: "#2563eb",
  address: "",
  phone: "",
  email: "",
  website: "",
  leadStatuses: ["new","contacted","qualified","application","admission","visa","completed","rejected"],
  leadSources: ["Walk-in","Referral","Social Media","Website","Partner","Phone Call","Email","Exhibition","Other"],
  leadStandings: ["heated", "hot", "warm", "out_of_contact"],
  fdStatuses: [
    "FD-Junk","AP-Call Not Received","AP-Call Back Later","AP-Not Interested",
    "Wrong Number","Not Qualified","Not Interested","AP-Pending",
    "Interested 2027","FD-Future Prospective","On Hold","Plan Dropped",
    "Counselling","Counselled","AP-Interested","Negotiation",
    "Open/Unassigned","Future Prospect","FD-Interested","Dead/Junk Lead",
    "Not Answering","Assigned","In-Progress","Not Genuine",
    "Phone Counselling","Qualified Lead","Registered/Completed",
    "Interested","Closed Lost",
  ],
  leadStageGroups: ["Application", "Offer", "GS", "COE", "Visa"],
  leadStages: [
    { value: "document_pending", label: "Document Pending", group: "Application" },
    { value: "document_submitted", label: "Document Submitted", group: "Application" },
    { value: "offer_applied", label: "Offer Applied", group: "Offer" },
    { value: "acknowledge", label: "Acknowledge", group: "Offer" },
    { value: "document_requested", label: "Document Requested", group: "Offer" },
    { value: "document_sent", label: "Document Sent", group: "Offer" },
    { value: "conditional_offer_received", label: "Conditional Offer Received", group: "Offer" },
    { value: "unconditional_offer_received", label: "Unconditional Offer Received", group: "Offer" },
    { value: "gs_applied", label: "GS Applied", group: "GS" },
    { value: "gs_additional_doc_requested", label: "GS Additional Doc Requested", group: "GS" },
    { value: "gs_additional_doc_sent", label: "GS Additional Doc Sent", group: "GS" },
    { value: "gs_approved", label: "GS Approved", group: "GS" },
    { value: "gs_rejected", label: "GS Rejected", group: "GS" },
    { value: "coe_applied", label: "COE Applied", group: "COE" },
    { value: "coe_additional_doc_requested", label: "COE Additional Doc Requested", group: "COE" },
    { value: "coe_additional_doc_sent", label: "COE Additional Doc Sent", group: "COE" },
    { value: "coe_received", label: "COE Received", group: "COE" },
    { value: "visa_applied", label: "Visa Applied", group: "Visa" },
    { value: "visa_grant", label: "Visa Grant", group: "Visa" },
    { value: "visa_reject", label: "Visa Reject", group: "Visa" },
    { value: "visa_invalid", label: "Visa Invalid", group: "Visa" },
    { value: "visa_withdrawn", label: "Visa Withdrawn", group: "Visa" },
  ],
  countryStages: {},
  b2bNames: [],
  remarkOptions: [
    "Additional Documents Requested", "Additional Documents Sent",
    "Interview - GS/Cr./Visa", "Interview Cleared", "Payment Made",
    "Medical Requested/Booked", "Passport Submitted",
    "DS-160/VFS/Embassy Appointment", "Pink Slip", "NOC",
    "Defer Offer Requested", "Defer CoE Requested",
    "Refund Requested", "Offer Withdrawn", "Done",
  ],
  remarkOptionsApplication: [],
  remarkOptionsAdmission: [],
  remarkOptionsVisa: [],
  courses: [
    "Bachelor of IT",
    "Bachelor of Nursing",
    "Bachelor of Business",
    "Master of IT",
    "Bachelor of Community Services",
    "Master of Business Analyst",
    "Master of Business Administration",
  ],
  educationLevels: ["Diploma", "Bachelor", "Master"],
  countries: [
    { name: "Australia", universities: universityEntriesFromNames(["University of Melbourne","Australian National University","University of Sydney","Monash University","University of New South Wales"]) },
    { name: "Canada", universities: universityEntriesFromNames(["University of Toronto","University of British Columbia","McGill University","University of Alberta","McMaster University"]) },
    { name: "United Kingdom", universities: universityEntriesFromNames(["University of Oxford","University of Cambridge","Imperial College London","University College London","London School of Economics"]) },
    { name: "United States", universities: universityEntriesFromNames(["MIT","Stanford University","Harvard University","Columbia University","Yale University"]) },
    { name: "New Zealand", universities: universityEntriesFromNames(["University of Auckland","University of Otago","Victoria University of Wellington"]) },
    { name: "Germany", universities: universityEntriesFromNames(["Technical University of Munich","Heidelberg University","Humboldt University of Berlin"]) },
    { name: "France", universities: universityEntriesFromNames(["Sorbonne University","Sciences Po","HEC Paris"]) },
    { name: "Japan", universities: universityEntriesFromNames(["University of Tokyo","Kyoto University","Osaka University"]) },
    { name: "South Korea", universities: universityEntriesFromNames(["Seoul National University","Yonsei University","Korea University"]) },
    { name: "Netherlands", universities: universityEntriesFromNames(["University of Amsterdam","Delft University of Technology","Leiden University"]) },
    { name: "Sweden", universities: universityEntriesFromNames(["Karolinska Institute","Lund University","Uppsala University"]) },
    { name: "Denmark", universities: universityEntriesFromNames(["University of Copenhagen","Technical University of Denmark","Aarhus University"]) },
    { name: "Finland", universities: universityEntriesFromNames(["University of Helsinki","Aalto University"]) },
    { name: "Norway", universities: universityEntriesFromNames(["University of Oslo","Norwegian University of Science and Technology"]) },
    { name: "Switzerland", universities: universityEntriesFromNames(["ETH Zurich","EPFL","University of Zurich"]) },
    { name: "Austria", universities: universityEntriesFromNames(["University of Vienna","Vienna University of Technology"]) },
    { name: "Ireland", universities: universityEntriesFromNames(["Trinity College Dublin","University College Dublin"]) },
    { name: "Singapore", universities: universityEntriesFromNames(["National University of Singapore","Nanyang Technological University"]) },
    { name: "Malaysia", universities: universityEntriesFromNames(["University of Malaya","Universiti Putra Malaysia"]) },
    { name: "Dubai (UAE)", universities: universityEntriesFromNames(["American University in Dubai","University of Dubai"]) },
    { name: "Cyprus", universities: universityEntriesFromNames(["University of Cyprus","European University Cyprus"]) },
    { name: "Malta", universities: universityEntriesFromNames(["University of Malta"]) },
    { name: "Hungary", universities: universityEntriesFromNames(["Budapest University of Technology and Economics"]) },
    { name: "Poland", universities: universityEntriesFromNames(["University of Warsaw","Jagiellonian University"]) },
    { name: "Czech Republic", universities: universityEntriesFromNames(["Charles University","Czech Technical University in Prague"]) },
  ],
  services: [
    "Study Abroad","Language Courses","University Application",
    "Visa Assistance","Test Preparation (IELTS/TOEFL)","Scholarship Guidance",
    "Career Counselling","Document Verification",
  ],
  enabledModules: ["leads","students","documents","applications","admissions","visa","analytics","branches","users","activity_logs","settings","commission","inventory","hr","chat"],
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  emailFromName: "",
  paymentQrPath: "",
  applicationRoles: DEFAULT_APPLICATION_ROLES.map((r) => ({
    slug: r.slug,
    label: r.label,
    defaultPermissions: [...r.defaultPermissions],
  })),
  telecallerTransferOutcomes: DEFAULT_TELECALLER_TRANSFER_OUTCOMES.map((o) => ({ ...o })),
  dashboardWidgets: defaultDashboardWidgets(),
  dashboardWidgetOrder: {},
};

async function uploadUniversitySettingsDoc(file: File): Promise<UniversityAttachment | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/settings/university-doc", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.path) return null;
  return { path: data.path, originalName: data.originalName || file.name };
}

// ─── Tag/Pill List Editor (draggable order) ────────────────────────────────
function TagEditor({
  label, items, onChange, placeholder,
}: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const val = draft.trim();
    if (!val || items.includes(val)) return;
    onChange([...items, val]);
    setDraft("");
  };

  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-2">{label}</p>
      <DraggableChipList
        items={items}
        onChange={onChange}
        onRemoveItem={(item) => onChange(items.filter((i) => i !== item))}
        emptyLabel="No items yet"
        accent="slate"
        containerClassName="flex flex-wrap gap-2 p-3 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl min-h-[48px] max-h-52 overflow-y-auto"
      />
      <div className="flex gap-2 mt-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder ?? `Add ${label.toLowerCase()}`}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 bg-gray-900 hover:bg-gray-700 text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">Drag chips to set dropdown order. Save settings to persist.</p>
    </div>
  );
}

const CHIP_LIST_DND_MIME = "application/x-etg-chip-index";

function reorderArray<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  const len = arr.length;
  if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len || fromIndex === toIndex) {
    return [...arr];
  }
  const next = [...arr];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

function reorderStringArray(arr: string[], fromIndex: number, toIndex: number): string[] {
  return reorderArray(arr, fromIndex, toIndex);
}

const DASHBOARD_WIDGET_ORDER_DND_MIME = "application/x-etg-dashboard-widget-order";

function DashboardWidgetOrderList({
  orderedIds,
  onReorder,
  getLabel,
}: {
  orderedIds: string[];
  onReorder: (ids: string[]) => void;
  getLabel: (id: string) => string;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const onDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    setDraggingIndex(index);
    e.dataTransfer.setData(DASHBOARD_WIDGET_ORDER_DND_MIME, String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOverRow = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  };

  const onDropRow = (e: DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData(DASHBOARD_WIDGET_ORDER_DND_MIME);
    const fromIndex = parseInt(raw, 10);
    if (Number.isNaN(fromIndex) || fromIndex === dropIndex) {
      setDraggingIndex(null);
      setOverIndex(null);
      return;
    }
    onReorder(reorderStringArray(orderedIds, fromIndex, dropIndex));
    setDraggingIndex(null);
    setOverIndex(null);
  };

  const clearDrag = () => {
    setDraggingIndex(null);
    setOverIndex(null);
  };

  return (
    <div
      className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden mt-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      {orderedIds.map((id, index) => (
        <div
          key={id}
          draggable
          onDragStart={(e) => onDragStart(e, index)}
          onDragOver={(e) => onDragOverRow(e, index)}
          onDragLeave={() => setOverIndex((o) => (o === index ? null : o))}
          onDrop={(e) => onDropRow(e, index)}
          onDragEnd={clearDrag}
          className={`flex items-center gap-3 px-3 py-2.5 bg-white text-sm cursor-grab active:cursor-grabbing select-none ${
            draggingIndex === index ? "opacity-50" : ""
          } ${
            overIndex === index && draggingIndex !== null && draggingIndex !== index ? "ring-2 ring-gray-300 ring-inset" : ""
          }`}
        >
          <GripVertical size={16} className="text-gray-400 shrink-0" aria-hidden />
          <span className="text-gray-900 font-medium truncate">{getLabel(id)}</span>
        </div>
      ))}
    </div>
  );
}

const PL_GROUP_DND_MIME = "application/x-etg-pl-group-index";
const PL_STAGE_DND_MIME = "application/x-etg-pl-stage-pos";
const CS_STAGE_DND_MIME = "application/x-etg-cs-stage-pos";

type LeadStageRow = { value: string; label: string; group: string };
type CountryStageRow = { value: string; label: string; pipeline: string };

const COUNTRY_PIPELINE_ORDER = ["Offer", "COE", "Visa"] as const;

function reorderLeadStageGroupsOrder(
  leadStageGroups: string[],
  leadStages: LeadStageRow[],
  fromIndex: number,
  toIndex: number,
): { leadStageGroups: string[]; leadStages: LeadStageRow[] } {
  const newGroups = reorderStringArray(leadStageGroups, fromIndex, toIndex);
  const byGroup = new Map<string, LeadStageRow[]>();
  for (const g of newGroups) byGroup.set(g, []);
  const orphans: LeadStageRow[] = [];
  for (const s of leadStages) {
    const list = byGroup.get(s.group);
    if (list) list.push(s);
    else orphans.push(s);
  }
  const stages: LeadStageRow[] = [];
  for (const g of newGroups) {
    stages.push(...(byGroup.get(g) ?? []));
  }
  return { leadStageGroups: newGroups, leadStages: [...stages, ...orphans] };
}

function reorderLeadStageWithinGroup(
  leadStages: LeadStageRow[],
  leadStageGroups: string[],
  group: string,
  fromIndex: number,
  toIndex: number,
): LeadStageRow[] {
  const inGroup = leadStages.filter((s) => s.group === group);
  if (
    fromIndex < 0 ||
    fromIndex >= inGroup.length ||
    toIndex < 0 ||
    toIndex >= inGroup.length ||
    fromIndex === toIndex
  ) {
    return leadStages;
  }
  const newInGroup = reorderArray(inGroup, fromIndex, toIndex);
  const without = leadStages.filter((s) => s.group !== group);
  const byGroup = new Map<string, LeadStageRow[]>();
  for (const g of leadStageGroups) byGroup.set(g, []);
  for (const s of without) {
    byGroup.get(s.group)?.push(s);
  }
  byGroup.set(group, newInGroup);
  const out: LeadStageRow[] = [];
  for (const g of leadStageGroups) {
    out.push(...(byGroup.get(g) ?? []));
  }
  const orphaned = without.filter((s) => !leadStageGroups.includes(s.group));
  return [...out, ...orphaned];
}

function reorderCountryStageWithinPipeline(
  stages: CountryStageRow[],
  pipeline: string,
  pipelineOrder: readonly string[],
  fromIndex: number,
  toIndex: number,
): CountryStageRow[] {
  const inPipe = stages.filter((s) => s.pipeline === pipeline);
  if (
    fromIndex < 0 ||
    fromIndex >= inPipe.length ||
    toIndex < 0 ||
    toIndex >= inPipe.length ||
    fromIndex === toIndex
  ) {
    return stages;
  }
  const newInPipe = reorderArray(inPipe, fromIndex, toIndex);
  const byP = new Map<string, CountryStageRow[]>();
  for (const p of pipelineOrder) byP.set(p, []);
  for (const s of stages) {
    if (s.pipeline === pipeline) continue;
    const list = byP.get(s.pipeline);
    if (list) list.push(s);
  }
  byP.set(pipeline, newInPipe);
  const out: CountryStageRow[] = [];
  for (const p of pipelineOrder) {
    out.push(...(byP.get(p) ?? []));
  }
  const other = stages.filter((s) => !pipelineOrder.includes(s.pipeline));
  return [...out, ...other];
}

type ChipListAccent = "indigo" | "violet" | "blue" | "purple" | "teal" | "slate";

const CHIP_LIST_THEME: Record<ChipListAccent, { overRing: string; dragging: string; defaultDot: string }> = {
  indigo: {
    overRing: "ring-2 ring-indigo-400 ring-offset-1 border-indigo-300",
    dragging: "opacity-50 border-dashed border-indigo-300",
    defaultDot: "bg-indigo-400",
  },
  violet: {
    overRing: "ring-2 ring-violet-400 ring-offset-1 border-violet-300",
    dragging: "opacity-50 border-dashed border-violet-300",
    defaultDot: "bg-violet-400",
  },
  blue: {
    overRing: "ring-2 ring-blue-400 ring-offset-1 border-blue-300",
    dragging: "opacity-50 border-dashed border-blue-300",
    defaultDot: "bg-blue-400",
  },
  purple: {
    overRing: "ring-2 ring-purple-400 ring-offset-1 border-purple-300",
    dragging: "opacity-50 border-dashed border-purple-300",
    defaultDot: "bg-purple-400",
  },
  teal: {
    overRing: "ring-2 ring-teal-400 ring-offset-1 border-teal-300",
    dragging: "opacity-50 border-dashed border-teal-300",
    defaultDot: "bg-teal-400",
  },
  slate: {
    overRing: "ring-2 ring-slate-400 ring-offset-1 border-slate-300",
    dragging: "opacity-50 border-dashed border-slate-300",
    defaultDot: "bg-slate-400",
  },
};

function standingTemperatureDot(item: string): string {
  if (item === "heated") return "bg-red-500";
  if (item === "hot") return "bg-orange-500";
  if (item === "warm") return "bg-yellow-500";
  if (item === "cold") return "bg-blue-500";
  return "bg-gray-400";
}

function DraggableChipList({
  items,
  onChange,
  onRemoveItem,
  emptyLabel,
  accent,
  leading,
  formatLabel = (s) => s,
  labelClassName = "",
  containerClassName = "flex flex-wrap gap-2 p-3 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl min-h-[48px] max-h-52 overflow-y-auto",
}: {
  items: string[];
  onChange: (items: string[]) => void;
  onRemoveItem: (item: string) => void;
  emptyLabel: string;
  accent: ChipListAccent;
  leading?: (item: string) => ReactNode;
  formatLabel?: (item: string) => string;
  labelClassName?: string;
  containerClassName?: string;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const theme = CHIP_LIST_THEME[accent];

  const onDragStart = (e: DragEvent<HTMLSpanElement>, index: number) => {
    setDraggingIndex(index);
    e.dataTransfer.setData(CHIP_LIST_DND_MIME, String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOverChip = (e: DragEvent<HTMLSpanElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  };

  const onDropChip = (e: DragEvent<HTMLSpanElement>, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData(CHIP_LIST_DND_MIME);
    const fromIndex = parseInt(raw, 10);
    if (Number.isNaN(fromIndex) || fromIndex === dropIndex) {
      setDraggingIndex(null);
      setOverIndex(null);
      return;
    }
    onChange(reorderStringArray(items, fromIndex, dropIndex));
    setDraggingIndex(null);
    setOverIndex(null);
  };

  const clearDrag = () => {
    setDraggingIndex(null);
    setOverIndex(null);
  };

  return (
    <div
      className={containerClassName}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      {items.length === 0 ? (
        <span className="text-xs text-gray-400 self-center">{emptyLabel}</span>
      ) : (
        items.map((item, index) => (
          <span
            key={`${index}-${item}`}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOverChip(e, index)}
            onDragLeave={() => setOverIndex((o) => (o === index ? null : o))}
            onDrop={(e) => onDropChip(e, index)}
            onDragEnd={clearDrag}
            title="Drag to reorder"
            className={`group inline-flex items-center gap-1 px-3 py-1.5 bg-white border rounded-lg text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all cursor-grab active:cursor-grabbing select-none ${
              draggingIndex === index ? theme.dragging : "border-gray-200"
            } ${overIndex === index && draggingIndex !== null && draggingIndex !== index ? theme.overRing : ""}`}
          >
            <GripVertical size={14} className="text-gray-400 shrink-0" aria-hidden />
            {leading ? (
              leading(item)
            ) : (
              <span className={`w-2 h-2 rounded-full shrink-0 ${theme.defaultDot}`} />
            )}
            <span className={`max-w-[min(220px,100%)] break-words ${labelClassName}`}>{formatLabel(item)}</span>
            <button
              type="button"
              draggable={false}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveItem(item);
              }}
              className="ml-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              aria-label={`Remove ${item}`}
            >
              <X size={12} />
            </button>
          </span>
        ))
      )}
    </div>
  );
}

function LeadStageChipsInGroup({
  group,
  groupStages,
  leadStages,
  leadStageGroups,
  onReorderStages,
  editingStage,
  editingStageLabel,
  onEditingStageChange,
  onEditingLabelChange,
  onSaveLabel,
  onDeleteStage,
}: {
  group: string;
  groupStages: LeadStageRow[];
  leadStages: LeadStageRow[];
  leadStageGroups: string[];
  onReorderStages: (next: LeadStageRow[]) => void;
  editingStage: string | null;
  editingStageLabel: string;
  onEditingStageChange: (v: string | null) => void;
  onEditingLabelChange: (v: string) => void;
  onSaveLabel: (value: string, newLabel: string) => void;
  onDeleteStage: (value: string) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const clearDrag = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div
      className="flex flex-wrap gap-1.5 mb-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      {groupStages.map((stage, si) => (
        <span
          key={stage.value}
          draggable={editingStage !== stage.value}
          title="Drag to reorder"
          onDragStart={(e) => {
            setDragIdx(si);
            e.dataTransfer.setData(PL_STAGE_DND_MIME, JSON.stringify({ g: group, i: si }));
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setOverIdx(si);
          }}
          onDragLeave={() => setOverIdx((o) => (o === si ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            let parsed: { g: string; i: number };
            try {
              parsed = JSON.parse(e.dataTransfer.getData(PL_STAGE_DND_MIME)) as { g: string; i: number };
            } catch {
              clearDrag();
              return;
            }
            if (parsed.g !== group || typeof parsed.i !== "number") {
              clearDrag();
              return;
            }
            const from = parsed.i;
            if (from === si) {
              clearDrag();
              return;
            }
            onReorderStages(reorderLeadStageWithinGroup(leadStages, leadStageGroups, group, from, si));
            clearDrag();
          }}
          onDragEnd={clearDrag}
          className={`group inline-flex items-center gap-1 px-2.5 py-1 bg-white/80 backdrop-blur border border-white rounded-md text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all select-none ${
            editingStage === stage.value ? "" : "cursor-grab active:cursor-grabbing"
          } ${dragIdx === si ? "opacity-50 border-dashed border-indigo-300" : ""} ${
            overIdx === si && dragIdx !== null && dragIdx !== si ? "ring-2 ring-indigo-400 ring-offset-1 border-indigo-200" : ""
          }`}
        >
          {editingStage !== stage.value && (
            <GripVertical size={12} className="text-gray-400 shrink-0" aria-hidden />
          )}
          {editingStage === stage.value ? (
            <input
              autoFocus
              value={editingStageLabel}
              onChange={(e) => onEditingLabelChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const newLabel = editingStageLabel.trim();
                  if (newLabel) onSaveLabel(stage.value, newLabel);
                  onEditingStageChange(null);
                } else if (e.key === "Escape") {
                  onEditingStageChange(null);
                }
              }}
              onBlur={() => {
                const newLabel = editingStageLabel.trim();
                if (newLabel) onSaveLabel(stage.value, newLabel);
                onEditingStageChange(null);
              }}
              className="w-28 px-1.5 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            />
          ) : (
            <>
              {stage.label}
              <button
                type="button"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  onEditingStageChange(stage.value);
                  onEditingLabelChange(stage.label);
                }}
                className="text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Pencil size={10} />
              </button>
            </>
          )}
          <button
            type="button"
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onDeleteStage(stage.value)}
            className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {groupStages.length === 0 && <span className="text-[11px] text-gray-400 italic">No stages in this group</span>}
    </div>
  );
}

function CountryPipelineStageChips({
  countryName,
  pipeline,
  pipeStages,
  stages,
  onReorderStages,
  editingCsStage,
  editingCsLabel,
  onEditingCsChange,
  onEditingLabelChange,
  onSaveLabel,
  onDeleteStage,
}: {
  countryName: string;
  pipeline: string;
  pipeStages: CountryStageRow[];
  stages: CountryStageRow[];
  onReorderStages: (next: CountryStageRow[]) => void;
  editingCsStage: string | null;
  editingCsLabel: string;
  onEditingCsChange: (v: string | null) => void;
  onEditingLabelChange: (v: string) => void;
  onSaveLabel: (value: string, newLabel: string) => void;
  onDeleteStage: (value: string) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const clearDrag = () => {
    setDragIdx(null);
    setOverIdx(null);
  };
  const order = COUNTRY_PIPELINE_ORDER as readonly string[];

  return (
    <div
      className="flex flex-wrap gap-1.5 min-h-[32px] mb-1"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      {pipeStages.map((stage, si) => {
        const editKey = `${countryName}::${stage.value}`;
        return (
          <span
            key={stage.value}
            draggable={editingCsStage !== editKey}
            title="Drag to reorder"
            onDragStart={(e) => {
              setDragIdx(si);
              e.dataTransfer.setData(
                CS_STAGE_DND_MIME,
                JSON.stringify({ c: countryName, p: pipeline, i: si }),
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              setOverIdx(si);
            }}
            onDragLeave={() => setOverIdx((o) => (o === si ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              let parsed: { c: string; p: string; i: number };
              try {
                parsed = JSON.parse(e.dataTransfer.getData(CS_STAGE_DND_MIME)) as {
                  c: string;
                  p: string;
                  i: number;
                };
              } catch {
                clearDrag();
                return;
              }
              if (parsed.c !== countryName || parsed.p !== pipeline || typeof parsed.i !== "number") {
                clearDrag();
                return;
              }
              const from = parsed.i;
              if (from === si) {
                clearDrag();
                return;
              }
              onReorderStages(reorderCountryStageWithinPipeline(stages, pipeline, order, from, si));
              clearDrag();
            }}
            onDragEnd={clearDrag}
            className={`group inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all select-none ${
              editingCsStage === editKey ? "" : "cursor-grab active:cursor-grabbing"
            } ${dragIdx === si ? "opacity-50 border-dashed border-emerald-300" : ""} ${
              overIdx === si && dragIdx !== null && dragIdx !== si
                ? "ring-2 ring-emerald-400 ring-offset-1 border-emerald-200"
                : ""
            }`}
          >
            {editingCsStage !== editKey && (
              <GripVertical size={12} className="text-gray-400 shrink-0" aria-hidden />
            )}
            {editingCsStage === editKey ? (
              <input
                autoFocus
                value={editingCsLabel}
                onChange={(e) => onEditingLabelChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const newLabel = editingCsLabel.trim();
                    if (newLabel) onSaveLabel(stage.value, newLabel);
                    onEditingCsChange(null);
                  } else if (e.key === "Escape") {
                    onEditingCsChange(null);
                  }
                }}
                onBlur={() => {
                  const newLabel = editingCsLabel.trim();
                  if (newLabel) onSaveLabel(stage.value, newLabel);
                  onEditingCsChange(null);
                }}
                className="w-28 px-1.5 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
            ) : (
              <>
                {stage.label}
                <button
                  type="button"
                  draggable={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    onEditingCsChange(editKey);
                    onEditingLabelChange(stage.label);
                  }}
                  className="text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Pencil size={10} />
                </button>
              </>
            )}
            <button
              type="button"
              draggable={false}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onDeleteStage(stage.value)}
              className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <X size={10} />
            </button>
          </span>
        );
      })}
      {pipeStages.length === 0 && <span className="text-[11px] text-gray-400 italic self-center">No {pipeline} stages</span>}
    </div>
  );
}

// ─── Save Button ─────────────────────────────────────────────────────────────
function SaveBtn({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 ${
        saved
          ? "bg-emerald-600 text-white shadow-emerald-600/25 hover:bg-emerald-700"
          : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md hover:shadow-indigo-500/20 disabled:opacity-55 disabled:shadow-none"
      }`}
    >
      {saved ? <CheckCircle size={16} strokeWidth={2.25} /> : <Save size={16} strokeWidth={2.25} />}
      {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
    </button>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40 transition-shadow duration-300 hover:shadow-md hover:shadow-slate-200/50">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-2xl" aria-hidden />
      <div className="p-6 sm:p-7 pl-6 sm:pl-8">
        <div className="mb-6 border-b border-slate-100 pb-5">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
          {description && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Input Field ─────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, type = "text", hint, disabled,
}: {
  label: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-slate-50/40 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      />
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { data: session } = useSession();
  const refreshBranding = useBrandingRefresh();
  const [tab, setTab] = useState<TabId | "">("");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uniCardSavingKey, setUniCardSavingKey] = useState<string | null>(null);
  const [uniCardSavedKey, setUniCardSavedKey] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editingStageLabel, setEditingStageLabel] = useState("");
  const [expandedCountryStage, setExpandedCountryStage] = useState<string | null>(null);
  const [editingCsStage, setEditingCsStage] = useState<string | null>(null); // "country::value"
  const [editingCsLabel, setEditingCsLabel] = useState("");
  const [plGroupDropTarget, setPlGroupDropTarget] = useState<string | null>(null);

  // Logo upload
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // QR upload
  const [qrPreview, setQrPreview] = useState<string>("");
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  // Checklists
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedChecklist, setSelectedChecklist] = useState<Checklist | null>(null);
  const [clSaving, setClSaving] = useState(false);
  const [clSaved, setClSaved] = useState(false);
  const [uniDocBusy, setUniDocBusy] = useState<string | null>(null);

  // ── Load settings ──
  useEffect(() => {
    fetch("/api/settings/app")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.companyName) {
          // Normalize countries: handle old string[] format from DB
          if (Array.isArray(d.countries)) {
            d.countries = d.countries.map((c: string | { name: string; universities?: unknown[] }) =>
              typeof c === "string"
                ? { name: c, universities: [] }
                : { name: c.name, universities: normalizeUniversitiesArray(c.universities) }
            );
          }
          setSettings((prev) => ({
            ...prev,
            ...d,
            dashboardWidgets: mergeDashboardWidgetsFromApi(d.dashboardWidgets),
            dashboardWidgetOrder: mergeDashboardWidgetOrderFromApi(d.dashboardWidgetOrder),
          }));
          if (d.logoPath) setLogoPreview(d.logoPath);
          if (d.paymentQrPath) setQrPreview(d.paymentQrPath);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── Load checklists when tab changes ──
  useEffect(() => {
    if (tab !== "checklists") return;
    fetch("/api/checklists").then((r) => r.json()).then((d) => setChecklists(Array.isArray(d) ? d : []));
  }, [tab]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const countriesPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const putCountriesNow = useCallback(async (countries: AppSettings["countries"]) => {
    if (countriesPersistTimerRef.current) {
      clearTimeout(countriesPersistTimerRef.current);
      countriesPersistTimerRef.current = null;
    }
    try {
      const res = await fetch("/api/settings/app", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countries }),
      });
      if (!res.ok) console.error("Destination countries/universities autosave failed:", res.status);
    } catch (e) {
      console.error("Destination countries autosave:", e);
    }
  }, []);

  const schedulePersistCountries = useCallback(() => {
    if (countriesPersistTimerRef.current) clearTimeout(countriesPersistTimerRef.current);
    countriesPersistTimerRef.current = setTimeout(() => {
      countriesPersistTimerRef.current = null;
      void putCountriesNow(settingsRef.current.countries);
    }, 450);
  }, [putCountriesNow]);

  useEffect(() => {
    return () => {
      if (countriesPersistTimerRef.current) clearTimeout(countriesPersistTimerRef.current);
    };
  }, []);

  const set = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
      if (key === "countries") {
        schedulePersistCountries();
      }
    },
    [schedulePersistCountries]
  );

  const b2bNamesPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePersistB2bNames = useCallback((names: string[]) => {
    if (b2bNamesPersistTimerRef.current) clearTimeout(b2bNamesPersistTimerRef.current);
    b2bNamesPersistTimerRef.current = setTimeout(() => {
      b2bNamesPersistTimerRef.current = null;
      fetch("/api/settings/app", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ b2bNames: names }),
      })
        .then((res) => {
          if (!res.ok) console.error("B2B names autosave failed:", res.status);
        })
        .catch((e) => console.error("B2B names autosave:", e));
    }, 450);
  }, []);

  useEffect(() => {
    return () => {
      if (b2bNamesPersistTimerRef.current) clearTimeout(b2bNamesPersistTimerRef.current);
    };
  }, []);

  const appendB2bName = useCallback(
    (raw: string) => {
      const val = raw.trim();
      if (!val) return;
      setSettings((prev) => {
        const cur = prev.b2bNames || [];
        if (cur.includes(val)) return prev;
        const next = [...cur, val];
        schedulePersistB2bNames(next);
        return { ...prev, b2bNames: next };
      });
      setSaved(false);
    },
    [schedulePersistB2bNames]
  );

  const updateCountryUniversities = useCallback(
    (countryIndex: number, mutator: (list: UniversityEntry[]) => UniversityEntry[]) => {
      setSettings((prev) => {
        const countries = [...prev.countries];
        const row = countries[countryIndex];
        if (!row) return prev;
        countries[countryIndex] = {
          ...row,
          universities: mutator([...row.universities]),
        };
        return { ...prev, countries };
      });
      setSaved(false);
      schedulePersistCountries();
    },
    [schedulePersistCountries]
  );

  const appendUniversityDocuments = useCallback(
    async (ci: number, ui: number, files: FileList | null) => {
      if (!files?.length) return;
      setUniDocBusy(`${ci}-${ui}`);
      try {
        const added: UniversityAttachment[] = [];
        for (const f of Array.from(files)) {
          const up = await uploadUniversitySettingsDoc(f);
          if (up) added.push(up);
        }
        if (added.length === 0) return;
        updateCountryUniversities(ci, (list) => {
          const next = [...list];
          const u = next[ui];
          if (!u) return list;
          next[ui] = { ...u, attachments: [...u.attachments, ...added] };
          return next;
        });
      } finally {
        setUniDocBusy(null);
      }
    },
    [updateCountryUniversities]
  );

  const addUniversityWithDetails = useCallback(
    async (ci: number) => {
      const nameEl = document.getElementById(`new-uni-name-${ci}`) as HTMLInputElement | null;
      const reqEl = document.getElementById(`new-uni-req-${ci}`) as HTMLTextAreaElement | null;
      const courseUrlEl = document.getElementById(`new-uni-course-url-${ci}`) as HTMLInputElement | null;
      const engUrlEl = document.getElementById(`new-uni-eng-url-${ci}`) as HTMLInputElement | null;
      const fileEl = document.getElementById(`new-uni-files-${ci}`) as HTMLInputElement | null;
      const name = nameEl?.value?.trim() ?? "";
      if (!name) return;
      setUniDocBusy(`new-${ci}`);
      try {
        const attachments: UniversityAttachment[] = [];
        if (fileEl?.files?.length) {
          for (const f of Array.from(fileEl.files)) {
            const up = await uploadUniversitySettingsDoc(f);
            if (up) attachments.push(up);
          }
        }
        const requirements = reqEl?.value ?? "";
        const findCourseUrl = courseUrlEl?.value?.trim() ?? "";
        const englishRequirementsUrl = engUrlEl?.value?.trim() ?? "";
        let nextCountries: AppSettings["countries"] | null = null;
        setSettings((prev) => {
          const countries = [...prev.countries];
          const row = countries[ci];
          if (!row || row.universities.some((u) => u.name === name)) return prev;
          countries[ci] = {
            ...row,
            universities: [
              ...row.universities,
              { name, requirements, attachments, findCourseUrl, englishRequirementsUrl },
            ],
          };
          nextCountries = countries;
          return { ...prev, countries };
        });
        setSaved(false);
        if (nextCountries) {
          await putCountriesNow(nextCountries);
        }
        if (nameEl) nameEl.value = "";
        if (reqEl) reqEl.value = "";
        if (courseUrlEl) courseUrlEl.value = "";
        if (engUrlEl) engUrlEl.value = "";
        if (fileEl) fileEl.value = "";
      } finally {
        setUniDocBusy(null);
      }
    },
    [putCountriesNow]
  );

  // ── Save app settings ──
  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/app", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        refreshBranding();
        notifyAppSettingsChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to save settings: ${err.error || res.status}`);
      }
    } catch (e) {
      alert(`Network error saving settings: ${e}`);
    } finally { setSaving(false); }
  };

  /** Persist destination countries / universities (partial PUT). One row per card for UX. */
  const saveCountriesOnly = useCallback(
    async (cardKey: string) => {
      if (countriesPersistTimerRef.current) {
        clearTimeout(countriesPersistTimerRef.current);
        countriesPersistTimerRef.current = null;
      }
      setUniCardSavingKey(cardKey);
      setUniCardSavedKey(null);
      try {
        const res = await fetch("/api/settings/app", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ countries: settings.countries }),
        });
        if (res.ok) {
          setUniCardSavedKey(cardKey);
          setTimeout(() => {
            setUniCardSavedKey((k) => (k === cardKey ? null : k));
          }, 2500);
        } else {
          const err = await res.json().catch(() => ({}));
          alert(`Failed to update: ${err.error || res.status}`);
        }
      } catch (e) {
        alert(`Network error: ${e}`);
      } finally {
        setUniCardSavingKey(null);
      }
    },
    [settings.countries]
  );

  // ── Logo upload ──
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const formData = new FormData();
    formData.append("logo", file);
    try {
      const res = await fetch("/api/settings/logo", { method: "POST", body: formData });
      const d = await res.json();
      if (d.logoPath) { setLogoPreview(d.logoPath); set("logoPath", d.logoPath); refreshBranding(); }
    } finally { setUploadingLogo(false); }
  };

  // ── QR upload ──
  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    const formData = new FormData();
    formData.append("qr", file);
    try {
      const res = await fetch("/api/settings/qr", { method: "POST", body: formData });
      const d = await res.json();
      if (d.paymentQrPath) { setQrPreview(d.paymentQrPath); set("paymentQrPath", d.paymentQrPath); refreshBranding(); }
    } finally { setUploadingQr(false); }
  };

  // ── Checklist helpers ──
  const loadCountry = async (country: string) => {
    setSelectedCountry(country);
    const res = await fetch(`/api/checklists?country=${country}`);
    const data = await res.json();
    setSelectedChecklist({ country, documents: data?.documents || [] });
  };

  const addDoc = () => {
    if (!selectedChecklist) return;
    setSelectedChecklist({ ...selectedChecklist, documents: [...selectedChecklist.documents, { name: "", isRequired: true }] });
  };

  const removeDoc = (i: number) => {
    if (!selectedChecklist) return;
    setSelectedChecklist({ ...selectedChecklist, documents: selectedChecklist.documents.filter((_, idx) => idx !== i) });
  };

  const updateDoc = (i: number, field: keyof ChecklistItem, value: string | boolean) => {
    if (!selectedChecklist) return;
    const docs = [...selectedChecklist.documents];
    docs[i] = { ...docs[i], [field]: value };
    setSelectedChecklist({ ...selectedChecklist, documents: docs });
  };

  const saveChecklist = async () => {
    if (!selectedChecklist) return;
    setClSaving(true);
    await fetch("/api/checklists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selectedChecklist) });
    setClSaving(false); setClSaved(true);
    setTimeout(() => setClSaved(false), 2000);
    const res = await fetch("/api/checklists");
    setChecklists(Array.isArray(await res.json()) ? await (await fetch("/api/checklists")).json() : []);
  };

  // ── Access guard ──
  const userPerms = (session?.user?.permissions ?? []) as string[];
  const isSuperAdmin = session?.user?.role === "super_admin";
  const hasSettingsAccess = isSuperAdmin || userPerms.includes("settings");

  // Determine which tabs this user can see
  const hasAnySubPerm = userPerms.some((p) => p.startsWith("settings:"));
  const visibleTabs = isSuperAdmin || !hasAnySubPerm
    ? TABS
    : TABS.filter((t) => userPerms.includes(`settings:${t.id}`));

  if (!hasSettingsAccess) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white px-8 py-14 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-200/80">
          <Lock size={24} className="text-slate-500" strokeWidth={2} />
        </div>
        <div>
          <p className="text-base font-semibold text-slate-900">Access restricted</p>
          <p className="mt-1.5 text-sm text-slate-500">You don&apos;t have permission to open system settings.</p>
        </div>
      </div>
    );
  }

  // Ensure current tab is valid - default to first visible tab
  const activeTab = (visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]?.id || "branding") as TabId;

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm font-medium text-slate-600">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-100/80 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-violet-100/60 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25">
              <Settings size={22} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">System settings</h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
                Branding, CRM lists, modules, email, and team options—organized in one place.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-100/80 p-1.5 shadow-inner">
        <nav className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`group flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                activeTab === id
                  ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/90"
                  : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  activeTab === id ? "bg-indigo-50 text-indigo-600" : "bg-transparent text-slate-400 group-hover:text-slate-600"
                }`}
              >
                <Icon size={16} strokeWidth={2} />
              </span>
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab: Branding ── */}
      {activeTab === "branding" && (
        <div className="space-y-6">
          <SectionCard title="Brand Identity" description="Configure your company name, logo, and visual identity">
            <div className="space-y-5">
              {/* Logo Upload */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Company Logo</p>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50 overflow-hidden">
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <ImageIcon size={24} className="text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-600 mb-2">Upload your company logo (PNG, JPG, SVG, WebP)</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="flex items-center gap-2 px-3 py-2 border border-gray-300 hover:border-gray-500 rounded-lg text-xs font-medium text-gray-700 transition-colors"
                      >
                        <Upload size={12} />
                        {uploadingLogo ? "Uploading…" : "Upload Logo"}
                      </button>
                      {logoPreview && (
                        <button
                          onClick={() => { setLogoPreview(""); set("logoPath", ""); }}
                          className="px-3 py-2 border border-red-200 hover:border-red-400 text-red-500 hover:text-red-700 rounded-lg text-xs font-medium transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Company Name"
                  value={settings.companyName}
                  onChange={(v) => set("companyName", v)}
                  placeholder="e.g. Education Tree Global"
                  hint="Shown in the sidebar and across the app"
                />
                <Field
                  label="Short Code / Abbreviation"
                  value={settings.shortCode}
                  onChange={(v) => set("shortCode", v.toUpperCase().slice(0, 5))}
                  placeholder="e.g. ETG"
                  hint="Up to 5 characters, shown in the sidebar badge"
                />
              </div>

              <Field
                label="Tagline / Slogan"
                value={settings.tagline}
                onChange={(v) => set("tagline", v)}
                placeholder="e.g. Your global education partner"
                hint="Shown on login page and marketing materials"
              />
            </div>
          </SectionCard>

          <SectionCard title="Brand Color" description="Set the primary brand color used throughout the interface">
            <div className="flex items-center gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Primary Brand Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.brandColor}
                    onChange={(e) => set("brandColor", e.target.value)}
                    className="w-12 h-12 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                  />
                  <div>
                    <p className="text-sm font-mono font-medium text-gray-900">{settings.brandColor.toUpperCase()}</p>
                    <p className="text-xs text-gray-500">Click to change color</p>
                  </div>
                  <div
                    className="w-32 h-12 rounded-lg flex items-center justify-center text-white text-xs font-semibold shadow-sm"
                    style={{ backgroundColor: settings.brandColor }}
                  >
                    Preview
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Online Payment QR Code" description="Upload the QR code displayed to users when they select Online as the exam payment method">
            <div className="flex items-start gap-6">
              <div className="shrink-0">
                <div className="w-36 h-36 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50 overflow-hidden">
                  {qrPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrPreview} alt="Payment QR" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-gray-300">
                      <ImageIcon size={28} />
                      <span className="text-[10px]">No QR</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-1">Upload your company&apos;s payment QR code (PNG, JPG, WebP).</p>
                <p className="text-xs text-gray-400 mb-3">This image is shown in the Add Lead form when &quot;Online&quot; is selected as the exam payment method.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => qrInputRef.current?.click()}
                    disabled={uploadingQr}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-300 hover:border-gray-500 rounded-lg text-xs font-medium text-gray-700 transition-colors"
                  >
                    <Upload size={12} />
                    {uploadingQr ? "Uploading…" : "Upload QR Code"}
                  </button>
                  {qrPreview && (
                    <button
                      onClick={() => { setQrPreview(""); set("paymentQrPath", ""); }}
                      className="px-3 py-2 border border-red-200 hover:border-red-400 text-red-500 hover:text-red-700 rounded-lg text-xs font-medium transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input ref={qrInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={handleQrUpload} />
              </div>
            </div>
          </SectionCard>

          <div className="mt-2 flex justify-end rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm">
            <SaveBtn saving={saving} saved={saved} onClick={saveSettings} />
          </div>
        </div>
      )}

      {/* ── Tab: Contact Info ── */}
      {activeTab === "contact" && (
        <div className="space-y-6">
          <SectionCard title="Contact Information" description="Business contact details displayed in the system">
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600" aria-hidden>
                      <Phone size={15} strokeWidth={1.75} />
                    </span>
                    Phone number
                  </label>
                  <input
                    value={settings.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="+1 234 567 8900"
                    autoComplete="tel"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 bg-white shadow-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10 transition-shadow"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600" aria-hidden>
                      <Mail size={15} strokeWidth={1.75} />
                    </span>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="contact@yourcompany.com"
                    autoComplete="email"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 bg-white shadow-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10 transition-shadow"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600" aria-hidden>
                    <Globe size={15} strokeWidth={1.75} />
                  </span>
                  Website URL
                </label>
                <input
                  value={settings.website}
                  onChange={(e) => set("website", e.target.value)}
                  placeholder="https://www.yourcompany.com"
                  autoComplete="url"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 bg-white shadow-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10 transition-shadow"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600" aria-hidden>
                    <MapPin size={15} strokeWidth={1.75} />
                  </span>
                  Office address
                </label>
                <textarea
                  value={settings.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="123 Main Street, City, Country"
                  rows={4}
                  autoComplete="street-address"
                  className="w-full min-h-[6.5rem] px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 bg-white shadow-sm leading-relaxed resize-y focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10 transition-shadow"
                />
              </div>
            </div>
          </SectionCard>
          <div className="mt-2 flex justify-end rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm">
            <SaveBtn saving={saving} saved={saved} onClick={saveSettings} />
          </div>
        </div>
      )}

      {/* ── Tab: Lead Configuration ── */}
      {activeTab === "leads" && (
        <div className="space-y-6">
          {/* Section Header */}
          <div className="flex items-center gap-3 pb-2">
            <div className="p-2 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-lg">
              <Target size={16} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Lead Configuration</h2>
              <p className="text-xs text-gray-500 mt-0.5">Manage standings, sources, stages, and statuses - changes apply across all departments instantly</p>
            </div>
          </div>

          {/* ── Lead Standings ── */}
          <SectionCard title="Lead Standings" description="Categorize leads by temperature / priority. These labels appear everywhere leads are displayed. Drag chips to set dropdown order.">
            <div className="space-y-3">
              <DraggableChipList
                items={settings.leadStandings}
                onChange={(next) => set("leadStandings", next)}
                onRemoveItem={(item) => set("leadStandings", settings.leadStandings.filter((i) => i !== item))}
                emptyLabel="No standings defined"
                accent="slate"
                leading={(item) => (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${standingTemperatureDot(item)}`} />
                )}
                formatLabel={(item) => item.replace(/_/g, " ")}
                labelClassName="capitalize"
              />
              <div className="flex gap-2">
                <input id="standingInput"
                  placeholder="e.g. cold, lukewarm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, "_");
                      if (val && !settings.leadStandings.includes(val)) {
                        set("leadStandings", [...settings.leadStandings, val]);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400"
                />
                <button type="button" onClick={() => {
                  const input = document.getElementById("standingInput") as HTMLInputElement;
                  const val = input.value.trim().toLowerCase().replace(/\s+/g, "_");
                  if (val && !settings.leadStandings.includes(val)) {
                    set("leadStandings", [...settings.leadStandings, val]);
                    input.value = "";
                  }
                }} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                  <Plus size={13} /> Add
                </button>
              </div>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <Flame size={10} /> Standings help prioritize follow-ups. Changes reflect in lead tables, forms, and detail views.
              </p>
            </div>
          </SectionCard>

          {/* ── Lead Sources ── */}
          <SectionCard title="Lead Sources" description="Where your leads come from. Shown in dropdowns when creating or editing leads. Drag to reorder.">
            <div className="space-y-3">
              <DraggableChipList
                items={settings.leadSources}
                onChange={(next) => set("leadSources", next)}
                onRemoveItem={(item) => set("leadSources", settings.leadSources.filter((i) => i !== item))}
                emptyLabel="No sources defined"
                accent="blue"
              />
              <div className="flex gap-2">
                <input id="sourceInput"
                  placeholder="e.g. LinkedIn, TikTok, Billboard"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !settings.leadSources.includes(val)) {
                        set("leadSources", [...settings.leadSources, val]);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400"
                />
                <button type="button" onClick={() => {
                  const input = document.getElementById("sourceInput") as HTMLInputElement;
                  const val = input.value.trim();
                  if (val && !settings.leadSources.includes(val)) {
                    set("leadSources", [...settings.leadSources, val]);
                    input.value = "";
                  }
                }} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          </SectionCard>

          {/* ── Front Desk Statuses ── */}
          <SectionCard title="Front Desk Statuses" description="Workflow status labels for every lead (Front Desk, counsellors, telecallers, and pipeline teams). The same list is used on the leads table, lead detail, filters, and reports. Drag to reorder.">
            <div className="space-y-3">
              <DraggableChipList
                items={settings.fdStatuses}
                onChange={(next) => set("fdStatuses", next)}
                onRemoveItem={(item) => set("fdStatuses", settings.fdStatuses.filter((i) => i !== item))}
                emptyLabel="No statuses defined"
                accent="purple"
              />
              <div className="flex gap-2">
                <input id="fdStatusInput"
                  placeholder="e.g. Follow Up Required, Callback Scheduled"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !settings.fdStatuses.includes(val)) {
                        set("fdStatuses", [...settings.fdStatuses, val]);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400"
                />
                <button type="button" onClick={() => {
                  const input = document.getElementById("fdStatusInput") as HTMLInputElement;
                  const val = input.value.trim();
                  if (val && !settings.fdStatuses.includes(val)) {
                    set("fdStatuses", [...settings.fdStatuses, val]);
                    input.value = "";
                  }
                }} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                  <Plus size={13} /> Add
                </button>
              </div>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <Zap size={10} /> {settings.fdStatuses.length} statuses configured. Saved list is used everywhere leads show workflow status.
              </p>
            </div>
          </SectionCard>

          {/* ── B2B Agent Names ── */}
          <SectionCard title="B2B Agent Names" description="Pre-defined B2B agent/sub-agent names. These will appear as autocomplete suggestions when adding admission details. Drag to reorder.">
            <div className="space-y-3">
              <DraggableChipList
                items={settings.b2bNames || []}
                onChange={(next) => {
                  setSettings((prev) => ({ ...prev, b2bNames: next }));
                  setSaved(false);
                  schedulePersistB2bNames(next);
                }}
                onRemoveItem={(item) => {
                  setSettings((prev) => {
                    const next = (prev.b2bNames || []).filter((i) => i !== item);
                    schedulePersistB2bNames(next);
                    return { ...prev, b2bNames: next };
                  });
                  setSaved(false);
                }}
                emptyLabel="No B2B names defined"
                accent="teal"
              />
              <div className="flex gap-2">
                <input id="b2bNameInput"
                  placeholder="e.g. ABC Education, XYZ Consultancy"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value;
                      appendB2bName(val);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400"
                />
                <button type="button" onClick={() => {
                  const input = document.getElementById("b2bNameInput") as HTMLInputElement;
                  appendB2bName(input.value);
                  input.value = "";
                }} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                  <Plus size={13} /> Add
                </button>
              </div>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <Zap size={10} /> {(settings.b2bNames || []).length} names configured. Saved automatically; they appear as suggestions in admission details, commission, and anywhere the B2B name is used.
              </p>
            </div>
          </SectionCard>

          {/* ── Remark Options ── */}
          <SectionCard title="Remark Options" description="Pre-defined remarks for the student remarks column. These will appear as dropdown options in the students list. Drag chips to change order (top-left = first in the dropdown).">
            <div className="space-y-3">
              <DraggableChipList
                items={settings.remarkOptions || []}
                onChange={(next) => set("remarkOptions", next)}
                onRemoveItem={(item) =>
                  set("remarkOptions", (settings.remarkOptions || []).filter((i) => i !== item))
                }
                emptyLabel="No remark options defined"
                accent="indigo"
              />
              <div className="flex gap-2">
                <input id="remarkOptionInput"
                  placeholder="e.g. Additional Documents Requested"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !(settings.remarkOptions || []).includes(val)) {
                        set("remarkOptions", [...(settings.remarkOptions || []), val]);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400"
                />
                <button type="button" onClick={() => {
                  const input = document.getElementById("remarkOptionInput") as HTMLInputElement;
                  const val = input.value.trim();
                  if (val && !(settings.remarkOptions || []).includes(val)) {
                    set("remarkOptions", [...(settings.remarkOptions || []), val]);
                    input.value = "";
                  }
                }} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                  <Plus size={13} /> Add
                </button>
              </div>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <Zap size={10} /> {(settings.remarkOptions || []).length} global options. Shown for every pipeline after department-specific items. Save settings after reordering.
              </p>
            </div>
          </SectionCard>

          {/* ── Department remark lists (admission card / module tables) ── */}
          <SectionCard
            title="Remarks by department"
            description="Application, Admission (Offer / GS / COE), and Visa teams each maintain their own list. On student admission cards, the active pipeline picks which department list is merged first with the global remark options above. Drag chips to set option order; save settings to persist."
          >
            <div className="space-y-8">
              {(
                [
                  { key: "remarkOptionsApplication" as const, title: "Application pipeline", inputId: "remarkDeptAppInput" },
                  { key: "remarkOptionsAdmission" as const, title: "Admission pipeline (Offer, GS, COE)", inputId: "remarkDeptAdmissionInput" },
                  { key: "remarkOptionsVisa" as const, title: "Visa pipeline", inputId: "remarkDeptVisaInput" },
                ] as const
              ).map(({ key, title, inputId }) => (
                <div key={key} className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-800">{title}</h4>
                  <DraggableChipList
                    items={settings[key] || []}
                    onChange={(next) => set(key, next)}
                    onRemoveItem={(item) => set(key, (settings[key] || []).filter((i) => i !== item))}
                    emptyLabel="No options - save after adding, or they inherit from global on next load"
                    accent="violet"
                  />
                  <div className="flex gap-2">
                    <input
                      id={inputId}
                      placeholder="Add remark"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val && !(settings[key] || []).includes(val)) {
                            set(key, [...(settings[key] || []), val]);
                            (e.target as HTMLInputElement).value = "";
                          }
                        }
                      }}
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all placeholder-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(inputId) as HTMLInputElement;
                        const val = input?.value?.trim() ?? "";
                        if (val && !(settings[key] || []).includes(val)) {
                          set(key, [...(settings[key] || []), val]);
                          input.value = "";
                        }
                      }}
                      className="px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Plus size={13} /> Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ── Pipeline Stages ── */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Layers size={14} className="text-indigo-500" />
                    Pipeline Stages
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Organize your lead pipeline into groups and stages. Each stage belongs to a group.</p>
                </div>
                <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-full">
                  {settings.leadStages.length} stages · {settings.leadStageGroups.length} groups
                </span>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {/* Stage Groups */}
              {settings.leadStageGroups.map((group) => {
                const groupStages = settings.leadStages.filter(s => s.group === group);
                const groupColors: Record<string, string> = {
                  Application: "border-amber-200 bg-amber-50",
                  Offer: "border-blue-200 bg-blue-50",
                  GS: "border-purple-200 bg-purple-50",
                  COE: "border-emerald-200 bg-emerald-50",
                  Visa: "border-teal-200 bg-teal-50",
                };
                const dotColors: Record<string, string> = {
                  Application: "bg-amber-400",
                  Offer: "bg-blue-400",
                  GS: "bg-purple-400",
                  COE: "bg-emerald-400",
                  Visa: "bg-teal-400",
                };
                const borderColor = groupColors[group] || "border-gray-200 bg-gray-50";
                const dotColor = dotColors[group] || "bg-gray-400";

                return (
                  <div
                    key={group}
                    className={`border rounded-xl overflow-hidden ${borderColor} ${
                      plGroupDropTarget === group ? "ring-2 ring-indigo-400 ring-offset-1" : ""
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (Array.from(e.dataTransfer.types).includes(PL_GROUP_DND_MIME)) {
                        e.dataTransfer.dropEffect = "move";
                        setPlGroupDropTarget(group);
                      }
                    }}
                    onDragLeave={(e) => {
                      const rel = e.relatedTarget as Node | null;
                      if (rel && e.currentTarget.contains(rel)) return;
                      setPlGroupDropTarget((g) => (g === group ? null : g));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setPlGroupDropTarget(null);
                      const raw = e.dataTransfer.getData(PL_GROUP_DND_MIME);
                      const from = parseInt(raw, 10);
                      setSettings((prev) => {
                        const to = prev.leadStageGroups.indexOf(group);
                        if (Number.isNaN(from) || from < 0 || from >= prev.leadStageGroups.length || from === to) {
                          return prev;
                        }
                        const res = reorderLeadStageGroupsOrder(
                          prev.leadStageGroups,
                          prev.leadStages,
                          from,
                          to,
                        );
                        return { ...prev, leadStageGroups: res.leadStageGroups, leadStages: res.leadStages };
                      });
                      setSaved(false);
                    }}
                  >
                    <div className="flex items-center justify-between px-4 py-3 gap-2">
                      <div
                        className="flex items-center gap-2 min-w-0 flex-1 cursor-grab active:cursor-grabbing select-none"
                        draggable
                        title="Drag to reorder group"
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            PL_GROUP_DND_MIME,
                            String(settings.leadStageGroups.indexOf(group)),
                          );
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setPlGroupDropTarget(null)}
                      >
                        <GripVertical size={14} className="text-gray-400 shrink-0" aria-hidden />
                        <span className={`w-3 h-3 rounded-full shrink-0 ${dotColor}`} />
                        <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide truncate">{group}</h4>
                        <span className="text-[10px] text-gray-400 font-medium shrink-0">{groupStages.length} stages</span>
                      </div>
                      <button
                        type="button"
                        draggable={false}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          set("leadStageGroups", settings.leadStageGroups.filter((g) => g !== group));
                          set("leadStages", settings.leadStages.filter((s) => s.group !== group));
                        }}
                        className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-white/60 shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="px-4 pb-3">
                      <LeadStageChipsInGroup
                        group={group}
                        groupStages={groupStages}
                        leadStages={settings.leadStages}
                        leadStageGroups={settings.leadStageGroups}
                        onReorderStages={(next) => set("leadStages", next)}
                        editingStage={editingStage}
                        editingStageLabel={editingStageLabel}
                        onEditingStageChange={setEditingStage}
                        onEditingLabelChange={setEditingStageLabel}
                        onSaveLabel={(value, newLabel) =>
                          set(
                            "leadStages",
                            settings.leadStages.map((s) =>
                              s.value === value ? { ...s, label: newLabel } : s,
                            ),
                          )
                        }
                        onDeleteStage={(value) =>
                          set(
                            "leadStages",
                            settings.leadStages.filter((s) => s.value !== value),
                          )
                        }
                      />
                      <div className="flex gap-2">
                        <input id={`stageInput-${group}`}
                          placeholder={`Add stage to ${group}...`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const label = (e.target as HTMLInputElement).value.trim();
                              const value = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                              if (label && value && !settings.leadStages.some(s => s.value === value)) {
                                set("leadStages", [...settings.leadStages, { value, label, group }]);
                                (e.target as HTMLInputElement).value = "";
                              }
                            }
                          }}
                          className="flex-1 px-3 py-2 border border-white/60 bg-white/60 backdrop-blur rounded-lg text-xs focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all placeholder-gray-400"
                        />
                        <button type="button" onClick={() => {
                          const input = document.getElementById(`stageInput-${group}`) as HTMLInputElement;
                          const label = input.value.trim();
                          const value = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                          if (label && value && !settings.leadStages.some(s => s.value === value)) {
                            set("leadStages", [...settings.leadStages, { value, label, group }]);
                            input.value = "";
                          }
                        }} className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 border border-gray-200 shadow-sm">
                          <Plus size={11} /> Add
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add New Group */}
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch size={13} className="text-gray-400" />
                  <p className="text-xs font-semibold text-gray-500">Add New Stage Group</p>
                </div>
                <div className="flex gap-2">
                  <input id="groupInput"
                    placeholder="e.g. Pre-CAS, Post-Arrival"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !settings.leadStageGroups.includes(val)) {
                          set("leadStageGroups", [...settings.leadStageGroups, val]);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                    className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400"
                  />
                  <button type="button" onClick={() => {
                    const input = document.getElementById("groupInput") as HTMLInputElement;
                    const val = input.value.trim();
                    if (val && !settings.leadStageGroups.includes(val)) {
                      set("leadStageGroups", [...settings.leadStageGroups, val]);
                      input.value = "";
                    }
                  }} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                    <Plus size={13} /> Add Group
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Country-Specific Stages ── */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Globe size={14} className="text-emerald-500" />
                    Country-Specific Stages
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Override the pipeline stages for specific destination countries. When set, students applying to that country will see these stages instead of the global ones.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded-full">
                  {Object.keys(settings.countryStages || {}).length} countries configured
                </span>
              </div>
            </div>
            <div className="p-6 space-y-3">
              {/* Countries that have custom stages */}
              {settings.countries.map((c) => {
                const countryName = c.name;
                const stages = (settings.countryStages || {})[countryName] || [];
                const isExpanded = expandedCountryStage === countryName;
                const pipelineColors: Record<string, string> = {
                  Offer: "bg-blue-50 text-blue-700 border-blue-200",
                  COE:   "bg-emerald-50 text-emerald-700 border-emerald-200",
                  Visa:  "bg-teal-50 text-teal-700 border-teal-200",
                };
                return (
                  <div key={countryName} className={`border rounded-xl overflow-hidden transition-all ${stages.length > 0 ? "border-emerald-200" : "border-gray-200"}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedCountryStage(isExpanded ? null : countryName)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/70 hover:bg-gray-100/70 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <Globe size={13} className={stages.length > 0 ? "text-emerald-500" : "text-gray-400"} />
                        <span className="text-sm font-semibold text-gray-800">{countryName}</span>
                        {stages.length > 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">{stages.length} stages</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-400 text-[10px] font-semibold rounded-full">Using global stages</span>
                        )}
                      </div>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-3 border-t border-gray-100">
                        {/* Stage list grouped by pipeline */}
                        {["Offer", "COE", "Visa"].map((pipeline) => {
                          const pipeStages = stages.filter(s => s.pipeline === pipeline);
                          return (
                            <div key={pipeline} className="mb-3">
                              <p className={`text-[10px] font-black uppercase tracking-widest mb-1.5 px-2 py-0.5 rounded w-fit border ${pipelineColors[pipeline] || "bg-gray-100 text-gray-500 border-gray-200"}`}>{pipeline}</p>
                              <CountryPipelineStageChips
                                countryName={countryName}
                                pipeline={pipeline}
                                pipeStages={pipeStages}
                                stages={stages}
                                onReorderStages={(next) =>
                                  set("countryStages", {
                                    ...(settings.countryStages || {}),
                                    [countryName]: next,
                                  })
                                }
                                editingCsStage={editingCsStage}
                                editingCsLabel={editingCsLabel}
                                onEditingCsChange={setEditingCsStage}
                                onEditingLabelChange={setEditingCsLabel}
                                onSaveLabel={(value, newLabel) =>
                                  set("countryStages", {
                                    ...(settings.countryStages || {}),
                                    [countryName]: stages.map((s) =>
                                      s.value === value ? { ...s, label: newLabel } : s,
                                    ),
                                  })
                                }
                                onDeleteStage={(value) =>
                                  set("countryStages", {
                                    ...(settings.countryStages || {}),
                                    [countryName]: stages.filter((s) => s.value !== value),
                                  })
                                }
                              />
                              {/* Add stage to this pipeline */}
                              <div className="flex gap-2 mt-1">
                                <input
                                  id={`cs-${countryName}-${pipeline}`}
                                  placeholder={`Add ${pipeline} stage...`}
                                  className="flex-1 px-3 py-1.5 border border-gray-200 bg-gray-50 rounded-lg text-xs focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 focus:bg-white transition-all placeholder-gray-400"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const label = (e.target as HTMLInputElement).value.trim();
                                      const value = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                                      if (label && value && !stages.some(s => s.value === value)) {
                                        const updated = [...stages, { value, label, pipeline }];
                                        set("countryStages", { ...(settings.countryStages || {}), [countryName]: updated });
                                        (e.target as HTMLInputElement).value = "";
                                      }
                                    }
                                  }}
                                />
                                <button type="button" onClick={() => {
                                  const input = document.getElementById(`cs-${countryName}-${pipeline}`) as HTMLInputElement;
                                  const label = input?.value.trim();
                                  const value = label?.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                                  if (label && value && !stages.some(s => s.value === value)) {
                                    const updated = [...stages, { value, label, pipeline }];
                                    set("countryStages", { ...(settings.countryStages || {}), [countryName]: updated });
                                    if (input) input.value = "";
                                  }
                                }} className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 border border-gray-200 shadow-sm">
                                  <Plus size={11} /> Add
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {/* Clear all stages for this country */}
                        {stages.length > 0 && (
                          <button type="button" onClick={() => {
                            const updated = { ...(settings.countryStages || {}) };
                            delete updated[countryName];
                            set("countryStages", updated);
                          }} className="mt-1 text-[11px] text-red-400 hover:text-red-600 transition-colors flex items-center gap-1">
                            <Trash2 size={10} /> Reset to global stages
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex justify-end rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm">
            <SaveBtn saving={saving} saved={saved} onClick={saveSettings} />
          </div>
        </div>
      )}

      {/* ── Tab: Countries & Services ── */}
      {activeTab === "lists" && (
        <div className="space-y-5">
          {/* ── Destination Countries with Universities ── */}
          <SectionCard
            title="Destination Countries & Universities"
            description="Each university can include entry requirements, optional Find course / English requirements URLs (buttons open in a new tab), and reference documents (PDF, Word, Excel, images). Save settings after changes. Universities still appear as choices in lead and student forms."
          >
            <div className="space-y-3">
              {settings.countries.map((country, ci) => (
                <div key={ci} className="border border-gray-200 rounded-xl overflow-hidden transition-all hover:border-gray-300">
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/80">
                    <Globe size={14} className="text-blue-500 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800 flex-1">{country.name}</span>
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {country.universities.length} {country.universities.length === 1 ? "uni" : "unis"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const expanded = document.getElementById(`country-${ci}`);
                        if (expanded) expanded.classList.toggle("hidden");
                      }}
                      className="p-1 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      <ChevronDown size={14} className="text-gray-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => set("countries", settings.countries.filter((_, i) => i !== ci))}
                      className="p-1 hover:bg-red-50 rounded-md transition-colors group"
                    >
                      <X size={13} className="text-gray-300 group-hover:text-red-500" />
                    </button>
                  </div>
                  <div id={`country-${ci}`} className="hidden px-4 py-3 border-t border-gray-100 bg-white space-y-3">
                    {country.universities.map((uni, ui) => (
                      <div
                        key={`${ci}-${ui}`}
                        className="border border-blue-100 rounded-xl p-3 bg-blue-50/30 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <GraduationCap size={14} className="text-blue-500 shrink-0" />
                            <span className="font-semibold text-sm text-gray-900 truncate">{uni.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              updateCountryUniversities(ci, (list) => list.filter((_, i) => i !== ui))
                            }
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md shrink-0"
                            title="Remove university"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                            Requirements
                          </label>
                          <textarea
                            rows={4}
                            value={uni.requirements}
                            onChange={(e) =>
                              updateCountryUniversities(ci, (list) => {
                                const next = [...list];
                                next[ui] = { ...next[ui], requirements: e.target.value };
                                return next;
                              })
                            }
                            placeholder={"• IELTS not less than 7\n• Official transcripts required"}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400 resize-y min-h-[88px]"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                            External links
                          </label>
                          <p className="text-[10px] text-gray-500 leading-snug">
                            Shown as buttons on the University requirements page and here for quick test.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="url"
                              inputMode="url"
                              value={uni.findCourseUrl ?? ""}
                              onChange={(e) =>
                                updateCountryUniversities(ci, (list) => {
                                  const next = [...list];
                                  next[ui] = { ...next[ui], findCourseUrl: e.target.value };
                                  return next;
                                })
                              }
                              placeholder="Find course URL (https://…)"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-gray-400"
                            />
                            <input
                              type="url"
                              inputMode="url"
                              value={uni.englishRequirementsUrl ?? ""}
                              onChange={(e) =>
                                updateCountryUniversities(ci, (list) => {
                                  const next = [...list];
                                  next[ui] = { ...next[ui], englishRequirementsUrl: e.target.value };
                                  return next;
                                })
                              }
                              placeholder="English requirements URL"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-gray-400"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!safeExternalUrl(uni.findCourseUrl ?? "")}
                              onClick={() => {
                                const href = safeExternalUrl(uni.findCourseUrl ?? "");
                                if (href) window.open(href, "_blank", "noopener,noreferrer");
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                              style={{ backgroundColor: settings.brandColor || "#2563eb" }}
                            >
                              <BookOpen size={12} />
                              Find course
                              <ExternalLink size={11} className="opacity-80" />
                            </button>
                            <button
                              type="button"
                              disabled={!safeExternalUrl(uni.englishRequirementsUrl ?? "")}
                              onClick={() => {
                                const href = safeExternalUrl(uni.englishRequirementsUrl ?? "");
                                if (href) window.open(href, "_blank", "noopener,noreferrer");
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Languages size={12} />
                              English requirements
                              <ExternalLink size={11} className="opacity-80" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <Paperclip size={10} /> Documents
                          </label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {(uni.attachments || []).map((att, ai) => (
                              <span
                                key={`${att.path}-${ai}`}
                                className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs"
                              >
                                <a
                                  href={att.path}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline truncate max-w-[200px]"
                                >
                                  {att.originalName || "File"}
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateCountryUniversities(ci, (list) => {
                                      const next = [...list];
                                      const u = next[ui];
                                      if (!u) return list;
                                      next[ui] = {
                                        ...u,
                                        attachments: u.attachments.filter((_, j) => j !== ai),
                                      };
                                      return next;
                                    })
                                  }
                                  className="text-gray-400 hover:text-red-500 p-0.5"
                                  title="Remove file"
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              multiple
                              id={`uni-files-${ci}-${ui}`}
                              className="hidden"
                              disabled={uniDocBusy === `${ci}-${ui}`}
                              onChange={(e) => {
                                void appendUniversityDocuments(ci, ui, e.target.files);
                                e.target.value = "";
                              }}
                            />
                            <label
                              htmlFor={`uni-files-${ci}-${ui}`}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                                uniDocBusy === `${ci}-${ui}`
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:bg-gray-50 text-gray-700"
                              }`}
                            >
                              {uniDocBusy === `${ci}-${ui}` ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Plus size={12} />
                              )}
                              Add files
                            </label>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-blue-100/80">
                          <button
                            type="button"
                            disabled={uniCardSavingKey === `${ci}-${ui}` || saving}
                            onClick={() => void saveCountriesOnly(`${ci}-${ui}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            style={{ backgroundColor: settings.brandColor || "#2563eb" }}
                          >
                            {uniCardSavingKey === `${ci}-${ui}` ? (
                              <Loader2 size={14} className="animate-spin shrink-0" />
                            ) : (
                              <Save size={14} className="shrink-0" strokeWidth={2.25} />
                            )}
                            Update
                          </button>
                          {uniCardSavedKey === `${ci}-${ui}` && (
                            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                              <CheckCircle size={14} />
                              Saved
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {country.universities.length === 0 && (
                      <p className="text-xs text-gray-400 italic">No universities added yet</p>
                    )}
                    <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/50">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Add university</p>
                      <input
                        id={`new-uni-name-${ci}`}
                        placeholder="University name"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                      <textarea
                        id={`new-uni-req-${ci}`}
                        rows={3}
                        placeholder="Requirements (optional), e.g. one bullet per line"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-y min-h-[72px] placeholder-gray-400"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          id={`new-uni-course-url-${ci}`}
                          type="url"
                          inputMode="url"
                          placeholder="Find course URL (optional)"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-gray-400"
                        />
                        <input
                          id={`new-uni-eng-url-${ci}`}
                          type="url"
                          inputMode="url"
                          placeholder="English requirements URL (optional)"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-gray-400"
                        />
                      </div>
                      <input
                        type="file"
                        multiple
                        id={`new-uni-files-${ci}`}
                        className="block w-full text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700"
                      />
                      <button
                        type="button"
                        disabled={uniDocBusy === `new-${ci}`}
                        onClick={() => void addUniversityWithDetails(ci)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        {uniDocBusy === `new-${ci}` ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Add university
                      </button>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        Saves automatically. New names appear in admission forms, leads, commission, and filters without clicking Save.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Add new country */}
            <div className="flex gap-2 mt-4">
              <input
                id="newCountryInput"
                placeholder="Add a new country (e.g. 'Italy')"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const input = e.target as HTMLInputElement;
                    const val = input.value.trim();
                    if (val && !settings.countries.some((c) => c.name === val)) {
                      set("countries", [...settings.countries, { name: val, universities: [] }]);
                      input.value = "";
                    }
                  }
                }}
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400"
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById("newCountryInput") as HTMLInputElement;
                  const val = input.value.trim();
                  if (val && !settings.countries.some((c) => c.name === val)) {
                    set("countries", [...settings.countries, { name: val, universities: [] }]);
                    input.value = "";
                  }
                }}
                className="px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
              >
                <Plus size={13} /> Add Country
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Services Offered" description="Services your consultancy provides.">
            <TagEditor
              label="Services"
              items={settings.services}
              onChange={(v) => set("services", v)}
              placeholder="Add a service (e.g. 'Coaching')"
            />
          </SectionCard>

          <SectionCard title="Course Programs" description="List of course programs offered. These appear as suggestions when adding courses in admission details.">
            <TagEditor
              label="Courses"
              items={settings.courses}
              onChange={(v) => set("courses", v)}
              placeholder="Add a course (e.g. 'Bachelor of IT')"
            />
          </SectionCard>

          <SectionCard title="Education Levels" description="Levels of education offered. These appear as a dropdown when adding courses in admission details.">
            <TagEditor
              label="Education Levels"
              items={settings.educationLevels}
              onChange={(v) => set("educationLevels", v)}
              placeholder="Add a level (e.g. 'Diploma')"
            />
          </SectionCard>

          <div className="mt-2 flex justify-end rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm">
            <SaveBtn saving={saving} saved={saved} onClick={saveSettings} />
          </div>
        </div>
      )}

      {/* ── Tab: Module Toggles ── */}
      {activeTab === "modules" && (
        <div className="space-y-5">
          {!isSuperAdmin && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="p-1.5 bg-amber-100 rounded-lg shrink-0 mt-0.5">
                <Lock size={14} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-800">Caution - System-wide impact</p>
                <p className="text-xs text-amber-700 mt-0.5">Disabling a module hides it from <span className="font-semibold">all users</span> across all branches. Changes here affect the entire platform. Contact your Super Admin if you&apos;re unsure.</p>
              </div>
            </div>
          )}
          <SectionCard title="Feature Modules" description="Enable or disable sections of the application. Disabled modules will be hidden from navigation.">
            <div className="space-y-3">
              {ALL_MODULES.map(({ key, label }) => {
                const enabled = settings.enabledModules.includes(key);
                const isCore = key === "settings";
                const toggle = () => {
                  if (isCore) return;
                  const next = enabled
                    ? settings.enabledModules.filter((m) => m !== key)
                    : [...settings.enabledModules, key];
                  set("enabledModules", next);
                };
                return (
                  <div key={key} className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{label}</p>
                        <p className="text-xs text-gray-500">{enabled ? "Visible to authorized roles" : "Hidden from all users"}</p>
                      </div>
                    </div>
                    <button
                      onClick={toggle}
                      title={isCore ? "Settings module cannot be disabled" : ""}
                      className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none ${
                        enabled ? "bg-gray-900" : "bg-gray-300"
                      } ${isCore ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          enabled ? "translate-x-6" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="Dashboard layout"
            description="Show or hide sections on the home dashboard by role. Drag rows to set vertical order where supported. Users with dashboard access still need the relevant module permissions."
          >
            <div className="space-y-6">
              {dashboardWidgetsByAudience().map(({ audience, title, widgets }) => (
                <div key={audience}>
                  <div className="flex items-center gap-2 mb-3">
                    <LayoutDashboard size={14} className="text-gray-500" />
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</p>
                  </div>
                  <div className="space-y-2">
                    {widgets.map((w) => {
                      const on = settings.dashboardWidgets[w.id] !== false;
                      return (
                        <div
                          key={w.id}
                          className="flex items-start justify-between gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{w.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{w.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const cur = mergeDashboardWidgetsFromApi(settings.dashboardWidgets);
                              set("dashboardWidgets", { ...cur, [w.id]: !on });
                            }}
                            className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none shrink-0 mt-0.5 ${
                              on ? "bg-gray-900" : "bg-gray-300"
                            }`}
                            aria-pressed={on}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                on ? "translate-x-6" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {audienceSupportsOrderCustomization(audience) ? (
                    <>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-0">Section order</p>
                      <p className="text-[11px] text-gray-400 mt-1">Drag to reorder. Save settings to apply on the live dashboard.</p>
                      <DashboardWidgetOrderList
                        orderedIds={resolveWidgetIdsForSettingsEditor(audience, settings.dashboardWidgetOrder)}
                        getLabel={(id) => widgets.find((x) => x.id === id)?.label ?? id}
                        onReorder={(ids) =>
                          set("dashboardWidgetOrder", { ...settings.dashboardWidgetOrder, [audience]: ids })
                        }
                      />
                    </>
                  ) : (
                    <p className="text-[11px] text-gray-400 mt-3">
                      Order is fixed: summary first, then leads with notifications and remarks beside the list.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="mt-2 flex justify-end rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm">
            <SaveBtn saving={saving} saved={saved} onClick={saveSettings} />
          </div>
        </div>
      )}

      {/* ── Tab: Email & SMTP ── */}
      {activeTab === "email" && (
        <div className="space-y-5">
          {!isSuperAdmin && (
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="p-1.5 bg-blue-100 rounded-lg shrink-0 mt-0.5">
                <Lock size={14} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-800">Sensitive Configuration</p>
                <p className="text-xs text-blue-700 mt-0.5">SMTP credentials are used to send all system emails (reminders, reports, notifications). Incorrect settings will stop email delivery for everyone. Handle with care.</p>
              </div>
            </div>
          )}
          <SectionCard title="SMTP Configuration" description="Configure outgoing email for transactional messages, reminders, and reports.">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="SMTP Host" value={settings.smtpHost} onChange={(v) => set("smtpHost", v)} placeholder="smtp.gmail.com" />
                <Field label="SMTP Port" value={settings.smtpPort} onChange={(v) => set("smtpPort", parseInt(v) || 587)} type="number" placeholder="587" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="SMTP Username" value={settings.smtpUser} onChange={(v) => set("smtpUser", v)} placeholder="you@gmail.com" />
                <Field label="SMTP Password" value={settings.smtpPass} onChange={(v) => set("smtpPass", v)} type="password" placeholder="App password or SMTP secret" />
              </div>
              <Field
                label="From Name"
                value={settings.emailFromName}
                onChange={(v) => set("emailFromName", v)}
                placeholder="e.g. Education Tree Global"
                hint="The sender name shown in email inboxes"
              />
            </div>
            <div className="mt-5 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-xs text-blue-700 font-medium">Tip</p>
              <p className="text-xs text-blue-600 mt-0.5">
                For Gmail: enable 2-Step Verification and use an App Password. For Office 365: use smtp.office365.com on port 587.
              </p>
            </div>
          </SectionCard>
          <div className="mt-2 flex justify-end rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm">
            <SaveBtn saving={saving} saved={saved} onClick={saveSettings} />
          </div>
        </div>
      )}

      {/* ── Tab: Roles & telecaller outcomes ── */}
      {activeTab === "team" && (
        <div className="space-y-5">
          {!isSuperAdmin && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="p-1.5 bg-amber-100 rounded-lg shrink-0 mt-0.5">
                <Lock size={14} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-800">High impact</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Role slugs are stored on user accounts. Changing a slug breaks existing users until you update them. Telecaller transfer options drive the leads table for telecallers; keep outcome IDs stable if you link dashboards or reports to them.
                </p>
              </div>
            </div>
          )}

          <SectionCard
            title="Application roles"
            description="Slugs appear in the database (User.role). Default permissions apply when a user has an empty custom permission list."
          >
            <div className="space-y-4">
              {settings.applicationRoles.map((role, ri) => {
                const slugLocked = role.slug === "super_admin";
                const permKeys = [
                  ...ALL_PERMISSIONS.flatMap((p) =>
                    ROLE_DEFAULT_GRANULAR_KEYS[p.key] ? [p.key, ...ROLE_DEFAULT_GRANULAR_KEYS[p.key]] : [p.key]
                  ),
                  ...SETTINGS_SUB_PERMISSIONS.map((p) => p.key),
                ];
                return (
                  <div
                    key={`${role.slug}-${ri}`}
                    className="p-4 border border-gray-200 rounded-lg bg-gray-50/50 space-y-3"
                  >
                    <div className="flex flex-wrap items-end gap-3 justify-between">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-w-0">
                        <Field
                          label="Slug (lowercase, a-z 0-9 _)"
                          value={role.slug}
                          disabled={slugLocked}
                          onChange={(v) => {
                            const next = [...settings.applicationRoles];
                            next[ri] = { ...next[ri], slug: v.trim().toLowerCase() };
                            setSettings((prev) => ({ ...prev, applicationRoles: next }));
                            setSaved(false);
                          }}
                          placeholder="e.g. telecaller"
                          hint={slugLocked ? "Super Admin slug is fixed" : undefined}
                        />
                        <Field
                          label="Display label"
                          value={role.label}
                          onChange={(v) => {
                            const next = [...settings.applicationRoles];
                            next[ri] = { ...next[ri], label: v };
                            setSettings((prev) => ({ ...prev, applicationRoles: next }));
                            setSaved(false);
                          }}
                          placeholder="Shown in UI"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={slugLocked || settings.applicationRoles.length <= 1}
                        onClick={() => {
                          setSettings((prev) => ({
                            ...prev,
                            applicationRoles: prev.applicationRoles.filter((_, i) => i !== ri),
                          }));
                          setSaved(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                    {slugLocked && (
                      <p className="text-[11px] text-gray-500">
                        Slug field for Super Admin is fixed; you can still edit the label and permissions.
                      </p>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">Default permissions</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                        {permKeys.map((key) => {
                          const meta =
                            ALL_PERMISSIONS.find((p) => p.key === key) ||
                            SETTINGS_SUB_PERMISSIONS.find((p) => p.key === key);
                          const checked = defaultPermChecked(role.defaultPermissions, key);
                          const leadsSubDisabled =
                            key.startsWith("leads_") && !role.defaultPermissions.includes("leads");
                          const studentsSubDisabled =
                            key.startsWith("students_") && !role.defaultPermissions.includes("students");
                          return (
                            <label
                              key={key}
                              className={`flex items-start gap-2 text-xs text-gray-700 cursor-pointer ${
                                leadsSubDisabled || studentsSubDisabled ? "opacity-40 pointer-events-none" : ""
                              } ${
                                key.includes("_acl") || key.endsWith("_add") || key.endsWith("_export")
                                  ? "pl-3 border-l border-gray-200"
                                  : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 rounded border-gray-300"
                                checked={checked}
                                disabled={leadsSubDisabled || studentsSubDisabled}
                                onChange={() => {
                                  setSettings((prev) => ({
                                    ...prev,
                                    applicationRoles: applyRoleDefaultPermissionToggle(prev.applicationRoles, ri, key),
                                  }));
                                  setSaved(false);
                                }}
                              />
                              <span>
                                <span className="font-medium">{meta?.label || EXTRA_PERM_LABELS[key] || key}</span>
                                {meta && "description" in meta && meta.description ? (
                                  <span className="block text-[10px] text-gray-400 mt-0.5">{meta.description}</span>
                                ) : null}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  const n = settings.applicationRoles.length + 1;
                  setSettings((prev) => ({
                    ...prev,
                    applicationRoles: [
                      ...prev.applicationRoles,
                      { slug: `custom_role_${n}`, label: "New role", defaultPermissions: [] },
                    ],
                  }));
                  setSaved(false);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Plus size={14} />
                Add role
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Telecaller transfer outcomes"
            description="Options in the telecaller leads table. Effect decides what is PATCHed to the lead (assign counsellor, set FD status, or set standing)."
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.04] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-200">
                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600 w-[140px]">
                          Id
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600 min-w-[140px]">
                          Label
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600 min-w-[160px]">
                          Effect
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600 min-w-[140px]">
                          FD status
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600 min-w-[120px]">
                          Standing
                        </th>
                        <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-gray-600 w-[100px]">
                          Req. counsellor
                        </th>
                        <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-gray-600 w-[88px]">
                          Req. date
                        </th>
                        <th className="px-2 py-3 w-12" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {settings.telecallerTransferOutcomes.map((row, i) => (
                        <tr key={`${row.id}-${i}`} className="align-top hover:bg-slate-50/70 transition-colors">
                          <td className="px-3 py-2.5">
                            <input
                              value={row.id}
                              onChange={(e) => {
                                const v = e.target.value;
                                const next = [...settings.telecallerTransferOutcomes];
                                next[i] = { ...next[i], id: v };
                                setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                                setSaved(false);
                              }}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              placeholder="outcome_id"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              value={row.label}
                              onChange={(e) => {
                                const v = e.target.value;
                                const next = [...settings.telecallerTransferOutcomes];
                                next[i] = { ...next[i], label: v };
                                setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                                setSaved(false);
                              }}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              placeholder="Display name"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={row.effect}
                              onChange={(e) => {
                                const effect = e.target.value as TelecallerTransferOutcome["effect"];
                                const next = [...settings.telecallerTransferOutcomes];
                                next[i] = {
                                  ...next[i],
                                  effect,
                                  fdStatus: effect === "set_standing" ? undefined : next[i].fdStatus,
                                  standing: effect === "set_standing" ? next[i].standing || "cold" : undefined,
                                };
                                setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                                setSaved(false);
                              }}
                              className="w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            >
                              <option value="assign_counsellor">Assign counsellor</option>
                              <option value="set_status">Set FD status</option>
                              <option value="set_standing">Set standing</option>
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              value={row.fdStatus ?? ""}
                              disabled={row.effect === "set_standing"}
                              onChange={(e) => {
                                const next = [...settings.telecallerTransferOutcomes];
                                next[i] = { ...next[i], fdStatus: e.target.value };
                                setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                                setSaved(false);
                              }}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                              placeholder="e.g. Assigned"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              value={row.standing ?? ""}
                              disabled={row.effect !== "set_standing"}
                              onChange={(e) => {
                                const next = [...settings.telecallerTransferOutcomes];
                                next[i] = { ...next[i], standing: e.target.value };
                                setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                                setSaved(false);
                              }}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                              placeholder="e.g. cold"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={!!row.requiresCounsellor}
                              onChange={(e) => {
                                const next = [...settings.telecallerTransferOutcomes];
                                next[i] = { ...next[i], requiresCounsellor: e.target.checked };
                                setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                                setSaved(false);
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={!!row.requiresAppointmentDate}
                              onChange={(e) => {
                                const next = [...settings.telecallerTransferOutcomes];
                                next[i] = { ...next[i], requiresAppointmentDate: e.target.checked };
                                setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                                setSaved(false);
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600"
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <button
                              type="button"
                              disabled={settings.telecallerTransferOutcomes.length <= 1}
                              onClick={() => {
                                setSettings((prev) => ({
                                  ...prev,
                                  telecallerTransferOutcomes: prev.telecallerTransferOutcomes.filter((_, j) => j !== i),
                                }));
                                setSaved(false);
                              }}
                              className="inline-flex p-2 text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-colors disabled:opacity-25 disabled:pointer-events-none"
                              title="Remove row"
                            >
                              <Trash2 size={16} strokeWidth={2} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSettings((prev) => ({
                    ...prev,
                    telecallerTransferOutcomes: [
                      ...prev.telecallerTransferOutcomes,
                      {
                        id: `outcome_${Date.now()}`,
                        label: "New outcome",
                        effect: "set_status",
                        fdStatus: "Interested",
                        requiresCounsellor: false,
                        requiresAppointmentDate: false,
                      },
                    ],
                  }));
                  setSaved(false);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                <Plus size={16} strokeWidth={2.5} />
                Add outcome
              </button>
            </div>
          </SectionCard>

          <div className="mt-2 flex justify-end rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm">
            <SaveBtn saving={saving} saved={saved} onClick={saveSettings} />
          </div>
        </div>
      )}

      {/* ── Tab: Document Checklists ── */}
      {activeTab === "checklists" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
              <FileText size={18} className="text-indigo-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Document Checklists by Country</h2>
              <p className="text-sm text-gray-500 mt-0.5">Define required documents for each destination country. Students and counsellors will see these when uploading.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
            {/* Country sidebar */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Select Country</p>
              </div>
              <div className="overflow-y-auto max-h-[540px] p-2 space-y-1 flex-1">
                {settings.countries.map((c) => {
                  const cl = checklists.find((cl) => cl.country === c.name);
                  const docCount = cl?.documents?.length || 0;
                  const active = selectedCountry === c.name;
                  return (
                    <button
                      key={c.name}
                      onClick={() => loadCountry(c.name)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all flex items-center gap-3 group ${
                        active
                          ? "bg-gray-900 text-white shadow-sm"
                          : "hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      <Globe size={15} className={active ? "text-gray-400 shrink-0" : "text-gray-300 group-hover:text-blue-400 shrink-0"} />
                      <span className="flex-1 truncate text-sm font-semibold">{c.name}</span>
                      {docCount > 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          active
                            ? "bg-white/15 text-gray-300"
                            : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        }`}>
                          {docCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Checklist editor */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
              {!selectedChecklist ? (
                <div className="flex flex-col items-center justify-center h-80 gap-4 text-gray-400">
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                    <FileText size={32} className="text-gray-300" />
                  </div>
                  <p className="text-base font-semibold text-gray-500">No country selected</p>
                  <p className="text-sm text-gray-400">Choose a country from the left to manage its document checklist</p>
                </div>
              ) : (
                <>
                  {/* Editor header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
                        <Globe size={15} className="text-blue-500" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-gray-900">{selectedChecklist.country}</p>
                        <p className="text-xs text-gray-400 mt-0.5 font-medium">
                          {selectedChecklist.documents.length} document{selectedChecklist.documents.length !== 1 ? "s" : ""} &middot; {selectedChecklist.documents.filter(d => d.isRequired).length} required
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={addDoc}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 hover:border-gray-400 rounded-lg text-sm font-semibold text-gray-700 transition-colors shadow-sm"
                      >
                        <Plus size={14} /> Add Document
                      </button>
                      <button
                        onClick={saveChecklist}
                        disabled={clSaving}
                        className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
                          clSaved
                            ? "bg-emerald-600 text-white"
                            : "bg-gray-900 hover:bg-gray-700 text-white disabled:opacity-60"
                        }`}
                      >
                        {clSaved ? <CheckCircle size={14} /> : <Save size={14} />}
                        {clSaving ? "Saving…" : clSaved ? "Saved!" : "Save"}
                      </button>
                    </div>
                  </div>

                  {/* Document list */}
                  <div className="p-6 flex-1 overflow-y-auto">
                    {selectedChecklist.documents.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          <Plus size={24} className="text-gray-300" />
                        </div>
                        <p className="text-base text-gray-500 font-semibold">No documents configured</p>
                        <button onClick={addDoc} className="text-sm text-blue-600 hover:text-blue-700 font-semibold transition-colors">
                          + Add the first document
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedChecklist.documents.map((doc, i) => (
                          <div
                            key={i}
                            className="group relative border border-gray-100 hover:border-gray-200 rounded-xl p-5 transition-all hover:shadow-sm bg-white"
                          >
                            <div className="flex items-start gap-4">
                              {/* Number badge */}
                              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-xs font-bold text-gray-500 shrink-0 mt-1">
                                {i + 1}
                              </div>

                              {/* Fields */}
                              <div className="flex-1 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Document Name *</label>
                                    <input
                                      value={doc.name}
                                      placeholder="e.g. Passport copy"
                                      onChange={(e) => updateDoc(i, "name", e.target.value)}
                                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 transition-colors placeholder-gray-300"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Description</label>
                                    <input
                                      value={doc.description || ""}
                                      placeholder="Brief description (optional)"
                                      onChange={(e) => updateDoc(i, "description", e.target.value)}
                                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 transition-colors placeholder-gray-300"
                                    />
                                  </div>
                                </div>

                                {/* Bottom row: required toggle + delete */}
                                <div className="flex items-center justify-between pt-1">
                                  <label className="flex items-center gap-2.5 cursor-pointer select-none group/req">
                                    <button
                                      type="button"
                                      onClick={() => updateDoc(i, "isRequired", !doc.isRequired)}
                                      className="relative"
                                    >
                                      {doc.isRequired ? (
                                        <ToggleRight size={24} className="text-gray-900" />
                                      ) : (
                                        <ToggleLeft size={24} className="text-gray-300 group-hover/req:text-gray-400" />
                                      )}
                                    </button>
                                    <span className={`text-sm font-semibold ${doc.isRequired ? "text-gray-700" : "text-gray-400"}`}>
                                      {doc.isRequired ? "Required" : "Optional"}
                                    </span>
                                  </label>
                                  <button
                                    onClick={() => removeDoc(i)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 size={13} /> Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
