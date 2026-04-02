"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Settings, Lock, Upload, Plus, Trash2, Save, CheckCircle,
  Palette, Building2, Phone, Mail, Globe, MapPin,
  Users, Tag, List, ToggleLeft, ToggleRight, Server,
  FileText, Image as ImageIcon, ChevronRight, X,
  Flame, Zap, Target, Layers, GitBranch, GraduationCap, ChevronDown, Pencil,
  UserCog,
} from "lucide-react";
import { useBrandingRefresh } from "@/app/branding-context";
import { ALL_PERMISSIONS, SETTINGS_SUB_PERMISSIONS } from "@/lib/utils";
import { DEFAULT_APPLICATION_ROLES } from "@/lib/applicationRoles";
import { DEFAULT_TELECALLER_TRANSFER_OUTCOMES } from "@/lib/telecallerTransferConfig";
import type { TelecallerTransferOutcome } from "@/types/telecallerTransfer";

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
  courses: string[];
  educationLevels: string[];
  countries: { name: string; universities: string[] }[];
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
    "Interview – GS/Cr./Visa", "Interview Cleared", "Payment Made",
    "Medical Requested/Booked", "Passport Submitted",
    "DS-160/VFS/Embassy Appointment", "Pink Slip", "NOC",
    "Defer Offer Requested", "Defer CoE Requested",
    "Refund Requested", "Offer Withdrawn", "Done",
  ],
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
    { name: "Australia", universities: ["University of Melbourne","Australian National University","University of Sydney","Monash University","University of New South Wales"] },
    { name: "Canada", universities: ["University of Toronto","University of British Columbia","McGill University","University of Alberta","McMaster University"] },
    { name: "United Kingdom", universities: ["University of Oxford","University of Cambridge","Imperial College London","University College London","London School of Economics"] },
    { name: "United States", universities: ["MIT","Stanford University","Harvard University","Columbia University","Yale University"] },
    { name: "New Zealand", universities: ["University of Auckland","University of Otago","Victoria University of Wellington"] },
    { name: "Germany", universities: ["Technical University of Munich","Heidelberg University","Humboldt University of Berlin"] },
    { name: "France", universities: ["Sorbonne University","Sciences Po","HEC Paris"] },
    { name: "Japan", universities: ["University of Tokyo","Kyoto University","Osaka University"] },
    { name: "South Korea", universities: ["Seoul National University","Yonsei University","Korea University"] },
    { name: "Netherlands", universities: ["University of Amsterdam","Delft University of Technology","Leiden University"] },
    { name: "Sweden", universities: ["Karolinska Institute","Lund University","Uppsala University"] },
    { name: "Denmark", universities: ["University of Copenhagen","Technical University of Denmark","Aarhus University"] },
    { name: "Finland", universities: ["University of Helsinki","Aalto University"] },
    { name: "Norway", universities: ["University of Oslo","Norwegian University of Science and Technology"] },
    { name: "Switzerland", universities: ["ETH Zurich","EPFL","University of Zurich"] },
    { name: "Austria", universities: ["University of Vienna","Vienna University of Technology"] },
    { name: "Ireland", universities: ["Trinity College Dublin","University College Dublin"] },
    { name: "Singapore", universities: ["National University of Singapore","Nanyang Technological University"] },
    { name: "Malaysia", universities: ["University of Malaya","Universiti Putra Malaysia"] },
    { name: "Dubai (UAE)", universities: ["American University in Dubai","University of Dubai"] },
    { name: "Cyprus", universities: ["University of Cyprus","European University Cyprus"] },
    { name: "Malta", universities: ["University of Malta"] },
    { name: "Hungary", universities: ["Budapest University of Technology and Economics"] },
    { name: "Poland", universities: ["University of Warsaw","Jagiellonian University"] },
    { name: "Czech Republic", universities: ["Charles University","Czech Technical University in Prague"] },
  ],
  services: [
    "Study Abroad","Language Courses","University Application",
    "Visa Assistance","Test Preparation (IELTS/TOEFL)","Scholarship Guidance",
    "Career Counselling","Document Verification",
  ],
  enabledModules: ["leads","students","documents","applications","admissions","visa","analytics","branches","users","activity_logs","settings","commission"],
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
};

// ─── Tag/Pill List Editor ────────────────────────────────────────────────────
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
      <div className="flex flex-wrap gap-1.5 mb-2 p-3 bg-gray-50 border border-gray-200 rounded-lg min-h-[44px]">
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-300 rounded-full text-xs text-gray-700">
            {item}
            <button
              type="button"
              onClick={() => onChange(items.filter((i) => i !== item))}
              className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-gray-400 self-center">No items yet</span>}
      </div>
      <div className="flex gap-2">
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
    </div>
  );
}

// ─── Save Button ─────────────────────────────────────────────────────────────
function SaveBtn({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        saved
          ? "bg-green-600 text-white"
          : "bg-gray-900 hover:bg-gray-700 text-white disabled:opacity-60"
      }`}
    >
      {saved ? <CheckCircle size={15} /> : <Save size={15} />}
      {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
    </button>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
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
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-colors disabled:bg-gray-100 disabled:text-gray-500"
      />
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
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
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editingStageLabel, setEditingStageLabel] = useState("");
  const [expandedCountryStage, setExpandedCountryStage] = useState<string | null>(null);
  const [editingCsStage, setEditingCsStage] = useState<string | null>(null); // "country::value"
  const [editingCsLabel, setEditingCsLabel] = useState("");

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

  // ── Load settings ──
  useEffect(() => {
    fetch("/api/settings/app")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.companyName) {
          // Normalize countries: handle old string[] format from DB
          if (Array.isArray(d.countries)) {
            d.countries = d.countries.map((c: string | { name: string; universities?: string[] }) =>
              typeof c === "string" ? { name: c, universities: [] } : { name: c.name, universities: c.universities || [] }
            );
          }
          setSettings((prev) => ({ ...prev, ...d }));
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

  const set = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

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
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to save settings: ${err.error || res.status}`);
      }
    } catch (e) {
      alert(`Network error saving settings: ${e}`);
    } finally { setSaving(false); }
  };

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
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <div className="p-3 bg-gray-100 border border-gray-200 rounded-full">
          <Lock size={20} className="text-gray-500" />
        </div>
        <p className="text-sm font-medium text-gray-600">Access Restricted</p>
        <p className="text-xs text-gray-400">You don&apos;t have permission to access settings.</p>
      </div>
    );
  }

  // Ensure current tab is valid — default to first visible tab
  const activeTab = (visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]?.id || "branding") as TabId;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 border border-gray-200 rounded-lg">
            <Settings size={16} className="text-gray-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">System Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">Customize every aspect of your platform</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 overflow-x-auto pb-px">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab: Branding ── */}
      {activeTab === "branding" && (
        <div className="space-y-5">
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

          <div className="flex justify-end">
            <SaveBtn saving={saving} saved={saved} onClick={saveSettings} />
          </div>
        </div>
      )}

      {/* ── Tab: Contact Info ── */}
      {activeTab === "contact" && (
        <div className="space-y-5">
          <SectionCard title="Contact Information" description="Business contact details displayed in the system">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                    <Phone size={12} />Phone Number
                  </label>
                  <input
                    value={settings.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                    <Mail size={12} />Email Address
                  </label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="contact@yourcompany.com"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <Globe size={12} />Website URL
                </label>
                <input
                  value={settings.website}
                  onChange={(e) => set("website", e.target.value)}
                  placeholder="https://www.yourcompany.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <MapPin size={12} />Office Address
                </label>
                <textarea
                  value={settings.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="123 Main Street, City, Country"
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 resize-none"
                />
              </div>
            </div>
          </SectionCard>
          <div className="flex justify-end">
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
              <p className="text-xs text-gray-500 mt-0.5">Manage standings, sources, stages, and statuses — changes apply across all departments instantly</p>
            </div>
          </div>

          {/* ── Lead Standings ── */}
          <SectionCard title="Lead Standings" description="Categorize leads by temperature / priority. These labels appear everywhere leads are displayed.">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 p-3 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl min-h-[48px]">
                {settings.leadStandings.map((item) => (
                  <span key={item} className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all">
                    <span className={`w-2 h-2 rounded-full ${
                      item === "heated" ? "bg-red-500" :
                      item === "hot" ? "bg-orange-500" :
                      item === "warm" ? "bg-yellow-500" :
                      item === "cold" ? "bg-blue-500" :
                      "bg-gray-400"
                    }`} />
                    <span className="capitalize">{item.replace(/_/g, " ")}</span>
                    <button type="button" onClick={() => set("leadStandings", settings.leadStandings.filter(i => i !== item))}
                      className="ml-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {settings.leadStandings.length === 0 && <span className="text-xs text-gray-400 self-center">No standings defined</span>}
              </div>
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
          <SectionCard title="Lead Sources" description="Where your leads come from. Shown in dropdowns when creating or editing leads.">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 p-3 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl min-h-[48px]">
                {settings.leadSources.map((item) => (
                  <span key={item} className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    {item}
                    <button type="button" onClick={() => set("leadSources", settings.leadSources.filter(i => i !== item))}
                      className="ml-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {settings.leadSources.length === 0 && <span className="text-xs text-gray-400 self-center">No sources defined</span>}
              </div>
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
          <SectionCard title="Front Desk Statuses" description="Status labels used by the Front Desk team. Visible in the FD status dropdown on lead detail pages.">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 p-3 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl min-h-[48px] max-h-52 overflow-y-auto">
                {settings.fdStatuses.map((item) => (
                  <span key={item} className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    {item}
                    <button type="button" onClick={() => set("fdStatuses", settings.fdStatuses.filter(i => i !== item))}
                      className="ml-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {settings.fdStatuses.length === 0 && <span className="text-xs text-gray-400 self-center">No statuses defined</span>}
              </div>
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
                <Zap size={10} /> {settings.fdStatuses.length} statuses configured. These appear in the Front Desk status dropdown.
              </p>
            </div>
          </SectionCard>

          {/* ── B2B Agent Names ── */}
          <SectionCard title="B2B Agent Names" description="Pre-defined B2B agent/sub-agent names. These will appear as autocomplete suggestions when adding admission details.">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 p-3 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl min-h-[48px] max-h-52 overflow-y-auto">
                {(settings.b2bNames || []).map((item) => (
                  <span key={item} className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all">
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    {item}
                    <button type="button" onClick={() => set("b2bNames", (settings.b2bNames || []).filter(i => i !== item))}
                      className="ml-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {(settings.b2bNames || []).length === 0 && <span className="text-xs text-gray-400 self-center">No B2B names defined</span>}
              </div>
              <div className="flex gap-2">
                <input id="b2bNameInput"
                  placeholder="e.g. ABC Education, XYZ Consultancy"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !(settings.b2bNames || []).includes(val)) {
                        set("b2bNames", [...(settings.b2bNames || []), val]);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400"
                />
                <button type="button" onClick={() => {
                  const input = document.getElementById("b2bNameInput") as HTMLInputElement;
                  const val = input.value.trim();
                  if (val && !(settings.b2bNames || []).includes(val)) {
                    set("b2bNames", [...(settings.b2bNames || []), val]);
                    input.value = "";
                  }
                }} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
                  <Plus size={13} /> Add
                </button>
              </div>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <Zap size={10} /> {(settings.b2bNames || []).length} names configured. These appear as suggestions in the B2B Name field on admission details.
              </p>
            </div>
          </SectionCard>

          {/* ── Remark Options ── */}
          <SectionCard title="Remark Options" description="Pre-defined remarks for the student remarks column. These will appear as dropdown options in the students list.">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 p-3 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl min-h-[48px] max-h-52 overflow-y-auto">
                {(settings.remarkOptions || []).map((item) => (
                  <span key={item} className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    {item}
                    <button type="button" onClick={() => set("remarkOptions", (settings.remarkOptions || []).filter(i => i !== item))}
                      className="ml-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {(settings.remarkOptions || []).length === 0 && <span className="text-xs text-gray-400 self-center">No remark options defined</span>}
              </div>
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
                <Zap size={10} /> {(settings.remarkOptions || []).length} options configured. These appear in the Remarks dropdown on the students list.
              </p>
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
                  <div key={group} className={`border rounded-xl overflow-hidden ${borderColor}`}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${dotColor}`} />
                        <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">{group}</h4>
                        <span className="text-[10px] text-gray-400 font-medium">{groupStages.length} stages</span>
                      </div>
                      <button type="button" onClick={() => {
                        set("leadStageGroups", settings.leadStageGroups.filter(g => g !== group));
                        set("leadStages", settings.leadStages.filter(s => s.group !== group));
                      }} className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-white/60">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="px-4 pb-3">
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {groupStages.map((stage) => (
                          <span key={stage.value} className="group inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/80 backdrop-blur border border-white rounded-md text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all">
                            {editingStage === stage.value ? (
                              <input
                                autoFocus
                                value={editingStageLabel}
                                onChange={(e) => setEditingStageLabel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const newLabel = editingStageLabel.trim();
                                    if (newLabel) {
                                      set("leadStages", settings.leadStages.map(s => s.value === stage.value ? { ...s, label: newLabel } : s));
                                    }
                                    setEditingStage(null);
                                  } else if (e.key === "Escape") {
                                    setEditingStage(null);
                                  }
                                }}
                                onBlur={() => {
                                  const newLabel = editingStageLabel.trim();
                                  if (newLabel) {
                                    set("leadStages", settings.leadStages.map(s => s.value === stage.value ? { ...s, label: newLabel } : s));
                                  }
                                  setEditingStage(null);
                                }}
                                className="w-28 px-1.5 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                              />
                            ) : (
                              <>
                                {stage.label}
                                <button type="button" onClick={() => { setEditingStage(stage.value); setEditingStageLabel(stage.label); }}
                                  className="text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">
                                  <Pencil size={10} />
                                </button>
                              </>
                            )}
                            <button type="button" onClick={() => set("leadStages", settings.leadStages.filter(s => s.value !== stage.value))}
                              className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                        {groupStages.length === 0 && <span className="text-[11px] text-gray-400 italic">No stages in this group</span>}
                      </div>
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
                              <div className="flex flex-wrap gap-1.5 min-h-[32px] mb-1">
                                {pipeStages.map((stage) => {
                                  const editKey = `${countryName}::${stage.value}`;
                                  return (
                                    <span key={stage.value} className="group inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs font-medium text-gray-700 shadow-sm hover:shadow transition-all">
                                      {editingCsStage === editKey ? (
                                        <input
                                          autoFocus
                                          value={editingCsLabel}
                                          onChange={(e) => setEditingCsLabel(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              const newLabel = editingCsLabel.trim();
                                              if (newLabel) {
                                                const updated = stages.map(s => s.value === stage.value ? { ...s, label: newLabel } : s);
                                                set("countryStages", { ...(settings.countryStages || {}), [countryName]: updated });
                                              }
                                              setEditingCsStage(null);
                                            } else if (e.key === "Escape") { setEditingCsStage(null); }
                                          }}
                                          onBlur={() => {
                                            const newLabel = editingCsLabel.trim();
                                            if (newLabel) {
                                              const updated = stages.map(s => s.value === stage.value ? { ...s, label: newLabel } : s);
                                              set("countryStages", { ...(settings.countryStages || {}), [countryName]: updated });
                                            }
                                            setEditingCsStage(null);
                                          }}
                                          className="w-28 px-1.5 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                        />
                                      ) : (
                                        <>
                                          {stage.label}
                                          <button type="button" onClick={() => { setEditingCsStage(editKey); setEditingCsLabel(stage.label); }}
                                            className="text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">
                                            <Pencil size={10} />
                                          </button>
                                        </>
                                      )}
                                      <button type="button" onClick={() => {
                                        const updated = stages.filter(s => s.value !== stage.value);
                                        set("countryStages", { ...(settings.countryStages || {}), [countryName]: updated });
                                      }} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                        <X size={10} />
                                      </button>
                                    </span>
                                  );
                                })}
                                {pipeStages.length === 0 && <span className="text-[11px] text-gray-400 italic self-center">No {pipeline} stages</span>}
                              </div>
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

          <div className="flex justify-end pt-2">
            <SaveBtn saving={saving} saved={saved} onClick={saveSettings} />
          </div>
        </div>
      )}

      {/* ── Tab: Countries & Services ── */}
      {activeTab === "lists" && (
        <div className="space-y-5">
          {/* ── Destination Countries with Universities ── */}
          <SectionCard title="Destination Countries & Universities" description="Manage countries and their universities. These appear in lead forms, student profiles, and document checklists.">
            <div className="space-y-3">
              {settings.countries.map((country, ci) => (
                <div key={ci} className="border border-gray-200 rounded-xl overflow-hidden transition-all hover:border-gray-300">
                  {/* Country Header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/80">
                    <Globe size={14} className="text-blue-500 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800 flex-1">{country.name}</span>
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{country.universities.length} {country.universities.length === 1 ? "uni" : "unis"}</span>
                    <button
                      onClick={() => {
                        const expanded = document.getElementById(`country-${ci}`);
                        if (expanded) expanded.classList.toggle("hidden");
                      }}
                      className="p-1 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      <ChevronDown size={14} className="text-gray-400" />
                    </button>
                    <button
                      onClick={() => set("countries", settings.countries.filter((_, i) => i !== ci))}
                      className="p-1 hover:bg-red-50 rounded-md transition-colors group"
                    >
                      <X size={13} className="text-gray-300 group-hover:text-red-500" />
                    </button>
                  </div>
                  {/* Universities (collapsible) */}
                  <div id={`country-${ci}`} className="hidden px-4 py-3 border-t border-gray-100 bg-white">
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {country.universities.map((uni, ui) => (
                        <span key={ui} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                          <GraduationCap size={11} className="opacity-60" />
                          {uni}
                          <button onClick={() => {
                            const updated = [...settings.countries];
                            updated[ci] = { ...updated[ci], universities: updated[ci].universities.filter((_, i) => i !== ui) };
                            set("countries", updated);
                          }} className="ml-0.5 hover:text-red-500 transition-colors">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                      {country.universities.length === 0 && (
                        <p className="text-xs text-gray-400 italic">No universities added yet</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        id={`uni-input-${ci}`}
                        placeholder="Add university name…"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const input = e.target as HTMLInputElement;
                            const val = input.value.trim();
                            if (val && !country.universities.includes(val)) {
                              const updated = [...settings.countries];
                              updated[ci] = { ...updated[ci], universities: [...updated[ci].universities, val] };
                              set("countries", updated);
                              input.value = "";
                            }
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById(`uni-input-${ci}`) as HTMLInputElement;
                          const val = input.value.trim();
                          if (val && !country.universities.includes(val)) {
                            const updated = [...settings.countries];
                            updated[ci] = { ...updated[ci], universities: [...updated[ci].universities, val] };
                            set("countries", updated);
                            input.value = "";
                          }
                        }}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        + Add
                      </button>
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

          <div className="flex justify-end">
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
                <p className="text-sm font-semibold text-amber-800">Caution — System-wide impact</p>
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

          <div className="flex justify-end">
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
          <div className="flex justify-end">
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
                  ...ALL_PERMISSIONS.map((p) => p.key),
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
                          const checked = role.defaultPermissions.includes(key);
                          return (
                            <label
                              key={key}
                              className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 rounded border-gray-300"
                                checked={checked}
                                onChange={() => {
                                  const next = [...settings.applicationRoles];
                                  const r = { ...next[ri] };
                                  const s = new Set(r.defaultPermissions);
                                  if (s.has(key)) s.delete(key);
                                  else s.add(key);
                                  r.defaultPermissions = Array.from(s);
                                  next[ri] = r;
                                  setSettings((prev) => ({ ...prev, applicationRoles: next }));
                                  setSaved(false);
                                }}
                              />
                              <span>
                                <span className="font-medium">{meta?.label || key}</span>
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
            <div className="space-y-3 overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 uppercase tracking-wide">
                    <th className="py-2 pr-2 font-semibold">Id</th>
                    <th className="py-2 pr-2 font-semibold">Label</th>
                    <th className="py-2 pr-2 font-semibold">Effect</th>
                    <th className="py-2 pr-2 font-semibold">FD status</th>
                    <th className="py-2 pr-2 font-semibold">Standing</th>
                    <th className="py-2 pr-2 font-semibold">Req. counsellor</th>
                    <th className="py-2 pr-2 font-semibold">Req. date</th>
                    <th className="py-2 pl-2 font-semibold w-10" />
                  </tr>
                </thead>
                <tbody>
                  {settings.telecallerTransferOutcomes.map((row, i) => (
                    <tr key={`${row.id}-${i}`} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-2">
                        <input
                          value={row.id}
                          onChange={(e) => {
                            const v = e.target.value;
                            const next = [...settings.telecallerTransferOutcomes];
                            next[i] = { ...next[i], id: v };
                            setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                            setSaved(false);
                          }}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={row.label}
                          onChange={(e) => {
                            const v = e.target.value;
                            const next = [...settings.telecallerTransferOutcomes];
                            next[i] = { ...next[i], label: v };
                            setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                            setSaved(false);
                          }}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white"
                        />
                      </td>
                      <td className="py-2 pr-2">
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
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white"
                        >
                          <option value="assign_counsellor">Assign counsellor</option>
                          <option value="set_status">Set FD status</option>
                          <option value="set_standing">Set standing</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={row.fdStatus ?? ""}
                          disabled={row.effect === "set_standing"}
                          onChange={(e) => {
                            const next = [...settings.telecallerTransferOutcomes];
                            next[i] = { ...next[i], fdStatus: e.target.value };
                            setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                            setSaved(false);
                          }}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white disabled:bg-gray-100"
                          placeholder="e.g. Assigned"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={row.standing ?? ""}
                          disabled={row.effect !== "set_standing"}
                          onChange={(e) => {
                            const next = [...settings.telecallerTransferOutcomes];
                            next[i] = { ...next[i], standing: e.target.value };
                            setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                            setSaved(false);
                          }}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white disabled:bg-gray-100"
                          placeholder="e.g. cold"
                        />
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!row.requiresCounsellor}
                          onChange={(e) => {
                            const next = [...settings.telecallerTransferOutcomes];
                            next[i] = { ...next[i], requiresCounsellor: e.target.checked };
                            setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                            setSaved(false);
                          }}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!row.requiresAppointmentDate}
                          onChange={(e) => {
                            const next = [...settings.telecallerTransferOutcomes];
                            next[i] = { ...next[i], requiresAppointmentDate: e.target.checked };
                            setSettings((prev) => ({ ...prev, telecallerTransferOutcomes: next }));
                            setSaved(false);
                          }}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="py-2 pl-2">
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
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-30"
                          title="Remove row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Plus size={14} />
                Add outcome
              </button>
            </div>
          </SectionCard>

          <div className="flex justify-end">
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
