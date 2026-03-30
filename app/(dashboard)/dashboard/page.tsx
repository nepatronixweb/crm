"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import * as XLSX from "xlsx";
import {
  Users, UserCheck, FileText, TrendingUp,
  ChevronRight, Activity, Target, ArrowUp,
  Bell, Clock, CheckCircle2, PlaneTakeoff, Award, XCircle, BadgeCheck, FilePlus2,
  SlidersHorizontal, Check, Calendar,
  GraduationCap, Send, ShieldCheck, FileInput, MessageSquare,
  Phone, PhoneMissed, PhoneCall, UserPlus, RefreshCw,
  CalendarCheck, Flame, Wifi, Upload, X, AlertCircle, CheckCircle,
  FileSpreadsheet, Table2,
} from "lucide-react";
import { formatDateTime, getStatusColor, hasPermission } from "@/lib/utils";
import { IStudent, UserRole } from "@/types";
import Link from "next/link";
import { useBranding } from "@/app/branding-context";
import CelebrationOverlay from "./CelebrationOverlay";

interface AnalyticsData {
  summary: {
    totalLeads: number;
    totalStudents: number;
    totalApplications: number;
    convertedLeads: number;
    conversionRate: number;
    gsApplied: number;
    coeReceived: number;
    conditionalOffers: number;
    unconditionalOffers: number;
    visaLodged: number;
    granted: number;
    rejected: number;
  };
  recentLeads: Array<{
    _id: string;
    name: string;
    source: string;
    status: string;
    standing: string;
    interestedCountry: string;
    createdAt: string;
    branch: { name: string };
  }>;
  recentActivity: Array<{
    _id: string;
    userName: string;
    action: string;
    module: string;
    targetName: string;
    createdAt: string;
  }>;
  counsellorPerformance: Array<{
    _id: string;
    name: string;
    target: number;
    currentCount: number;
    branch: { name: string };
  }>;
  leadsByStatus: Array<{ _id: string; count: number }>;
}

interface INotif {
  _id: string;
  type?: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

interface IAssignedLead {
  _id: string;
  name: string;
  phone: string;
  interestedCountry: string;
  status: string;
  standing: string;
  source: string;
  createdAt: string;
  updatedAt?: string;
  statusDates?: Record<string, string>;
  notes?: Array<{ createdAt: string }>;
}

interface ICounsellorRemark {
  studentId: string;
  studentName: string;
  content: string;
  addedBy: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  heated: "Heated",
  hot: "Hot",
  warm: "Warm",
  out_of_contact: "Out of Contact",
};

type FilterPeriod = "all" | "daily" | "weekly" | "3month" | "6month" | "9month" | "year";

const FILTER_OPTIONS: { value: FilterPeriod; label: string }[] = [
  { value: "all",    label: "All Time" },
  { value: "daily",  label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "3month", label: "Last 3 Months" },
  { value: "6month", label: "Last 6 Months" },
  { value: "9month", label: "Last 9 Months" },
  { value: "year",   label: "This Year" },
];

function getDateRange(period: FilterPeriod): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString();
  if (period === "all") return {};
  if (period === "daily") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to };
  }
  if (period === "weekly") {
    const from = new Date(now); from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to };
  }
  if (period === "3month") {
    const from = new Date(now); from.setMonth(from.getMonth() - 3);
    return { from: from.toISOString(), to };
  }
  if (period === "6month") {
    const from = new Date(now); from.setMonth(from.getMonth() - 6);
    return { from: from.toISOString(), to };
  }
  if (period === "9month") {
    const from = new Date(now); from.setMonth(from.getMonth() - 9);
    return { from: from.toISOString(), to };
  }
  if (period === "year") {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: from.toISOString(), to };
  }
  return {};
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const branding = useBranding();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const dateRef = useRef<HTMLDivElement>(null);
  const isAdmin = session?.user?.role === "super_admin";
  const isCounsellor = session?.user?.role === "counsellor";
  const isFrontDesk = session?.user?.role === "front_desk";
  const isAdmissionTeam = session?.user?.role === "admission_team";
  const isTelecaller = session?.user?.role === "telecaller";
  const role = (session?.user?.role ?? "") as UserRole;
  const userPermissions = (session?.user?.permissions ?? []) as string[];

  // Counsellor: assigned leads
  const [assignedLeads, setAssignedLeads] = useState<IAssignedLead[]>([]);
  const [counsellorStudents, setCounsellorStudents] = useState<IStudent[]>([]);

  // Front Desk: stats
  const [fdStats, setFdStats] = useState({ totalLeads: 0, convertedToStudent: 0, enrolledStudents: 0 });

  // Admission Team: stats
  interface IAdmissionStats {
    enrolled: number;
    offerApplied: number;
    conditionalOffers: number;
    unconditionalOffers: number;
    gsApplied: number;
    gsApproved: number;
    coeApplied: number;
    coeReceived: number;
    remarks: Array<{ studentId: string; studentName: string; content: string; addedBy: string; createdAt: string }>;
  }
  const [admissionStats, setAdmissionStats] = useState<IAdmissionStats | null>(null);

  // Admin + Counsellor: recent notifications on dashboard
  const [notifs, setNotifs] = useState<INotif[]>([]);

  // ── Import modal state (telecaller) ──
  const [showImport, setShowImport] = useState(false);
  const [importCampaign, setImportCampaign] = useState("");
  const [importSource, setImportSource] = useState("");
  const [importDate, setImportDate] = useState(new Date().toISOString().split("T")[0]);
  const [importSources, setImportSources] = useState<string[]>(["Walk-in","Referral","Social Media","Website","Partner","Phone Call","Email","Exhibition","Other"]);
  const [importPreview, setImportPreview] = useState<Record<string, string>[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLeadType, setImportLeadType] = useState<"fresh" | "cold">("fresh");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Celebration overlay for new assignments
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMsg, setCelebrationMsg] = useState({ title: "", sub: "" });
  const celebrationShownRef = useRef(false);
  const hasAnalyticsRef = useRef(false);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
        setDateOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      const customRange = filterDateFrom || filterDateTo;
      const { from, to } = customRange
        ? { from: filterDateFrom ? new Date(filterDateFrom).toISOString() : undefined, to: filterDateTo ? new Date(filterDateTo + "T23:59:59").toISOString() : undefined }
        : getDateRange(filterPeriod);
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const url = `/api/analytics${params.toString() ? `?${params}` : ""}`;
      const isReload = hasAnalyticsRef.current;
      const loadTimer = setTimeout(() => {
        if (isReload) setRefetching(true); else setLoading(true);
      }, 0);
      fetch(url)
        .then((r) => r.json())
        .then((d) => { hasAnalyticsRef.current = true; setData(d); setLoading(false); setRefetching(false); })
        .catch(() => { clearTimeout(loadTimer); setLoading(false); setRefetching(false); });
      // Also fetch recent notifications for admin
      fetch("/api/notifications?limit=5")
        .then((r) => r.json())
        .then((d) => setNotifs(d.notifications ?? []))
        .catch(() => {});
    } else if (isCounsellor) {
      Promise.all([
        fetch("/api/leads?page=1&limit=50").then((r) => r.json()).catch(() => ({})),
        fetch("/api/students?page=1&limit=50").then((r) => r.json()).catch(() => ({})),
        fetch("/api/notifications?limit=6").then((r) => r.json()).catch(() => ({ notifications: [] })),
      ])
        .then(([leadsData, studentsData, notifications]) => {
          setAssignedLeads(Array.isArray(leadsData) ? leadsData : (leadsData?.leads ?? []));
          setCounsellorStudents(Array.isArray(studentsData) ? studentsData : (studentsData?.students ?? []));
          setNotifs(notifications.notifications ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (isFrontDesk) {
      Promise.all([
        fetch("/api/leads?page=1&limit=500").then((r) => r.json()),
        fetch("/api/students?page=1&limit=500").then((r) => r.json()),
        fetch("/api/notifications?limit=5").then((r) => r.json()).catch(() => ({ notifications: [] })),
      ])
        .then(([leadsData, studentsData, notifications]) => {
          const leadsArr = Array.isArray(leadsData) ? leadsData : (leadsData?.leads ?? []);
          const studentsArr = Array.isArray(studentsData) ? studentsData : (studentsData?.students ?? []);
          setFdStats({
            totalLeads: leadsData?.total ?? leadsArr.length,
            convertedToStudent: leadsArr.filter((l: { convertedToStudent?: boolean }) => l.convertedToStudent).length,
            enrolledStudents: studentsArr.filter((s: { enrolled?: boolean }) => s.enrolled).length,
          });
          setNotifs(notifications.notifications ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (isAdmissionTeam) {
      Promise.all([
        fetch("/api/analytics/admission").then((r) => r.json()),
        fetch("/api/notifications?limit=5").then((r) => r.json()).catch(() => ({ notifications: [] })),
      ])
        .then(([admData, notifications]) => {
          setAdmissionStats(admData);
          setNotifs(notifications.notifications ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (isTelecaller) {
      Promise.all([
        fetch("/api/leads?page=1&limit=1000").then(r => r.json()),
        fetch("/api/settings/app").then(r => r.json()).catch(() => ({})),
      ])
        .then(([d, settings]) => {
          setAssignedLeads(Array.isArray(d) ? d : (d?.leads ?? []));
          if (settings?.leadSources?.length) setImportSources(settings.leadSources);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setTimeout(() => setLoading(false), 0);
    }
  }, [isAdmin, isCounsellor, isFrontDesk, isAdmissionTeam, isTelecaller, filterPeriod, filterDateFrom, filterDateTo]);

  // Trigger celebration when unread assignment notifications arrive
  useEffect(() => {
    if (notifs.length === 0) return;
    const timer = setTimeout(() => {
      if (celebrationShownRef.current) return;
      const unreadAssignments = notifs.filter((n) => !n.read && n.type === "lead_assigned");
      if (unreadAssignments.length > 0) {
        celebrationShownRef.current = true;
        const count = unreadAssignments.length;
        setCelebrationMsg({
          title: "Hurray! 🎊",
          sub: count === 1
            ? "You have been assigned a new task!"
            : `You have been assigned ${count} new tasks!`,
        });
        setShowCelebration(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [notifs]);

  const dismissCelebration = useCallback(() => {
    setShowCelebration(false);
    // Mark assignment notifications as read
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
  }, []);

  // ── File parsing helper ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        // Normalize column headers: trim + lowercase for matching
        const normalized = rows.map((row) => {
          const out: Record<string, string> = {};
          Object.keys(row).forEach((k) => { out[k.trim()] = String(row[k] ?? "").trim(); });
          return out;
        });
        setImportPreview(normalized);
      } catch {
        setImportResult({ type: "error", msg: "Could not parse the file. Make sure it's a valid .csv or .xlsx." });
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Column name aliases ──
  const colAlias = (row: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find((c) => c.toLowerCase() === k.toLowerCase());
      if (found) return row[found] ?? "";
    }
    return "";
  };

  const handleImport = async () => {
    if (!importCampaign.trim()) { setImportResult({ type: "error", msg: "Campaign name is required." }); return; }
    if (!importSource) { setImportResult({ type: "error", msg: "Source is required." }); return; }
    if (importPreview.length === 0) { setImportResult({ type: "error", msg: "Please select a file first." }); return; }
    setImportLoading(true);
    setImportResult(null);
    const rows = importPreview.map((r) => ({
      name:              colAlias(r, "name","full name","student name","fullname"),
      phone:             colAlias(r, "phone","mobile","contact","phone number","mobile number"),
      email:             colAlias(r, "email","email address","mail"),
      interestedCountry: colAlias(r, "country","interested country","destination","interestedcountry"),
      comments:          colAlias(r, "comments","comment","notes","note","remarks","remark"),
    }));
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign: importCampaign, source: importSource, importDate, leadType: importLeadType, rows }),
      });
      const d = await res.json();
      if (res.ok) {
        setImportResult({ type: "success", msg: `✓ ${d.imported} ${importLeadType === "cold" ? "cold" : "fresh"} leads imported for campaign "${d.campaign}"!` });
        setImportPreview([]);
        setImportFileName("");
        setImportCampaign("");
        setImportLeadType("fresh");
        if (importFileRef.current) importFileRef.current.value = "";
        // Refresh telecaller leads
        fetch("/api/leads?page=1&limit=1000").then(r => r.json())
          .then(data => setAssignedLeads(Array.isArray(data) ? data : (data?.leads ?? [])));
      } else {
        setImportResult({ type: "error", msg: d.error || "Import failed." });
      }
    } catch {
      setImportResult({ type: "error", msg: "Network error. Please try again." });
    } finally {
      setImportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Celebration overlay */}
      {showCelebration && (
        <CelebrationOverlay
          message={celebrationMsg.title}
          subMessage={celebrationMsg.sub}
          onDismiss={dismissCelebration}
        />
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {isAdmin ? "Overview" : "Dashboard"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back, {session?.user?.name} &mdash; {branding.companyName}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {/* Refetch spinner */}
            {refetching && (
              <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            )}
            {/* Custom date range picker */}
            <div className="relative" ref={dateRef}>
              <button
                onClick={() => setDateOpen((o) => !o)}
                title="Custom date range"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  filterDateFrom || filterDateTo
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                <Calendar size={13} />
                {filterDateFrom && filterDateTo
                  ? `${filterDateFrom} → ${filterDateTo}`
                  : filterDateFrom
                  ? `From ${filterDateFrom}`
                  : filterDateTo
                  ? `To ${filterDateTo}`
                  : "Custom Range"}
              </button>
              {dateOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 p-5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Custom Date Range</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">From</label>
                      <input
                        type="date"
                        value={filterDateFrom}
                        onChange={(e) => { setFilterDateFrom(e.target.value); setFilterPeriod("all"); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">To</label>
                      <input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => { setFilterDateTo(e.target.value); setFilterPeriod("all"); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setDateOpen(false)}
                        className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors"
                      >
                        Apply
                      </button>
                      {(filterDateFrom || filterDateTo) && (
                        <button
                          onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setDateOpen(false); }}
                          className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Filter dropdown */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((o) => !o)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  filterPeriod !== "all"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                <SlidersHorizontal size={13} />
                {FILTER_OPTIONS.find((o) => o.value === filterPeriod)?.label ?? "Filter"}
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  {FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setFilterPeriod(opt.value); setFilterDateFrom(""); setFilterDateTo(""); setFilterOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                        filterPeriod === opt.value
                          ? "bg-gray-900 text-white"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {opt.label}
                      {filterPeriod === opt.value && <Check size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 border border-gray-200">
              Super Admin
            </span>
          </div>
        )}
      </div>

      {isAdmin && data && (
        <div className={`space-y-6 transition-opacity duration-200 ${refetching ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
          {/* KPI Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Total Leads",
                value: data.summary.totalLeads,
                sub: `${data.summary.convertedLeads} converted`,
                icon: Users,
                href: "/leads",
              },
              {
                label: "Total Students",
                value: data.summary.totalStudents,
                sub: "Active enrolments",
                icon: UserCheck,
                href: "/students",
              },
              {
                label: "Applications",
                value: data.summary.totalApplications,
                sub: "All time",
                icon: FileText,
                href: "/applications",
              },
              {
                label: "Conversion Rate",
                value: `${data.summary.conversionRate}%`,
                sub: "Lead to student",
                icon: TrendingUp,
                href: "/reports",
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.label}
                  href={card.href}
                  className="group bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2 bg-gray-50 border border-gray-100 rounded-md">
                      <Icon size={16} className="text-gray-600" />
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                  <p className="text-xs font-medium text-gray-700 mt-1">{card.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
                </Link>
              );
            })}
          </div>

          {/* Student Pipeline Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              {
                label: "GS Applied",
                value: data.summary.gsApplied,
                sub: "Application stage",
                icon: FilePlus2,
                color: "text-sky-600",
                bg: "bg-sky-50 border-sky-100",
              },
              {
                label: "COE Received",
                value: data.summary.coeReceived,
                sub: "Enrollment confirmed",
                icon: BadgeCheck,
                color: "text-teal-600",
                bg: "bg-teal-50 border-teal-100",
              },
              {
                label: "Conditional",
                value: data.summary.conditionalOffers,
                sub: "Conditional offer",
                icon: Clock,
                color: "text-amber-600",
                bg: "bg-amber-50 border-amber-100",
              },
              {
                label: "Unconditional",
                value: data.summary.unconditionalOffers,
                sub: "Unconditional offer",
                icon: CheckCircle2,
                color: "text-green-600",
                bg: "bg-green-50 border-green-100",
              },
              {
                label: "Visa Lodged",
                value: data.summary.visaLodged,
                sub: "Visa submitted",
                icon: PlaneTakeoff,
                color: "text-indigo-600",
                bg: "bg-indigo-50 border-indigo-100",
              },
              {
                label: "Granted",
                value: data.summary.granted,
                sub: "Visa approved",
                icon: Award,
                color: "text-emerald-600",
                bg: "bg-emerald-50 border-emerald-100",
              },
              {
                label: "Rejected",
                value: data.summary.rejected,
                sub: "Visa rejected",
                icon: XCircle,
                color: "text-red-500",
                bg: "bg-red-50 border-red-100",
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2"
                >
                  <div className={`w-8 h-8 rounded-md border flex items-center justify-center ${card.bg}`}>
                    <Icon size={15} className={card.color} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{card.label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Middle Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Recent Leads */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-800">Recent Leads</h2>
                </div>
                <Link
                  href="/leads"
                  className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors"
                >
                  View all <ChevronRight size={12} />
                </Link>
              </div>

              {data.recentLeads.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">No leads recorded yet</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.recentLeads.map((lead) => (
                    <Link
                      key={lead._id}
                      href={`/leads/${lead._id}`}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-gray-600">
                            {lead.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {lead.interestedCountry}
                            {lead.branch?.name ? ` · ${lead.branch.name}` : ""}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${getStatusColor(lead.standing)}`}
                      >
                        {STATUS_LABELS[lead.standing] ?? lead.standing}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Counsellor Targets */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
                <Target size={15} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-800">Counsellor Targets</h2>
              </div>

              {data.counsellorPerformance.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">No counsellors found</div>
              ) : (
                <div className="px-5 py-4 space-y-5">
                  {data.counsellorPerformance.map((c) => {
                    const pct = c.target > 0
                      ? Math.min(100, Math.round((c.currentCount / c.target) * 100))
                      : 0;
                    const isComplete = pct >= 100;
                    return (
                      <div key={c._id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                            {c.branch?.name && (
                              <p className="text-xs text-gray-400 truncate">{c.branch.name}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <span className="text-sm font-semibold text-gray-900">{c.currentCount}</span>
                            <span className="text-xs text-gray-400">/{c.target}</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              isComplete ? "bg-gray-800" : "bg-gray-400"
                            }`}
                            style={{ inlineSize: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{pct}% of target</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Lead Status Breakdown */}
          {data.leadsByStatus.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
                <ArrowUp size={15} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-800">Lead Status Breakdown</h2>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {data.leadsByStatus.map((s) => (
                  <div key={s._id} className="text-center p-3 rounded-md bg-gray-50 border border-gray-100">
                    <p className="text-xl font-bold text-gray-900">{s.count}</p>
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">
                      {STATUS_LABELS[s._id] ?? s._id}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity + Notifications — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Recent Activity */}
            <div className="bg-white border border-gray-200 rounded-lg flex flex-col">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
                <Activity size={15} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-800">Recent Activity</h2>
              </div>
              {data.recentActivity.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400 flex-1">No activity logged</div>
              ) : (
                <div className="divide-y divide-gray-50 flex-1">
                  {data.recentActivity.map((log) => (
                    <div
                      key={log._id}
                      className="flex items-center justify-between px-5 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                        <p className="text-sm text-gray-700 truncate">
                          <span className="font-medium text-gray-900">{log.userName}</span>
                          {" "}
                          <span className="text-gray-500 capitalize">{log.action.toLowerCase()}</span>
                          {" "}
                          <span className="text-gray-800">{log.targetName}</span>
                          <span className="text-gray-400"> &mdash; {log.module}</span>
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap ml-4 shrink-0">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications (admin only) */}
            <div className="bg-white border border-gray-200 rounded-lg flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Bell size={15} className="text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-800">Notifications</h2>
                  {notifs.filter((n) => !n.read).length > 0 && (
                    <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                      {notifs.filter((n) => !n.read).length} new
                    </span>
                  )}
                </div>
              </div>
              {notifs.length === 0 ? (
                <div className="px-5 py-10 text-center flex-1">
                  <Bell size={24} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 flex-1">
                  {notifs.map((n) => (
                    <div key={n._id} className={`px-5 py-3.5 flex items-start gap-3 ${n.read ? "" : "bg-blue-50"}`}>
                      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-gray-200" : "bg-blue-500"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800">{n.title}</p>
                          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{formatDateTime(n.createdAt)}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                        {n.link && (
                          <Link href={n.link} className="text-xs text-blue-600 hover:underline mt-0.5 inline-block">
                            View lead →
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Non-admin quick links */}
      {!isAdmin && (
        <>
          {/* ── Counsellor Dashboard ── */}
          {isCounsellor && (() => {
            const total   = assignedLeads.length;
            const heated  = assignedLeads.filter((l) => l.status === "heated").length;
            const hot     = assignedLeads.filter((l) => l.status === "hot").length;
            const warm    = assignedLeads.filter((l) => l.status === "warm").length;
            const ooc     = assignedLeads.filter((l) => l.status === "out_of_contact").length;
            const unread  = notifs.filter((n) => !n.read).length;
            const recentLeads = assignedLeads.slice(0, 8);
            const totalStudents = counsellorStudents.length;
            const enrolledStudents = counsellorStudents.filter((student) => student.enrolled).length;
            const offerApplied = counsellorStudents.filter((student) => student.stage === "offer_applied").length;
            const conditionalOffers = counsellorStudents.filter((student) => student.stage === "conditional_offer_received").length;
            const unconditionalOffers = counsellorStudents.filter((student) => student.stage === "unconditional_offer_received").length;
            const gsApplied = counsellorStudents.filter((student) => student.stage === "gs_applied").length;
            const gsApproved = counsellorStudents.filter((student) => student.stage === "gs_approved").length;
            const gsRejected = counsellorStudents.filter((student) => student.stage === "gs_rejected").length;
            const coeApplied = counsellorStudents.filter((student) => student.stage === "coe_applied").length;
            const coeReceived = counsellorStudents.filter((student) => student.stage === "coe_received").length;
            const visaApplied = counsellorStudents.filter((student) => student.stage === "visa_applied").length;
            const visaGranted = counsellorStudents.filter((student) => student.stage === "visa_grant").length;
            const visaRejected = counsellorStudents.filter((student) => student.stage === "visa_reject").length;
            const recentRemarks = counsellorStudents
              .flatMap((student) =>
                (student.notes || []).map((note) => ({
                  studentId: student._id,
                  studentName: student.name,
                  content: note.content,
                  addedBy: note.addedByName,
                  createdAt: String(note.createdAt),
                }))
              )
              .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
              .slice(0, 6) as ICounsellorRemark[];
            const pipelineStats = [
              { label: "Student", value: totalStudents, sub: "My converted students", color: "bg-white border border-gray-200", text: "text-gray-900", subText: "text-gray-500" },
              { label: "Enrolled", value: enrolledStudents, sub: "Students marked enrolled", color: "bg-emerald-50 border border-emerald-100", text: "text-emerald-700", subText: "text-emerald-600/80" },
              { label: "Offer Applied", value: offerApplied, sub: "Offer submissions", color: "bg-blue-50 border border-blue-100", text: "text-blue-700", subText: "text-blue-600/80" },
              { label: "Unconditional", value: unconditionalOffers, sub: "Unconditional offers", color: "bg-cyan-100 border border-cyan-200", text: "text-cyan-800", subText: "text-cyan-700/80" },
              { label: "Conditional", value: conditionalOffers, sub: "Conditional offers", color: "bg-cyan-50 border border-cyan-100", text: "text-cyan-700", subText: "text-cyan-600/80" },
              { label: "GS Applied", value: gsApplied, sub: "GS submitted", color: "bg-purple-50 border border-purple-100", text: "text-purple-700", subText: "text-purple-600/80" },
              { label: "Approved", value: gsApproved, sub: "GS approved", color: "bg-violet-100 border border-violet-200", text: "text-violet-800", subText: "text-violet-700/80" },
              { label: "GS Reject", value: gsRejected, sub: "GS rejected", color: "bg-red-50 border border-red-100", text: "text-red-700", subText: "text-red-600/80" },
              { label: "COE Applied", value: coeApplied, sub: "COE submissions", color: "bg-emerald-50 border border-emerald-100", text: "text-emerald-700", subText: "text-emerald-600/80" },
              { label: "COE Received", value: coeReceived, sub: "COE completed", color: "bg-green-100 border border-green-200", text: "text-green-800", subText: "text-green-700/80" },
              { label: "Visa Applied", value: visaApplied, sub: "Visa lodged", color: "bg-teal-50 border border-teal-100", text: "text-teal-700", subText: "text-teal-600/80" },
              { label: "Visa Grant", value: visaGranted, sub: "Visa approved", color: "bg-teal-100 border border-teal-200", text: "text-teal-800", subText: "text-teal-700/80" },
              { label: "Visa Reject", value: visaRejected, sub: "Visa rejected", color: "bg-rose-50 border border-rose-100", text: "text-rose-700", subText: "text-rose-600/80" },
            ];
            return (
              <div className="space-y-5">

                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Total Leads",      value: total,  color: "bg-gray-900",    text: "text-white",        sub: "Assigned to you" },
                    { label: "Heated",           value: heated, color: "bg-red-500",     text: "text-white",        sub: "Needs urgent follow-up" },
                    { label: "Hot",              value: hot,    color: "bg-orange-400",  text: "text-white",        sub: "High interest" },
                    { label: "Warm",             value: warm,   color: "bg-yellow-400",  text: "text-gray-900",     sub: "Active prospects" },
                  ].map((s) => (
                    <Link key={s.label} href="/leads"
                      className={`${s.color} rounded-xl p-5 hover:opacity-90 transition-opacity`}>
                      <p className={`text-3xl font-bold tracking-tight ${s.text}`}>{s.value}</p>
                      <p className={`text-sm font-semibold mt-1 ${s.text}`}>{s.label}</p>
                      <p className={`text-xs mt-0.5 opacity-70 ${s.text}`}>{s.sub}</p>
                    </Link>
                  ))}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Student Pipeline Snapshot</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Counsellor-owned student progress across offer, GS, COE and visa stages</p>
                    </div>
                    <Link href="/students" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      View students <ChevronRight size={12} />
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                    {pipelineStats.map((stat) => (
                      <Link
                        key={stat.label}
                        href="/students"
                        className={`${stat.color} rounded-lg p-4 hover:shadow-sm transition-shadow`}
                      >
                        <p className={`text-2xl font-bold tracking-tight ${stat.text}`}>{stat.value}</p>
                        <p className={`text-xs font-semibold mt-1 ${stat.text}`}>{stat.label}</p>
                        <p className={`text-[11px] mt-0.5 ${stat.subText}`}>{stat.sub}</p>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Out of contact pill */}
                {ooc > 0 && (
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <XCircle size={15} className="text-gray-400 shrink-0" />
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">{ooc} lead{ooc > 1 ? "s" : ""}</span> marked as <span className="font-medium">Out of Contact</span> — consider re-engaging.
                    </p>
                    <Link href="/leads" className="ml-auto text-xs text-blue-600 hover:underline whitespace-nowrap">View →</Link>
                  </div>
                )}

                {/* Main Content: Leads + Notifications */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                  {/* Assigned Leads — wider */}
                  <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl flex flex-col">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded-md">
                          <Users size={14} className="text-gray-600" />
                        </div>
                        <h2 className="text-sm font-semibold text-gray-900">My Assigned Leads</h2>
                        {total > 0 && (
                          <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{total}</span>
                        )}
                      </div>
                      <Link href="/leads" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        View all <ChevronRight size={12} />
                      </Link>
                    </div>

                    {recentLeads.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                          <Users size={20} className="text-gray-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-600">No leads assigned yet</p>
                        <p className="text-xs text-gray-400 mt-1">New leads assigned to you will appear here</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50 flex-1">
                        {recentLeads.map((lead) => (
                          <Link
                            key={lead._id}
                            href={`/leads/${lead._id}`}
                            className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 transition-colors group"
                          >
                            <div className="w-8 h-8 rounded-full bg-linear-to-br from-gray-200 to-gray-300 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-gray-700">{lead.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
                              <p className="text-xs text-gray-400 truncate">
                                {lead.phone}{lead.interestedCountry ? ` · ${lead.interestedCountry}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${getStatusColor(lead.standing)}`}>
                                {STATUS_LABELS[lead.standing] ?? lead.standing}
                              </span>
                              <ChevronRight size={13} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                    {total > 8 && (
                      <div className="px-5 py-3 border-t border-gray-100">
                        <Link href="/leads" className="text-xs text-blue-600 hover:underline">+ {total - 8} more leads</Link>
                      </div>
                    )}
                  </div>

                  {/* Notifications — narrower */}
                  <div className="lg:col-span-2 space-y-5">
                    <div className="bg-white border border-gray-200 rounded-xl flex flex-col">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-gray-100 rounded-md">
                            <Bell size={14} className="text-gray-600" />
                          </div>
                          <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
                          {unread > 0 && (
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                              {unread} new
                            </span>
                          )}
                        </div>
                      </div>

                      {notifs.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center px-6">
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                            <Bell size={20} className="text-gray-400" />
                          </div>
                          <p className="text-sm font-medium text-gray-600">All caught up!</p>
                          <p className="text-xs text-gray-400 mt-1">No new notifications</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-50 flex-1">
                          {notifs.map((n) => (
                            <div key={n._id} className={`px-4 py-3.5 flex items-start gap-3 ${!n.read ? "bg-blue-50/60" : ""}`}>
                              <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-gray-200" : "bg-blue-500"}`} />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-800 leading-snug">{n.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                                <div className="flex items-center justify-between mt-1.5">
                                  {n.link ? (
                                    <Link href={n.link} className="text-[11px] text-blue-600 hover:underline font-medium">View lead →</Link>
                                  ) : <span />}
                                  <span className="text-[11px] text-gray-400">{formatDateTime(n.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl flex flex-col">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-amber-50 rounded-md border border-amber-100">
                            <MessageSquare size={14} className="text-amber-600" />
                          </div>
                          <h2 className="text-sm font-semibold text-gray-900">Recent Remarks</h2>
                        </div>
                        <Link href="/students" className="text-xs text-blue-600 hover:underline">View students →</Link>
                      </div>

                      {recentRemarks.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-10 text-center px-6">
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                            <MessageSquare size={20} className="text-gray-400" />
                          </div>
                          <p className="text-sm font-medium text-gray-600">No remarks yet</p>
                          <p className="text-xs text-gray-400 mt-1">Student notes will appear here once added</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {recentRemarks.map((remark) => (
                            <Link key={`${remark.studentId}-${remark.createdAt}`}
                              href={`/students/${remark.studentId}#notes`}
                              className="block px-4 py-3.5 hover:bg-gray-50/80 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 truncate">{remark.studentName}</p>
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{remark.content}</p>
                                  <p className="text-[11px] text-gray-400 mt-1">By {remark.addedBy || "Unknown"}</p>
                                </div>
                                <span className="text-[11px] text-gray-400 shrink-0">{formatDateTime(remark.createdAt)}</span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* Front Desk Dashboard */}
          {isFrontDesk && (
            <div className="space-y-5">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link href="/leads" className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2 bg-gray-50 border border-gray-100 rounded-md">
                      <Users size={16} className="text-gray-600" />
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 tracking-tight">{fdStats.totalLeads}</p>
                  <p className="text-xs font-medium text-gray-700 mt-1">Total Leads</p>
                  <p className="text-xs text-gray-400 mt-0.5">All leads in your branch</p>
                </Link>

                <Link href="/leads" className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-md">
                      <TrendingUp size={16} className="text-emerald-600" />
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 tracking-tight">{fdStats.convertedToStudent}</p>
                  <p className="text-xs font-medium text-gray-700 mt-1">Converted to Student</p>
                  <p className="text-xs text-gray-400 mt-0.5">Leads converted to students</p>
                </Link>

                <Link href="/students?enrolled=true" className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2 bg-blue-50 border border-blue-100 rounded-md">
                      <UserCheck size={16} className="text-blue-600" />
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 tracking-tight">{fdStats.enrolledStudents}</p>
                  <p className="text-xs font-medium text-gray-700 mt-1">Enrolled Students</p>
                  <p className="text-xs text-gray-400 mt-0.5">Students fully enrolled</p>
                </Link>
              </div>


            </div>
          )}

          {/* Admission Team Dashboard */}
          {isAdmissionTeam && admissionStats && (
            <div className="space-y-5">
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: "Enrolled",
                    value: admissionStats.enrolled,
                    sub: "Total enrolled students",
                    icon: GraduationCap,
                    color: "text-emerald-600",
                    bg: "bg-emerald-50 border-emerald-100",
                    href: "/admissions",
                  },
                  {
                    label: "Offer Applied",
                    value: admissionStats.offerApplied,
                    sub: "Offers submitted",
                    icon: Send,
                    color: "text-blue-600",
                    bg: "bg-blue-50 border-blue-100",
                    href: "/students",
                  },
                  {
                    label: "Unconditional",
                    value: admissionStats.unconditionalOffers,
                    sub: "Unconditional offers",
                    icon: CheckCircle2,
                    color: "text-green-600",
                    bg: "bg-green-50 border-green-100",
                    href: "/students",
                  },
                  {
                    label: "Conditional",
                    value: admissionStats.conditionalOffers,
                    sub: "Conditional offers",
                    icon: Clock,
                    color: "text-amber-600",
                    bg: "bg-amber-50 border-amber-100",
                    href: "/students",
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.label}
                      href={card.href}
                      className="group bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-9 h-9 rounded-md border flex items-center justify-center ${card.bg}`}>
                          <Icon size={16} className={card.color} />
                        </div>
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                      <p className="text-xs font-semibold text-gray-700 mt-1">{card.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
                    </Link>
                  );
                })}
              </div>

              {/* Second Row: GS & COE */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: "GS Applied",
                    value: admissionStats.gsApplied,
                    sub: "GS applications",
                    icon: FileInput,
                    color: "text-purple-600",
                    bg: "bg-purple-50 border-purple-100",
                    href: "/students",
                  },
                  {
                    label: "GS Approved",
                    value: admissionStats.gsApproved,
                    sub: "GS approved",
                    icon: ShieldCheck,
                    color: "text-violet-600",
                    bg: "bg-violet-50 border-violet-100",
                    href: "/students",
                  },
                  {
                    label: "COE Applied",
                    value: admissionStats.coeApplied,
                    sub: "COE applications sent",
                    icon: FilePlus2,
                    color: "text-sky-600",
                    bg: "bg-sky-50 border-sky-100",
                    href: "/students",
                  },
                  {
                    label: "COE Received",
                    value: admissionStats.coeReceived,
                    sub: "COE confirmations",
                    icon: BadgeCheck,
                    color: "text-teal-600",
                    bg: "bg-teal-50 border-teal-100",
                    href: "/students",
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.label}
                      href={card.href}
                      className="group bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-9 h-9 rounded-md border flex items-center justify-center ${card.bg}`}>
                          <Icon size={16} className={card.color} />
                        </div>
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                      <p className="text-xs font-semibold text-gray-700 mt-1">{card.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
                    </Link>
                  );
                })}
              </div>

              {/* Recent Remarks */}
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={15} className="text-gray-500" />
                    <h2 className="text-sm font-semibold text-gray-800">Recent Remarks</h2>
                  </div>
                  <Link
                    href="/admissions"
                    className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors"
                  >
                    View all <ChevronRight size={12} />
                  </Link>
                </div>
                {admissionStats.remarks.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">No remarks yet</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {admissionStats.remarks.map((r, i) => (
                      <Link
                        key={i}
                        href={`/students/${r.studentId}`}
                        className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-semibold text-gray-600">
                            {r.studentName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate">{r.studentName}</p>
                            <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                              {formatDateTime(r.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.content}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">by {r.addedBy}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Telecaller Dashboard ── */}
          {isTelecaller && (() => {
            const today = new Date().toDateString();
            const leads = assignedLeads;
            const total = leads.length;

            // Status-based counts
            const freshLeads       = leads.filter(l => ["Open/Unassigned","Interested","AP-Interested","FD-Interested","In-Progress","AP-Pending"].includes(l.status ?? "")).length;
            const transferred      = leads.filter(l => ["Assigned","Counselling","Counselled","Qualified Lead"].includes(l.status ?? "")).length;
            const phoneCounselling = leads.filter(l => ["Phone Counselling","Counselled"].includes(l.status ?? "")).length;
            const onlineEnrollment = leads.filter(l => l.status === "Registered/Completed").length;
            const cold             = leads.filter(l => l.standing === "cold" || ["AP-Not Interested","Not Interested","Not Qualified","Dead/Junk Lead","FD-Junk","Closed Lost"].includes(l.status ?? "")).length;
            const cnrEngaged       = leads.filter(l => ["AP-Call Not Received","Not Answering","AP-Call Back Later"].includes(l.status ?? "")).length;
            const appointmentBooked= leads.filter(l => l.status === "Counselling").length;

            // Today's performance (from statusDates or updatedAt)
            const callsMadeToday = leads.filter(l => {
              const sd = l.statusDates;
              if (sd) {
                return Object.values(sd).some(d => new Date(d).toDateString() === today);
              }
              return l.updatedAt ? new Date(l.updatedAt).toDateString() === today : false;
            }).length;

            const appointmentToday = leads.filter(l => {
              const d = l.statusDates?.["Counselling"];
              return d ? new Date(d).toDateString() === today : false;
            }).length;

            const phoneCounsellingToday = leads.filter(l => {
              const d = l.statusDates?.["Phone Counselling"] ?? l.statusDates?.["Counselled"];
              return d ? new Date(d).toDateString() === today : false;
            }).length;

            // Target progress helpers
            const pct = (val: number, target: number) => target > 0 ? Math.min(100, Math.round((val / target) * 100)) : 0;

            return (
              <div className="space-y-6">

                {/* Header Banner */}
                <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl">
                  <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
                  <div className="relative flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="p-2.5 bg-white/15 rounded-xl border border-white/20">
                          <Phone size={20} className="text-white" />
                        </div>
                        <div>
                          <h1 className="text-2xl font-bold">Telecaller Dashboard</h1>
                          <p className="text-white/70 text-sm">Welcome back, {session?.user?.name}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <p className="text-white/60 text-xs font-medium uppercase tracking-widest">Today</p>
                        <p className="text-white font-bold text-lg">{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
                      </div>
                      <button
                        onClick={() => { setShowImport(true); setImportResult(null); setImportLeadType("fresh"); }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white text-violet-700 rounded-xl font-bold text-sm hover:bg-violet-50 transition-colors shadow-lg shadow-violet-900/20"
                      >
                        <Upload size={15} />
                        Import Leads
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Today's Targets ── */}
                <div>
                  <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Today&apos;s Targets</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { label: "Calls Made Today",       value: callsMadeToday,        target: 200, icon: Phone,        color: "from-violet-500 to-purple-600",  ring: "ring-violet-200", textAccent: "text-violet-600", bg: "bg-violet-50" },
                      { label: "Appointments Booked",    value: appointmentToday,      target: 10,  icon: CalendarCheck, color: "from-emerald-500 to-teal-600",   ring: "ring-emerald-200", textAccent: "text-emerald-600", bg: "bg-emerald-50" },
                      { label: "Phone Counselling",      value: phoneCounsellingToday, target: 25,  icon: PhoneCall,     color: "from-blue-500 to-indigo-600",    ring: "ring-blue-200", textAccent: "text-blue-600", bg: "bg-blue-50" },
                    ].map((t) => {
                      const Icon = t.icon;
                      const p = pct(t.value, t.target);
                      const done = p >= 100;
                      return (
                        <div key={t.label} className={`bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow ring-1 ${t.ring}`}>
                          <div className="flex items-start justify-between mb-4">
                            <div className={`p-2.5 rounded-xl ${t.bg}`}>
                              <Icon size={18} className={t.textAccent} />
                            </div>
                            <div className="text-right">
                              <span className="text-2xl font-black text-gray-900">{t.value}</span>
                              <span className="text-sm text-gray-400 font-medium"> / {t.target}</span>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-gray-800 mb-3">{t.label}</p>
                          {/* Progress bar */}
                          <div className="w-full bg-gray-100 rounded-full h-2 mb-1.5 overflow-hidden">
                            <div
                              className={`h-2 rounded-full bg-gradient-to-r ${t.color} transition-all duration-700`}
                              style={{ width: `${p}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${done ? "text-emerald-600" : t.textAccent}`}>{p}% of target</span>
                            {done
                              ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ TARGET MET</span>
                              : <span className="text-[10px] text-gray-400">{t.target - t.value} more needed</span>
                            }
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Lead Stats Grid ── */}
                <div>
                  <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Lead Overview</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Total Enquiry", value: total,           icon: Users,       bg: "bg-gray-900",      text: "text-white",        sub: "All assigned leads",        sub2: "text-white/60" },
                      { label: "Fresh Leads",   value: freshLeads,      icon: UserPlus,    bg: "bg-emerald-500",   text: "text-white",        sub: "New & pending contact",     sub2: "text-white/70" },
                      { label: "Transferred",   value: transferred,     icon: RefreshCw,   bg: "bg-blue-500",      text: "text-white",        sub: "Moved to counsellor",       sub2: "text-white/70" },
                      { label: "Appointment",   value: appointmentBooked,icon: CalendarCheck,bg: "bg-violet-500",  text: "text-white",        sub: "Counselling scheduled",     sub2: "text-white/70" },
                    ].map((s) => {
                      const Icon = s.icon;
                      return (
                        <Link key={s.label} href="/leads"
                          className={`${s.bg} rounded-xl p-5 hover:opacity-90 transition-opacity shadow-sm`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="p-1.5 bg-white/15 rounded-lg">
                              <Icon size={14} className={s.text} />
                            </div>
                          </div>
                          <p className={`text-3xl font-black tracking-tight ${s.text}`}>{s.value}</p>
                          <p className={`text-sm font-bold mt-1 ${s.text}`}>{s.label}</p>
                          <p className={`text-[11px] mt-0.5 ${s.sub2}`}>{s.sub}</p>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {/* ── Secondary Stats ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Phone Counselling", value: phoneCounselling, icon: PhoneCall,   bg: "bg-indigo-50",  border: "border-indigo-200",  text: "text-indigo-700",  sub: "Counselled over phone" },
                    { label: "Online Enrollment", value: onlineEnrollment, icon: Wifi,        bg: "bg-teal-50",    border: "border-teal-200",    text: "text-teal-700",    sub: "Registered & completed" },
                    { label: "Cold",              value: cold,             icon: Flame,       bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-600",   sub: "Low interest / cold" },
                    { label: "CNR / Engaged",     value: cnrEngaged,       icon: PhoneMissed, bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   sub: "Not reachable / busy" },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <Link key={s.label} href="/leads"
                        className={`${s.bg} border ${s.border} rounded-xl p-4 hover:shadow-sm transition-shadow flex flex-col gap-3`}>
                        <div className={`w-8 h-8 rounded-lg border ${s.border} flex items-center justify-center bg-white`}>
                          <Icon size={15} className={s.text} />
                        </div>
                        <div>
                          <p className={`text-2xl font-black tracking-tight ${s.text}`}>{s.value}</p>
                          <p className={`text-xs font-bold mt-0.5 ${s.text}`}>{s.label}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* ── Recent Leads ── */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-violet-50 rounded-lg border border-violet-100">
                        <Users size={14} className="text-violet-600" />
                      </div>
                      <h2 className="text-sm font-semibold text-gray-900">Recent Assigned Leads</h2>
                      <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{total}</span>
                    </div>
                    <Link href="/leads" className="text-xs font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-1">
                      View all <ChevronRight size={12} />
                    </Link>
                  </div>
                  {leads.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                        <Users size={20} className="text-gray-300" />
                      </div>
                      <p className="text-sm font-medium text-gray-500">No leads assigned yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {leads.slice(0, 8).map((lead) => {
                        const standingColor: Record<string, string> = {
                          hot: "bg-red-100 text-red-700",
                          warm: "bg-orange-100 text-orange-700",
                          heated: "bg-yellow-100 text-yellow-700",
                          cold: "bg-blue-100 text-blue-700",
                          missed: "bg-gray-100 text-gray-500",
                        };
                        return (
                          <Link key={lead._id} href={`/leads/${lead._id}`}
                            className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 transition-colors group">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-white">{lead.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
                              <p className="text-xs text-gray-400 truncate">
                                {lead.phone}{lead.interestedCountry ? ` · ${lead.interestedCountry}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {lead.status && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold max-w-28 truncate">
                                  {lead.status}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${standingColor[lead.standing] ?? "bg-gray-100 text-gray-500"}`}>
                                {lead.standing}
                              </span>
                              <ChevronRight size={13} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  {leads.length > 8 && (
                    <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40">
                      <Link href="/leads" className="text-xs text-violet-600 hover:underline font-medium">+ {leads.length - 8} more leads →</Link>
                    </div>
                  )}
                </div>

                {/* ── Import Modal ── */}
                {showImport && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

                      {/* Modal Header */}
                      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white shrink-0">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white/15 rounded-lg">
                            <FileSpreadsheet size={18} className="text-white" />
                          </div>
                          <div>
                            <h2 className="text-base font-bold">Import Leads</h2>
                            <p className="text-white/70 text-xs">Upload a .csv or .xlsx file to bulk-add leads</p>
                          </div>
                        </div>
                        <button onClick={() => setShowImport(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                          <X size={18} />
                        </button>
                      </div>

                      <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

                        {/* ── Meta fields ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {/* Campaign Name */}
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                              Campaign Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              value={importCampaign}
                              onChange={(e) => setImportCampaign(e.target.value)}
                              placeholder="e.g. March Walk-In Drive"
                              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                            />
                          </div>
                          {/* Source */}
                          <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                              Source <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={importSource}
                              onChange={(e) => setImportSource(e.target.value)}
                              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all appearance-none bg-white"
                            >
                              <option value="">Select source</option>
                              {importSources.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          {/* Date */}
                          <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Date</label>
                            <input
                              type="date"
                              value={importDate}
                              onChange={(e) => setImportDate(e.target.value)}
                              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                            />
                          </div>
                        </div>

                        {/* ── Lead Type ── */}
                        <div>
                          <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                            Enquiry Lead Status <span className="text-red-500">*</span>
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            {/* Fresh */}
                            <button
                              type="button"
                              onClick={() => setImportLeadType("fresh")}
                              className={`relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                                importLeadType === "fresh"
                                  ? "border-emerald-500 bg-emerald-50 shadow-sm shadow-emerald-100"
                                  : "border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
                              }`}
                            >
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${importLeadType === "fresh" ? "bg-emerald-100" : "bg-gray-100"}`}>
                                <UserPlus size={16} className={importLeadType === "fresh" ? "text-emerald-600" : "text-gray-400"} />
                              </div>
                              <div className="min-w-0">
                                <p className={`text-sm font-bold ${importLeadType === "fresh" ? "text-emerald-800" : "text-gray-700"}`}>Fresh Leads</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">Open / needs follow-up</p>
                              </div>
                              <div className={`absolute top-3 right-3 w-4 h-4 rounded-full border-2 flex items-center justify-center ${importLeadType === "fresh" ? "border-emerald-500 bg-emerald-500" : "border-gray-300"}`}>
                                {importLeadType === "fresh" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                            </button>

                            {/* Cold */}
                            <button
                              type="button"
                              onClick={() => setImportLeadType("cold")}
                              className={`relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                                importLeadType === "cold"
                                  ? "border-blue-500 bg-blue-50 shadow-sm shadow-blue-100"
                                  : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                              }`}
                            >
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${importLeadType === "cold" ? "bg-blue-100" : "bg-gray-100"}`}>
                                <Flame size={16} className={importLeadType === "cold" ? "text-blue-500" : "text-gray-400"} />
                              </div>
                              <div className="min-w-0">
                                <p className={`text-sm font-bold ${importLeadType === "cold" ? "text-blue-800" : "text-gray-700"}`}>Cold Leads</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">Low interest / not reachable</p>
                              </div>
                              <div className={`absolute top-3 right-3 w-4 h-4 rounded-full border-2 flex items-center justify-center ${importLeadType === "cold" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
                                {importLeadType === "cold" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                            </button>
                          </div>
                          {/* Descriptor */}
                          <p className={`text-[11px] mt-2 font-medium ${importLeadType === "fresh" ? "text-emerald-600" : "text-blue-600"}`}>
                            {importLeadType === "fresh"
                              ? "→ Leads will be marked as Open/Unassigned and counted in Fresh Leads"
                              : "→ Leads will be marked as Cold and counted in Cold section"}
                          </p>
                        </div>

                        {/* ── File Upload ── */}
                        <div>
                          <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                            Upload File <span className="text-red-500">*</span>
                          </label>
                          <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-200 rounded-2xl p-6 cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 transition-all group">
                            <div className="p-3 bg-gray-100 rounded-xl group-hover:bg-violet-100 transition-colors">
                              <Upload size={22} className="text-gray-400 group-hover:text-violet-500 transition-colors" />
                            </div>
                            {importFileName ? (
                              <div className="text-center">
                                <p className="text-sm font-bold text-violet-700">{importFileName}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{importPreview.length} rows detected — click to change</p>
                              </div>
                            ) : (
                              <div className="text-center">
                                <p className="text-sm font-semibold text-gray-700">Click to upload or drag & drop</p>
                                <p className="text-xs text-gray-400 mt-0.5">Supports .xlsx, .xls, .csv files</p>
                              </div>
                            )}
                            <input
                              ref={importFileRef}
                              type="file"
                              accept=".csv,.xlsx,.xls"
                              className="hidden"
                              onChange={handleFileSelect}
                            />
                          </label>
                        </div>

                        {/* ── Column guide ── */}
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Table2 size={12} />
                            Expected Columns (header row required)
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { col: "Name", note: "Required" },
                              { col: "Phone", note: "" },
                              { col: "Email", note: "" },
                              { col: "Country", note: "" },
                              { col: "Comments", note: "" },
                            ].map(({ col, note }) => (
                              <span key={col} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${note ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                {col}
                                {note && <span className="text-[10px] text-violet-500 font-black">{note}</span>}
                              </span>
                            ))}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-2">Column names are case-insensitive. Extra columns are ignored.</p>
                        </div>

                        {/* ── Preview table ── */}
                        {importPreview.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                              Preview — {importPreview.length} rows
                              {importPreview.length > 5 && <span className="text-gray-400 font-normal"> (showing first 5)</span>}
                            </p>
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-200">
                                    {Object.keys(importPreview[0]).slice(0, 6).map((col) => (
                                      <th key={col} className="px-3 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">{col}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {importPreview.slice(0, 5).map((row, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                      {Object.keys(importPreview[0]).slice(0, 6).map((col) => (
                                        <td key={col} className="px-3 py-2 text-gray-700 max-w-32 truncate">{row[col]}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* ── Result message ── */}
                        {importResult && (
                          <div className={`flex items-start gap-3 p-4 rounded-xl border ${importResult.type === "success" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                            {importResult.type === "success"
                              ? <CheckCircle size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                              : <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                            }
                            <p className={`text-sm font-medium ${importResult.type === "success" ? "text-emerald-700" : "text-red-600"}`}>
                              {importResult.msg}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Modal Footer */}
                      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/60 shrink-0">
                        <div className="text-xs text-gray-400">
                          {importPreview.length > 0 && !importResult?.type &&
                            <span><span className="font-semibold text-gray-700">{importPreview.length}</span> rows ready to import</span>
                          }
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={() => setShowImport(false)}
                            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">
                            Cancel
                          </button>
                          <button
                            onClick={handleImport}
                            disabled={importLoading || importPreview.length === 0}
                            className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
                          >
                            {importLoading
                              ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Importing…</>
                              : <><Upload size={14} /> Import {importPreview.length > 0 ? `${importPreview.length} Leads` : "Leads"}</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Generic quick links for non-counsellor, non-admin, non-front-desk roles */}
          {!isCounsellor && !isFrontDesk && !isAdmissionTeam && !isTelecaller && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Leads", href: "/leads", module: "leads", icon: Users, desc: "View and manage your assigned leads" },
                { label: "Students", href: "/students", module: "students", icon: UserCheck, desc: "Track your student progress" },
              ].filter((item) => hasPermission(userPermissions, item.module, role)).map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <div className="p-2 bg-gray-50 border border-gray-100 rounded-md inline-flex mb-4">
                      <Icon size={16} className="text-gray-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{item.label}</h3>
                    <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
