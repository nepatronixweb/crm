"use client";
import { useEffect, useState, useRef, useCallback, Fragment, useMemo, type ReactNode } from "react";
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
  FileSpreadsheet, Table2, Globe2, GripVertical, LayoutGrid,
} from "lucide-react";
import { formatDateTime, getStatusColor, hasPermission } from "@/lib/utils";
import { useFdStatusOptions } from "@/lib/useFdStatusOptions";
import { resolveFdStatusPresentation } from "@/lib/fdStatusOptions";
import {
  buildAdminDashboardChunks,
  flattenAdminDashboardChunksToOrder,
  isDashboardWidgetVisible,
  mergeDashboardWidgetsFromApi,
  mergeDashboardWidgetOrderFromApi,
  mergeDashboardWidgetsWithUserOverrides,
  mergeDashboardWidgetOrderStates,
  resolveOrderedWidgetIds,
  audienceSupportsOrderCustomization,
  roleSlugToDashboardAudience,
  type AdminChartWidgetId,
  type AdminDashboardChunk,
  type AdminKpiCardId,
  type DashboardAudience,
  type DashboardWidgetOrderState,
} from "@/lib/dashboardLayout";
import { TELECALLER_FRESH_BUCKET } from "@/lib/telecallerFreshLeads";
import {
  TELECALLER_OVERVIEW_APPOINTMENT,
  TELECALLER_OVERVIEW_CNR,
  TELECALLER_OVERVIEW_COLD,
  TELECALLER_OVERVIEW_ONLINE_ENROLLMENT,
  TELECALLER_OVERVIEW_PHONE_COUNSELLING,
  TELECALLER_OVERVIEW_TRANSFERRED,
} from "@/lib/telecallerLeadOverviewBuckets";
import { IStudent, UserRole } from "@/types";
import Link from "next/link";
import { useBranding } from "@/app/branding-context";
import CelebrationOverlay from "./CelebrationOverlay";
import InventorySummaryWidgets from "@/components/inventory/InventorySummaryWidgets";
import CounselledTimeInline from "@/components/CounselledTimeInline";

interface AnalyticsData {
  summary: {
    totalLeads: number;
    totalStudents: number;
    totalApplications: number;
    convertedLeads: number;
    conversionRate: number;
    leadsCounselled: number;
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
    statusDates?: Record<string, unknown>;
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
  leadsBySource?: Array<{ _id: string; count: number }>;
  studentsByStage?: Array<{ _id: string; count: number }>;
  applicationsByCountry?: Array<{ _id: string; count: number }>;
  applicationsByStatus?: Array<{ _id: string; count: number }>;
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

const DASHBOARD_DND_MIME = "application/x-etg-dashboard-section";
const DASHBOARD_KPI_DND_MIME = "application/x-etg-dashboard-kpi-card";

function chunkStableKey(chunk: AdminDashboardChunk, fallbackIdx: number): string {
  if (chunk.type === "single") return chunk.id;
  if (chunk.type === "charts") return `charts:${chunk.ids.join(":")}`;
  if (chunk.type === "kpis") return `kpis:${chunk.ids.join(":")}`;
  return `twin:${chunk.leftId}:${chunk.rightId}`;
}

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

function humanizeAnalyticsKey(s: string) {
  if (!s) return "-";
  return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Match spreadsheet headers after trim + lowercase + collapse spaces / underscores */
function normalizeImportHeaderKey(k: string): string {
  return k.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function normalizeImportRows(rows: Record<string, unknown>[]): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    Object.keys(row).forEach((k) => {
      const key = normalizeImportHeaderKey(k);
      if (!key) return;
      out[key] = String(row[k] ?? "").trim();
    });
    return out;
  });
}

function importPickColumn(row: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const want = normalizeImportHeaderKey(a);
    const v = row[want];
    if (v) return v;
  }
  return "";
}

/** Excel often emits __EMPTY, numeric keys, or A/B column letters when headers are missing */
function fallbackNameFromGenericColumns(row: Record<string, string>): string {
  const keys = Object.keys(row);
  if (keys.length === 0) return "";
  const generic = (k: string) => {
    const t = k.trim();
    return /^__empty/i.test(t) || /^\d+$/.test(t) || /^[A-Z]{1,2}$/i.test(t);
  };
  if (!keys.every(generic)) return "";
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v) return v;
  }
  return "";
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const branding = useBranding();
  const fdStatusOptions = useFdStatusOptions();
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
  const isAdmin = session?.user?.role === "super_admin" || session?.user?.role === "org_admin";
  const isCounsellor = session?.user?.role === "counsellor";
  const isFrontDesk = session?.user?.role === "front_desk";
  const isAdmissionTeam = session?.user?.role === "admission_team";
  const isTelecaller = session?.user?.role === "telecaller";
  const isOtherDashboardRole =
    !isAdmin && !isCounsellor && !isFrontDesk && !isAdmissionTeam && !isTelecaller;
  const role = (session?.user?.role ?? "") as UserRole;
  const userPermissions = (session?.user?.permissions ?? []) as string[];
  const [dashboardWidgetToggles, setDashboardWidgetToggles] = useState<Record<string, boolean>>(() =>
    mergeDashboardWidgetsFromApi(undefined)
  );
  const [dashboardWidgetOrder, setDashboardWidgetOrder] = useState<DashboardWidgetOrderState>({});
  const showDw = useCallback(
    (id: string) => isDashboardWidgetVisible(id, dashboardWidgetToggles),
    [dashboardWidgetToggles]
  );

  const dashboardAudience = roleSlugToDashboardAudience(role || "other");
  const canCustomizeDashboardLayout = audienceSupportsOrderCustomization(dashboardAudience);
  const [dashboardLayoutEdit, setDashboardLayoutEdit] = useState(false);
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueDashboardLayoutSave = useCallback((audience: DashboardAudience, order: string[]) => {
    if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
    layoutSaveTimerRef.current = setTimeout(() => {
      layoutSaveTimerRef.current = null;
      void fetch("/api/users/me/dashboard-layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, order }),
      });
    }, 450);
  }, []);

  const reorderAdminDashboardChunks = useCallback(
    (from: number, to: number) => {
      const order = resolveOrderedWidgetIds("super_admin", dashboardWidgetToggles, dashboardWidgetOrder);
      const chunks = [...buildAdminDashboardChunks(order)];
      if (from < 0 || from >= chunks.length || to < 0 || to >= chunks.length || from === to) return;
      const [removed] = chunks.splice(from, 1);
      chunks.splice(to, 0, removed);
      const flat = flattenAdminDashboardChunksToOrder(chunks);
      setDashboardWidgetOrder((prev) => ({ ...prev, super_admin: flat }));
      queueDashboardLayoutSave("super_admin", flat);
    },
    [dashboardWidgetToggles, dashboardWidgetOrder, queueDashboardLayoutSave]
  );

  const reorderAdminKpiCards = useCallback(
    (chunkIdx: number, from: number, to: number) => {
      const order = resolveOrderedWidgetIds("super_admin", dashboardWidgetToggles, dashboardWidgetOrder);
      const chunks = [...buildAdminDashboardChunks(order)];
      const ch = chunks[chunkIdx];
      if (!ch || ch.type !== "kpis") return;
      const ids = [...ch.ids];
      if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return;
      const [removed] = ids.splice(from, 1);
      ids.splice(to, 0, removed);
      chunks[chunkIdx] = { type: "kpis", ids };
      const flat = flattenAdminDashboardChunksToOrder(chunks);
      setDashboardWidgetOrder((prev) => ({ ...prev, super_admin: flat }));
      queueDashboardLayoutSave("super_admin", flat);
    },
    [dashboardWidgetToggles, dashboardWidgetOrder, queueDashboardLayoutSave]
  );

  const reorderAudienceWidgetIds = useCallback(
    (audience: DashboardAudience, from: number, to: number) => {
      const order = [...resolveOrderedWidgetIds(audience, dashboardWidgetToggles, dashboardWidgetOrder)];
      if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to) return;
      const [removed] = order.splice(from, 1);
      order.splice(to, 0, removed);
      setDashboardWidgetOrder((prev) => ({ ...prev, [audience]: order }));
      queueDashboardLayoutSave(audience, order);
    },
    [dashboardWidgetToggles, dashboardWidgetOrder, queueDashboardLayoutSave]
  );

  const dashboardLayoutSectionCount = useMemo(() => {
    if (!canCustomizeDashboardLayout) return 0;
    if (dashboardAudience === "super_admin") {
      const o = resolveOrderedWidgetIds("super_admin", dashboardWidgetToggles, dashboardWidgetOrder);
      return buildAdminDashboardChunks(o).length;
    }
    return resolveOrderedWidgetIds(dashboardAudience, dashboardWidgetToggles, dashboardWidgetOrder).length;
  }, [canCustomizeDashboardLayout, dashboardAudience, dashboardWidgetToggles, dashboardWidgetOrder]);

  const showDashboardLayoutTools =
    canCustomizeDashboardLayout && dashboardLayoutSectionCount >= 2;

  function wrapDraggableSection(
    audience: DashboardAudience,
    index: number,
    sectionKey: string,
    inner: ReactNode | null
  ): ReactNode {
    if (inner == null) return null;
    const edit = showDashboardLayoutTools && dashboardLayoutEdit && dashboardAudience === audience;
    return (
      <div
        key={sectionKey}
        className={`relative rounded-xl ${edit ? "pl-10 ring-1 ring-dashed ring-blue-300/90 bg-blue-50/20" : ""}`}
        onDragOver={
          edit
            ? (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            : undefined
        }
        onDrop={
          edit
            ? (e) => {
                e.preventDefault();
                const from = parseInt(e.dataTransfer.getData(DASHBOARD_DND_MIME), 10);
                if (Number.isNaN(from)) return;
                reorderAudienceWidgetIds(audience, from, index);
              }
            : undefined
        }
      >
        {edit && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DASHBOARD_DND_MIME, String(index));
              e.dataTransfer.effectAllowed = "move";
            }}
            className="absolute left-0 top-3 z-10 flex h-9 w-8 cursor-grab items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 active:cursor-grabbing"
            aria-label="Drag to reorder section"
            title="Drag to reorder"
          >
            <GripVertical size={16} />
          </div>
        )}
        {inner}
      </div>
    );
  }

  // Counsellor: assigned leads
  const [assignedLeads, setAssignedLeads] = useState<IAssignedLead[]>([]);
  const [counsellorStudents, setCounsellorStudents] = useState<IStudent[]>([]);

  /** Telecaller overview card counts - same filters as GET /api/enquiries?bucket=… (full DB, not first 1000 rows). */
  const [telecallerOverviewTotals, setTelecallerOverviewTotals] = useState({
    totalEnquiry: 0,
    fresh: 0,
    transferred: 0,
    appointment: 0,
    phoneCounselling: 0,
    onlineEnrollment: 0,
    cold: 0,
    cnr: 0,
  });

  const refreshTelecallerLeads = useCallback(async () => {
    const json = (path: string) => fetch(path, { cache: "no-store" }).then((r) => r.json());
    const countTotal = async (bucket?: string) => {
      const p = new URLSearchParams({ page: "1", limit: "1" });
      if (bucket) p.set("bucket", bucket);
      const d = await json(`/api/enquiries?${p}`);
      return typeof d?.total === "number" ? d.total : 0;
    };
    const [
      listData,
      totalEnquiry,
      fresh,
      transferred,
      appointment,
      phoneCounselling,
      onlineEnrollment,
      cold,
      cnr,
    ] = await Promise.all([
      json("/api/enquiries?page=1&limit=1000"),
      countTotal(),
      countTotal(TELECALLER_FRESH_BUCKET),
      countTotal(TELECALLER_OVERVIEW_TRANSFERRED),
      countTotal(TELECALLER_OVERVIEW_APPOINTMENT),
      countTotal(TELECALLER_OVERVIEW_PHONE_COUNSELLING),
      countTotal(TELECALLER_OVERVIEW_ONLINE_ENROLLMENT),
      countTotal(TELECALLER_OVERVIEW_COLD),
      countTotal(TELECALLER_OVERVIEW_CNR),
    ]);
    setAssignedLeads(Array.isArray(listData) ? listData : (listData?.leads ?? []));
    setTelecallerOverviewTotals({
      totalEnquiry,
      fresh,
      transferred,
      appointment,
      phoneCounselling,
      onlineEnrollment,
      cold,
      cnr,
    });
  }, []);

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
  const importInFlightRef = useRef(false);

  // Celebration overlay for new assignments
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMsg, setCelebrationMsg] = useState({ title: "", sub: "" });
  const celebrationShownRef = useRef(false);
  const hasAnalyticsRef = useRef(false);

  // Load lead sources for import modal (all roles that can import)
  useEffect(() => {
    if (!session) return;
    fetch("/api/settings/app")
      .then((r) => r.json())
      .then((d) => {
        if (d?.leadSources?.length) setImportSources(d.leadSources);
        const tenantWidgets = mergeDashboardWidgetsFromApi(d?.dashboardWidgets);
        const tenantOrder = mergeDashboardWidgetOrderFromApi(d?.dashboardWidgetOrder);
        const userW = session.user.dashboardWidgets;
        const userO = session.user.dashboardWidgetOrder;
        setDashboardWidgetToggles(mergeDashboardWidgetsWithUserOverrides(tenantWidgets, userW));
        setDashboardWidgetOrder(mergeDashboardWidgetOrderStates(tenantOrder, userO));
      })
      .catch(() => {});
  }, [session]);

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
        .then((d) => {
          hasAnalyticsRef.current = true;
          if (d?.error) setData(null);
          else setData(d);
          setLoading(false);
          setRefetching(false);
        })
        .catch(() => { clearTimeout(loadTimer); setData(null); setLoading(false); setRefetching(false); });
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
      refreshTelecallerLeads()
        .then(() => setLoading(false))
        .catch(() => setLoading(false));
    } else {
      setTimeout(() => setLoading(false), 0);
    }
  }, [isAdmin, isCounsellor, isFrontDesk, isAdmissionTeam, isTelecaller, filterPeriod, filterDateFrom, filterDateTo, refreshTelecallerLeads]);

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
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        setImportPreview(normalizeImportRows(rows));
      } catch {
        setImportResult({ type: "error", msg: "Could not parse the file. Make sure it's a valid .csv or .xlsx." });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (!importCampaign.trim()) { setImportResult({ type: "error", msg: "Campaign name is required." }); return; }
    if (!importSource) { setImportResult({ type: "error", msg: "Source is required." }); return; }
    if (importPreview.length === 0) { setImportResult({ type: "error", msg: "Please select a file first." }); return; }
    if (importInFlightRef.current) return;
    importInFlightRef.current = true;
    setImportLoading(true);
    setImportResult(null);
    const rows = importPreview.map((r) => {
      const fromAliases = importPickColumn(
        r,
        "name",
        "full name",
        "student name",
        "lead name",
        "contact name",
        "customer name",
        "applicant",
        "applicant name",
        "candidate",
        "candidate name",
        "fullname",
        "name of student",
      );
      const name = fromAliases.trim() || fallbackNameFromGenericColumns(r);
      return {
        name,
        phone: importPickColumn(
          r,
          "phone",
          "mobile",
          "contact",
          "phone number",
          "mobile number",
          "tel",
          "cell",
          "whatsapp",
          "whatsapp number",
        ),
        email: importPickColumn(r, "email", "email address", "mail", "e mail"),
        interestedCountry: importPickColumn(
          r,
          "country",
          "interested country",
          "destination",
          "interestedcountry",
          "preferred country",
        ),
        comments: importPickColumn(r, "comments", "comment", "notes", "note", "remarks", "remark"),
      };
    });
    try {
      const importUrl = isTelecaller ? "/api/enquiries/import" : "/api/leads/import";
      const res = await fetch(importUrl, {
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
        void refreshTelecallerLeads();
      } else {
        const hint = typeof d?.hint === "string" ? d.hint : "";
        setImportResult({
          type: "error",
          msg: [d.error, hint].filter(Boolean).join(" - ") || "Import failed.",
        });
      }
    } catch {
      setImportResult({ type: "error", msg: "Network error. Please try again." });
    } finally {
      importInFlightRef.current = false;
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

      {/* ── Import Leads Modal (shared: admin + telecaller) ── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md border border-gray-200 bg-white text-gray-600">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Import Leads</h2>
                  <p className="text-gray-500 text-xs">Upload a .csv or .xlsx file to bulk-add leads</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowImport(false)} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {/* ── Meta fields ── */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                    Campaign Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={importCampaign}
                    onChange={(e) => setImportCampaign(e.target.value)}
                    placeholder="e.g. March Walk-In Drive"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                    Source <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={importSource}
                    onChange={(e) => setImportSource(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all appearance-none bg-white"
                  >
                    <option value="">Select source</option>
                    {importSources.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Date</label>
                  <input
                    type="date"
                    value={importDate}
                    onChange={(e) => setImportDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all"
                  />
                </div>
              </div>

              {/* ── Lead Type ── */}
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                  Enquiry Lead Status <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setImportLeadType("fresh")}
                    className={`relative flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                      importLeadType === "fresh"
                        ? "border-gray-900 bg-gray-50 ring-1 ring-gray-900"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${importLeadType === "fresh" ? "bg-gray-200" : "bg-gray-100"}`}>
                      <UserPlus size={16} className={importLeadType === "fresh" ? "text-gray-800" : "text-gray-400"} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${importLeadType === "fresh" ? "text-gray-900" : "text-gray-700"}`}>Fresh Leads</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Open / needs follow-up</p>
                    </div>
                    <div className={`absolute top-3 right-3 w-4 h-4 rounded-full border-2 flex items-center justify-center ${importLeadType === "fresh" ? "border-gray-900 bg-gray-900" : "border-gray-300"}`}>
                      {importLeadType === "fresh" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportLeadType("cold")}
                    className={`relative flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                      importLeadType === "cold"
                        ? "border-gray-900 bg-gray-50 ring-1 ring-gray-900"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${importLeadType === "cold" ? "bg-gray-200" : "bg-gray-100"}`}>
                      <Flame size={16} className={importLeadType === "cold" ? "text-gray-700" : "text-gray-400"} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${importLeadType === "cold" ? "text-gray-900" : "text-gray-700"}`}>Cold Leads</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Low interest / not reachable</p>
                    </div>
                    <div className={`absolute top-3 right-3 w-4 h-4 rounded-full border-2 flex items-center justify-center ${importLeadType === "cold" ? "border-gray-900 bg-gray-900" : "border-gray-300"}`}>
                      {importLeadType === "cold" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                </div>
                <p className="text-[11px] mt-2 text-gray-500">
                  {importLeadType === "fresh"
                    ? "Leads will be marked as Open/Unassigned and counted in Fresh Leads."
                    : "Leads will be marked as Cold and counted in the Cold section."}
                </p>
              </div>

              {/* ── File Upload ── */}
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                  Upload File <span className="text-red-500">*</span>
                </label>
                <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all group">
                  <div className="p-3 bg-gray-100 rounded-md group-hover:bg-gray-200 transition-colors">
                    <Upload size={22} className="text-gray-500 group-hover:text-gray-700 transition-colors" />
                  </div>
                  {importFileName ? (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-900">{importFileName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{importPreview.length} rows detected - click to change</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-700">Click to upload or drag & drop</p>
                      <p className="text-xs text-gray-400 mt-0.5">Supports .xlsx, .xls, .csv files</p>
                    </div>
                  )}
                  <input ref={importFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileSelect} />
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
                    <span key={col} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${note ? "bg-gray-100 text-gray-800 border-gray-300" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                      {col}
                      {note && <span className="text-[10px] text-gray-500 font-semibold">{note}</span>}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-2">Column names are case-insensitive. Extra columns are ignored.</p>
              </div>

              {/* ── Preview table ── */}
              {importPreview.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                    Preview - {importPreview.length} rows
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
                <button type="button" onClick={() => setShowImport(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importLoading || importPreview.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
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

      {/* Page Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {isAdmin ? "Admin overview" : "Dashboard"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back, {session?.user?.name} - {branding.companyName}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
        {isAdmin && (
          <>
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
            <button
              type="button"
              onClick={() => { setShowImport(true); setImportResult(null); setImportLeadType("fresh"); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
            >
              <Upload size={13} />
              Import Leads
            </button>
            {showDashboardLayoutTools && (
              <button
                type="button"
                onClick={() => setDashboardLayoutEdit((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  dashboardLayoutEdit
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
                title="Drag sections by the grip to reorder. Your layout is saved for this account."
              >
                <LayoutGrid size={13} />
                {dashboardLayoutEdit ? "Done arranging" : "Arrange layout"}
              </button>
            )}
            <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 border border-gray-200">
              Super Admin
            </span>
          </>
        )}
        {!isAdmin && showDashboardLayoutTools && (
            <button
              type="button"
              onClick={() => setDashboardLayoutEdit((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                dashboardLayoutEdit
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
              title="Drag sections by the grip to reorder. Saved per user and role."
            >
              <LayoutGrid size={13} />
              {dashboardLayoutEdit ? "Done arranging" : "Arrange layout"}
            </button>
        )}
        </div>
      </div>

      {session &&
        !isAdmin &&
        !isOtherDashboardRole &&
        hasPermission(userPermissions, "inventory", role) &&
        showDw("staff_inventory_summary") && (
        <div className="mb-6">
          <InventorySummaryWidgets />
        </div>
      )}

      {isAdmin && !loading && !data && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-medium">Analytics could not be loaded.</p>
          <p className="text-amber-800/90 mt-1 text-xs">Check your connection or try refreshing the page.</p>
        </div>
      )}

      {isAdmin && data && (() => {
        const leadsBySource = [...(data.leadsBySource ?? [])].sort((a, b) => b.count - a.count);
        const studentsByStage = [...(data.studentsByStage ?? [])].sort((a, b) => b.count - a.count);
        const applicationsByCountry = [...(data.applicationsByCountry ?? [])].sort((a, b) => b.count - a.count);
        const applicationsByStatus = [...(data.applicationsByStatus ?? [])].sort((a, b) => b.count - a.count);
        const standingTotal = Math.max(1, data.leadsByStatus.reduce((sum, x) => sum + x.count, 0));
        const maxSrc = Math.max(1, ...leadsBySource.map((x) => x.count), 0);
        const maxStage = Math.max(1, ...studentsByStage.map((x) => x.count), 0);
        const maxCountry = Math.max(1, ...applicationsByCountry.map((x) => x.count), 0);
        const maxAppSt = Math.max(1, ...applicationsByStatus.map((x) => x.count), 0);

        const orderedAdmin = resolveOrderedWidgetIds("super_admin", dashboardWidgetToggles, dashboardWidgetOrder);
        const adminChunks = buildAdminDashboardChunks(orderedAdmin);

        const renderAdminChart = (chartId: AdminChartWidgetId) => {
          if (chartId === "admin_leads_by_source") {
            return (
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-md border border-gray-200 bg-gray-50">
                    <Users size={14} className="text-gray-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Leads by source</h3>
                    <p className="text-[11px] text-gray-500">Top channels in this period</p>
                  </div>
                </div>
                {leadsBySource.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No lead source data</p>
                ) : (
                  <div className="space-y-3">
                    {leadsBySource.slice(0, 6).map((row) => (
                      <div key={String(row._id)}>
                        <div className="flex justify-between gap-2 text-xs mb-1">
                          <span className="text-gray-600 truncate">{humanizeAnalyticsKey(String(row._id))}</span>
                          <span className="font-medium text-gray-900 tabular-nums shrink-0">{row.count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-800 rounded-full transition-all" style={{ width: `${(row.count / maxSrc) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          if (chartId === "admin_students_by_stage") {
            return (
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-md border border-gray-200 bg-gray-50">
                    <GraduationCap size={14} className="text-gray-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Students by stage</h3>
                    <p className="text-[11px] text-gray-500">Pipeline distribution</p>
                  </div>
                </div>
                {studentsByStage.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No student stage data</p>
                ) : (
                  <div className="space-y-3">
                    {studentsByStage.slice(0, 6).map((row) => (
                      <div key={String(row._id)}>
                        <div className="flex justify-between gap-2 text-xs mb-1">
                          <span className="text-gray-600 truncate">{humanizeAnalyticsKey(String(row._id))}</span>
                          <span className="font-medium text-gray-900 tabular-nums shrink-0">{row.count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-700 rounded-full transition-all" style={{ width: `${(row.count / maxStage) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-md border border-gray-200 bg-gray-50">
                  <Globe2 size={14} className="text-gray-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Applications by country</h3>
                  <p className="text-[11px] text-gray-500">Top destinations</p>
                </div>
              </div>
              {applicationsByCountry.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No country data</p>
              ) : (
                <div className="space-y-3">
                  {applicationsByCountry.slice(0, 6).map((row) => (
                    <div key={String(row._id)}>
                      <div className="flex justify-between gap-2 text-xs mb-1">
                        <span className="text-gray-600 truncate">{humanizeAnalyticsKey(String(row._id))}</span>
                        <span className="font-medium text-gray-900 tabular-nums shrink-0">{row.count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-600 rounded-full transition-all" style={{ width: `${(row.count / maxCountry) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        };

        const renderAdminActivity = () => (
            <div className="bg-white border border-gray-200 rounded-lg flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-200 bg-gray-50/80">
                <Activity size={15} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Recent activity</h2>
              </div>
              {data.recentActivity.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-gray-400 flex-1">No activity in this period</div>
              ) : (
                <div className="divide-y divide-gray-100 flex-1">
                  {data.recentActivity.map((log) => (
                    <div key={log._id} className="flex items-start justify-between gap-3 px-5 py-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0 mt-1.5" />
                        <p className="text-sm text-gray-700 leading-snug">
                          <span className="font-medium text-gray-900">{log.userName}</span>
                          {" "}
                          <span className="text-gray-500 capitalize">{log.action.toLowerCase()}</span>
                          {" "}
                          <span className="text-gray-800">{log.targetName}</span>
                          <span className="text-gray-400"> · {log.module}</span>
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 tabular-nums">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
        );

        const renderAdminNotifications = () => (
            <div className="bg-white border border-gray-200 rounded-lg flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50/80">
                <div className="flex items-center gap-2">
                  <Bell size={15} className="text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
                  {notifs.filter((n) => !n.read).length > 0 && (
                    <span className="text-[10px] font-semibold bg-gray-900 text-white px-1.5 py-0.5 rounded">
                      {notifs.filter((n) => !n.read).length} new
                    </span>
                  )}
                </div>
              </div>
              {notifs.length === 0 ? (
                <div className="px-5 py-12 text-center flex-1">
                  <Bell size={22} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 flex-1">
                  {notifs.map((n) => (
                    <div key={n._id} className={`px-5 py-3.5 flex items-start gap-3 ${n.read ? "" : "bg-gray-50"}`}>
                      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-gray-200" : "bg-gray-900"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900">{n.title}</p>
                          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 tabular-nums">{formatDateTime(n.createdAt)}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                        {n.link && (
                          <Link href={n.link} className="text-xs font-medium text-gray-700 hover:text-gray-900 mt-1 inline-block">
                            Open →
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
        );

        const renderAdminKpiCard = (kid: AdminKpiCardId): ReactNode => {
          const cardClass =
            "group flex h-full min-h-[9.5rem] w-full min-w-0 flex-col bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all";
          if (kid === "admin_kpi_total_leads") {
            return (
              <Link href="/leads" className={cardClass}>
                <div className="flex items-start justify-between shrink-0 mb-3">
                  <div className="p-2 bg-gray-50 border border-gray-200 rounded-md">
                    <Users size={16} className="text-gray-600" />
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                </div>
                <p className="text-2xl font-semibold text-gray-900 tracking-tight tabular-nums shrink-0">{data.summary.totalLeads}</p>
                <div className="mt-auto pt-3 space-y-0.5">
                  <p className="text-xs font-medium text-gray-700 leading-snug">Total leads</p>
                  <p className="text-xs text-gray-500 leading-snug line-clamp-2">
                    {data.summary.convertedLeads} converted to students
                  </p>
                </div>
              </Link>
            );
          }
          if (kid === "admin_kpi_students") {
            return (
              <Link href="/students" className={cardClass}>
                <div className="flex items-start justify-between shrink-0 mb-3">
                  <div className="p-2 bg-gray-50 border border-gray-200 rounded-md">
                    <UserCheck size={16} className="text-gray-600" />
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                </div>
                <p className="text-2xl font-semibold text-gray-900 tracking-tight tabular-nums shrink-0">{data.summary.totalStudents}</p>
                <div className="mt-auto pt-3 space-y-0.5">
                  <p className="text-xs font-medium text-gray-700 leading-snug">Students</p>
                  <p className="text-xs text-gray-500 leading-snug line-clamp-2">Records in selected period</p>
                </div>
              </Link>
            );
          }
          if (kid === "admin_kpi_applications") {
            return (
              <Link href="/applications" className={cardClass}>
                <div className="flex items-start justify-between shrink-0 mb-3">
                  <div className="p-2 bg-gray-50 border border-gray-200 rounded-md">
                    <FileText size={16} className="text-gray-600" />
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                </div>
                <p className="text-2xl font-semibold text-gray-900 tracking-tight tabular-nums shrink-0">{data.summary.totalApplications}</p>
                <div className="mt-auto pt-3 space-y-0.5">
                  <p className="text-xs font-medium text-gray-700 leading-snug">Applications</p>
                  <p className="text-xs text-gray-500 leading-snug line-clamp-2">Submitted in period</p>
                </div>
              </Link>
            );
          }
          if (kid === "admin_kpi_conversion") {
            return (
              <Link href="/reports" className={cardClass}>
                <div className="flex items-start justify-between shrink-0 mb-3">
                  <div className="p-2 bg-gray-50 border border-gray-200 rounded-md">
                    <TrendingUp size={16} className="text-gray-600" />
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                </div>
                <p className="text-2xl font-semibold text-gray-900 tracking-tight tabular-nums shrink-0">{data.summary.conversionRate}%</p>
                <div className="mt-auto pt-3 space-y-0.5">
                  <p className="text-xs font-medium text-gray-700 leading-snug">Conversion rate</p>
                  <p className="text-xs text-gray-500 leading-snug line-clamp-2">Leads → students</p>
                </div>
              </Link>
            );
          }
          if (kid === "admin_kpi_counselled") {
            return (
              <Link href="/reports" className={cardClass}>
                <div className="flex items-start justify-between shrink-0 mb-3">
                  <div className="p-2 bg-gray-50 border border-gray-200 rounded-md">
                    <Clock size={16} className="text-gray-600" />
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1" />
                </div>
                <p className="text-2xl font-semibold text-gray-900 tracking-tight tabular-nums shrink-0">{data.summary.leadsCounselled ?? 0}</p>
                <div className="mt-auto pt-3 space-y-0.5">
                  <p className="text-xs font-medium text-gray-700 leading-snug">Counselled</p>
                  <p className="text-xs text-gray-500 leading-snug line-clamp-2">Counselled / phone counselling in period</p>
                </div>
              </Link>
            );
          }
          return null;
        };

        const renderAdminSingle = (id: string): ReactNode => {
          if (id === "admin_pipeline") {
            return (
          <div className="w-full">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Admissions &amp; visa pipeline</h3>
            <div className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-stretch">
              {[
                { label: "GS applied", value: data.summary.gsApplied, sub: "Genuine student", icon: FilePlus2 },
                { label: "COE received", value: data.summary.coeReceived, sub: "Enrollment", icon: BadgeCheck },
                { label: "Conditional", value: data.summary.conditionalOffers, sub: "Offers", icon: Clock },
                { label: "Unconditional", value: data.summary.unconditionalOffers, sub: "Offers", icon: CheckCircle2 },
                { label: "Visa lodged", value: data.summary.visaLodged, sub: "Submitted", icon: PlaneTakeoff },
                { label: "Granted", value: data.summary.granted, sub: "Approved", icon: Award },
                { label: "Rejected", value: data.summary.rejected, sub: "Visa", icon: XCircle },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className="flex h-full min-h-[7.5rem] w-full min-w-0 max-w-full flex-col gap-2 bg-white border border-gray-200 rounded-lg p-3 sm:p-4 overflow-hidden"
                  >
                    <div className="w-8 h-8 shrink-0 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center">
                      <Icon size={15} className={card.label === "Rejected" ? "text-red-600" : "text-gray-600"} />
                    </div>
                    <p className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight tabular-nums shrink-0">{card.value}</p>
                    <div className="mt-auto space-y-0.5 min-w-0">
                      <p className="text-[11px] sm:text-xs font-medium text-gray-800 leading-tight line-clamp-2 break-words">{card.label}</p>
                      <p className="text-[10px] sm:text-[11px] text-gray-500 leading-tight line-clamp-2 break-words">{card.sub}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
            );
          }
          if (id === "admin_application_status" && applicationsByStatus.length > 0) {
            return (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-md border border-gray-200 bg-gray-50">
                  <FileText size={14} className="text-gray-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Applications by status</h3>
                  <p className="text-[11px] text-gray-500">Outcomes in period</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {applicationsByStatus.map((row) => (
                  <div key={String(row._id)} className="border border-gray-200 rounded-md px-3 py-2.5 bg-gray-50/50">
                    <p className="text-lg font-semibold text-gray-900 tabular-nums">{row.count}</p>
                    <p className="text-[11px] text-gray-600 mt-0.5 leading-tight">{humanizeAnalyticsKey(String(row._id))}</p>
                    <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-800 rounded-full" style={{ width: `${(row.count / maxAppSt) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            );
          }
          if (id === "admin_recent_targets") {
            return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50/80">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Recent leads</h2>
                </div>
                <Link href="/leads" className="text-xs font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1">
                  View all <ChevronRight size={12} />
                </Link>
              </div>

              {data.recentLeads.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-gray-400">No leads in this period</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {data.recentLeads.map((lead) => (
                    <Link
                      key={lead._id}
                      href={`/leads/${lead._id}`}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-gray-700">
                            {lead.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {lead.source ? `${lead.source} · ` : ""}{lead.interestedCountry || "-"}
                            {lead.branch?.name ? ` · ${lead.branch.name}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {lead.status && (() => {
                          const { label, colorClass } = resolveFdStatusPresentation(fdStatusOptions, lead.status);
                          return (
                            <span
                              className={`hidden sm:inline text-[10px] px-2 py-0.5 rounded max-w-[7rem] truncate font-medium ${colorClass}`}
                              title={label}
                            >
                              {label}
                            </span>
                          );
                        })()}
                        <CounselledTimeInline statusDates={lead.statusDates} />
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium border border-transparent ${getStatusColor(lead.standing)}`}>
                          {STATUS_LABELS[lead.standing] ?? lead.standing}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-200 bg-gray-50/80">
                <Target size={15} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Counsellor targets</h2>
              </div>

              {data.counsellorPerformance.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-gray-400 flex-1">No active counsellors</div>
              ) : (
                <div className="px-5 py-4 space-y-5 flex-1">
                  {data.counsellorPerformance.map((c) => {
                    const pct = c.target > 0
                      ? Math.min(100, Math.round((c.currentCount / c.target) * 100))
                      : 0;
                    const isComplete = pct >= 100;
                    return (
                      <div key={c._id}>
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                            {c.branch?.name && (
                              <p className="text-xs text-gray-500 truncate">{c.branch.name}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 tabular-nums">
                            <span className="text-sm font-semibold text-gray-900">{c.currentCount}</span>
                            <span className="text-xs text-gray-500">/{c.target}</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full transition-all ${isComplete ? "bg-gray-900" : "bg-gray-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{pct}% of monthly target</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
            );
          }
          if (id === "admin_lead_standing" && data.leadsByStatus.length > 0) {
            return (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50/80">
                <div className="flex items-center gap-2">
                  <ArrowUp size={15} className="text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Lead standing distribution</h2>
                </div>
                <span className="text-xs text-gray-500 tabular-nums">{standingTotal} leads</span>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
                  {data.leadsByStatus.map((s, i, arr) => (
                    <div
                      key={s._id}
                      className={`h-full min-w-0 bg-gray-800 ${i === 0 ? "rounded-l-full" : ""} ${i === arr.length - 1 ? "rounded-r-full" : ""}`}
                      style={{ width: `${(s.count / standingTotal) * 100}%` }}
                      title={`${STATUS_LABELS[s._id] ?? s._id}: ${s.count}`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {data.leadsByStatus.map((s) => (
                    <div key={s._id} className="border border-gray-200 rounded-md px-3 py-2.5 text-center bg-gray-50/30">
                      <p className="text-lg font-semibold text-gray-900 tabular-nums">{s.count}</p>
                      <p className="text-[11px] text-gray-600 mt-0.5">
                        {STATUS_LABELS[s._id] ?? humanizeAnalyticsKey(String(s._id))}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                        {Math.round((s.count / standingTotal) * 100)}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            );
          }
          if (id === "admin_activity") return renderAdminActivity();
          if (id === "admin_notifications") return renderAdminNotifications();
          return null;
        };

        const layoutEditActive = showDashboardLayoutTools && dashboardLayoutEdit;

        const wrapAdminSection = (chunk: AdminDashboardChunk, chunkIdx: number, inner: ReactNode) => (
          <div
            key={chunkStableKey(chunk, chunkIdx)}
            className={`relative rounded-xl ${layoutEditActive ? "pl-10 ring-1 ring-dashed ring-blue-300/90 bg-blue-50/20" : ""}`}
            onDragOver={
              layoutEditActive
                ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }
                : undefined
            }
            onDrop={
              layoutEditActive
                ? (e) => {
                    e.preventDefault();
                    const from = parseInt(e.dataTransfer.getData(DASHBOARD_DND_MIME), 10);
                    if (Number.isNaN(from)) return;
                    reorderAdminDashboardChunks(from, chunkIdx);
                  }
                : undefined
            }
          >
            {layoutEditActive && (
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DASHBOARD_DND_MIME, String(chunkIdx));
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="absolute left-0 top-3 z-10 flex h-9 w-8 cursor-grab items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 active:cursor-grabbing"
                aria-label="Drag to reorder section"
                title="Drag to reorder"
              >
                <GripVertical size={16} />
              </div>
            )}
            {inner}
          </div>
        );

        return (
        <div className={`space-y-6 transition-opacity duration-200 ${refetching ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
          {adminChunks.map((chunk, chunkIdx) => {
            if (chunk.type === "charts") {
              const grid =
                chunk.ids.length >= 3 ? "lg:grid-cols-3" : chunk.ids.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1";
              return wrapAdminSection(
                chunk,
                chunkIdx,
                <div className={`grid grid-cols-1 gap-4 ${grid}`}>
                  {chunk.ids.map((cid) => (
                    <Fragment key={cid}>{renderAdminChart(cid)}</Fragment>
                  ))}
                </div>
              );
            }
            if (chunk.type === "kpis") {
              const kpiEdit = layoutEditActive;
              return wrapAdminSection(
                chunk,
                chunkIdx,
                <div className="grid w-full grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-stretch">
                  {chunk.ids.map((kid, ki) => {
                    const inner = renderAdminKpiCard(kid);
                    if (!inner) return null;
                    return (
                      <div
                        key={kid}
                        className={`relative min-w-0 ${kpiEdit ? "pl-9" : ""}`}
                        onDragOver={
                          kpiEdit
                            ? (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = "move";
                              }
                            : undefined
                        }
                        onDrop={
                          kpiEdit
                            ? (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const raw = e.dataTransfer.getData(DASHBOARD_KPI_DND_MIME);
                                const parts = raw.split(":");
                                if (parts.length !== 2) return;
                                const cIdx = parseInt(parts[0]!, 10);
                                const fromIdx = parseInt(parts[1]!, 10);
                                if (Number.isNaN(cIdx) || Number.isNaN(fromIdx) || cIdx !== chunkIdx) return;
                                reorderAdminKpiCards(chunkIdx, fromIdx, ki);
                              }
                            : undefined
                        }
                      >
                        {kpiEdit && (
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.setData(DASHBOARD_KPI_DND_MIME, `${chunkIdx}:${ki}`);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            className="absolute left-0 top-3 z-10 flex h-8 w-7 cursor-grab items-center justify-center rounded-md border border-blue-200 bg-white text-blue-600 shadow-sm hover:bg-blue-50 active:cursor-grabbing"
                            aria-label="Drag to reorder KPI card"
                            title="Reorder card in row"
                          >
                            <GripVertical size={14} />
                          </div>
                        )}
                        {inner}
                      </div>
                    );
                  })}
                </div>
              );
            }
            if (chunk.type === "twin") {
              return wrapAdminSection(
                chunk,
                chunkIdx,
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    {chunk.leftId === "admin_activity" ? renderAdminActivity() : renderAdminNotifications()}
                  </div>
                  <div>
                    {chunk.rightId === "admin_activity" ? renderAdminActivity() : renderAdminNotifications()}
                  </div>
                </div>
              );
            }
            const node = renderAdminSingle(chunk.id);
            return node ? wrapAdminSection(chunk, chunkIdx, node) : null;
          })}
        </div>
        );
      })()}

      {/* Non-admin quick links */}
      {!isAdmin && (
        <>
          {isOtherDashboardRole && (
            <div className="space-y-6">
              {resolveOrderedWidgetIds("other", dashboardWidgetToggles, dashboardWidgetOrder).map((wid, idx) => {
                let block: ReactNode = null;
                if (
                  wid === "staff_inventory_summary" &&
                  hasPermission(userPermissions, "inventory", role) &&
                  showDw("staff_inventory_summary")
                ) {
                  block = <InventorySummaryWidgets />;
                } else if (wid === "generic_quick_links" && showDw("generic_quick_links")) {
                  block = (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { label: "Leads", href: "/leads", module: "leads", icon: Users, desc: "View and manage your assigned leads" },
                        { label: "Students", href: "/students", module: "students", icon: UserCheck, desc: "Track your student progress" },
                      ]
                        .filter((item) => hasPermission(userPermissions, item.module, role))
                        .map((item) => {
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
                  );
                }
                return wrapDraggableSection("other", idx, wid, block);
              })}
            </div>
          )}

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

                {showDw("counsellor_summary") && (
                <>
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
                      <span className="font-semibold text-gray-900">{ooc} lead{ooc > 1 ? "s" : ""}</span> marked as <span className="font-medium">Out of Contact</span> - consider re-engaging.
                    </p>
                    <Link href="/leads" className="ml-auto text-xs text-blue-600 hover:underline whitespace-nowrap">View →</Link>
                  </div>
                )}
                </>
                )}

                {(showDw("counsellor_leads_list") || showDw("counsellor_notifications") || showDw("counsellor_remarks")) && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                  {showDw("counsellor_leads_list") && (
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
                              <CounselledTimeInline statusDates={lead.statusDates} />
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
                  )}

                  {(showDw("counsellor_notifications") || showDw("counsellor_remarks")) && (
                  <div
                    className={`space-y-5 ${
                      showDw("counsellor_leads_list") ? "lg:col-span-2" : "lg:col-span-5"
                    }`}
                  >
                    {showDw("counsellor_notifications") && (
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
                    )}

                    {showDw("counsellor_remarks") && (
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
                    )}
                  </div>
                  )}

                </div>
                )}
              </div>
            );
          })()}

          {/* Front Desk Dashboard */}
          {isFrontDesk && (
            <div className="space-y-5">
              {showDw("front_desk_stats") && (
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
              )}


            </div>
          )}

          {/* Admission Team Dashboard */}
          {isAdmissionTeam && admissionStats && (
            <div className="space-y-5">
              {showDw("admission_dashboard") && (
              <>
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
              </>
              )}
            </div>
          )}

          {/* ── Telecaller Dashboard ── */}
          {isTelecaller && (() => {
            const today = new Date().toDateString();
            const leads = assignedLeads;
            const ot = telecallerOverviewTotals;

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

            const teleOrder = resolveOrderedWidgetIds("telecaller", dashboardWidgetToggles, dashboardWidgetOrder);

            return (
              <div className="space-y-6">
                {teleOrder.map((tid, idx) => {
                  let block: ReactNode = null;
                  if (tid === "telecaller_header" && showDw("telecaller_header")) {
                    block = (
                <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-md border border-gray-200 bg-gray-50 text-gray-600">
                        <Phone size={20} />
                      </div>
                      <div>
                        <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Telecaller dashboard</h1>
                        <p className="text-sm text-gray-500 mt-0.5">{session?.user?.name}</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="text-left sm:text-right">
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Today</p>
                        <p className="text-sm font-medium text-gray-900 tabular-nums">
                          {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setShowImport(true); setImportResult(null); setImportLeadType("fresh"); }}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                      >
                        <Upload size={15} />
                        Import leads
                      </button>
                    </div>
                  </div>
                </div>
                    );
                  } else if (tid === "telecaller_today_targets" && showDw("telecaller_today_targets")) {
                    block = (
                <div>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Today&apos;s targets</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { label: "Calls made today", value: callsMadeToday, target: 200, icon: Phone },
                      { label: "Appointments booked", value: appointmentToday, target: 10, icon: CalendarCheck },
                      { label: "Phone counselling", value: phoneCounsellingToday, target: 25, icon: PhoneCall },
                    ].map((t) => {
                      const Icon = t.icon;
                      const p = pct(t.value, t.target);
                      const done = p >= 100;
                      return (
                        <div key={t.label} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                          <div className="flex items-start justify-between mb-4">
                            <div className="p-2 rounded-md border border-gray-200 bg-gray-50 text-gray-600">
                              <Icon size={18} />
                            </div>
                            <div className="text-right tabular-nums">
                              <span className="text-2xl font-semibold text-gray-900">{t.value}</span>
                              <span className="text-sm text-gray-400 font-normal"> / {t.target}</span>
                            </div>
                          </div>
                          <p className="text-sm font-medium text-gray-800 mb-3">{t.label}</p>
                          <div className="w-full bg-gray-100 rounded h-1.5 mb-2 overflow-hidden">
                            <div
                              className="h-1.5 rounded bg-gray-800 transition-all duration-500"
                              style={{ width: `${p}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-medium ${done ? "text-gray-700" : "text-gray-500"}`}>{p}% of target</span>
                            {done
                              ? <span className="text-gray-600 font-medium">Target met</span>
                              : <span className="text-gray-400">{Math.max(0, t.target - t.value)} remaining</span>
                            }
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                    );
                  } else if (tid === "telecaller_overview_primary" && showDw("telecaller_overview_primary")) {
                    block = (
                <div>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Lead overview</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      { label: "Total enquiry", value: ot.totalEnquiry, icon: Users, sub: "All enquiries (telecaller pool)", href: "/enquiries" as const },
                      { label: "Fresh leads", value: ot.fresh, icon: UserPlus, sub: "New & pending contact", href: `/enquiries?bucket=${TELECALLER_FRESH_BUCKET}` as const },
                      { label: "Transferred", value: ot.transferred, icon: RefreshCw, sub: "Moved to counsellor", href: `/enquiries?bucket=${TELECALLER_OVERVIEW_TRANSFERRED}` as const },
                      { label: "Appointment", value: ot.appointment, icon: CalendarCheck, sub: "Counselling scheduled", href: `/enquiries?bucket=${TELECALLER_OVERVIEW_APPOINTMENT}` as const },
                    ] as const).map((s) => {
                      const Icon = s.icon;
                      return (
                        <Link
                          key={s.label}
                          href={s.href}
                          className="bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <Icon size={16} className="text-gray-400" />
                          </div>
                          <p className="text-2xl font-semibold text-gray-900 tabular-nums tracking-tight">{s.value}</p>
                          <p className="text-sm font-medium text-gray-800 mt-1">{s.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
                    );
                  } else if (tid === "telecaller_overview_secondary" && showDw("telecaller_overview_secondary")) {
                    block = (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Phone counselling", value: ot.phoneCounselling, icon: PhoneCall, sub: "Counselled over phone", href: `/enquiries?bucket=${TELECALLER_OVERVIEW_PHONE_COUNSELLING}` as const },
                    { label: "Online enrollment", value: ot.onlineEnrollment, icon: Wifi, sub: "Registered & completed", href: `/enquiries?bucket=${TELECALLER_OVERVIEW_ONLINE_ENROLLMENT}` as const },
                    { label: "Cold", value: ot.cold, icon: Flame, sub: "Low interest / cold", href: `/enquiries?bucket=${TELECALLER_OVERVIEW_COLD}` as const },
                    { label: "CNR / engaged", value: ot.cnr, icon: PhoneMissed, sub: "Not reachable / busy", href: `/enquiries?bucket=${TELECALLER_OVERVIEW_CNR}` as const },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <Link
                        key={s.label}
                        href={s.href}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all flex flex-col gap-3"
                      >
                        <div className="w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center bg-gray-50 text-gray-600">
                          <Icon size={15} />
                        </div>
                        <div>
                          <p className="text-xl font-semibold text-gray-900 tabular-nums tracking-tight">{s.value}</p>
                          <p className="text-xs font-medium text-gray-700 mt-0.5">{s.label}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{s.sub}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                    );
                  } else if (tid === "telecaller_recent_leads" && showDw("telecaller_recent_leads")) {
                    block = (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md border border-gray-200 bg-white text-gray-600">
                        <Users size={14} />
                      </div>
                      <h2 className="text-sm font-semibold text-gray-900">Recent assigned leads</h2>
                      <span className="text-[11px] font-medium bg-white text-gray-600 px-2 py-0.5 rounded border border-gray-200 tabular-nums">{ot.totalEnquiry}</span>
                    </div>
                    <Link href="/enquiries" className="text-xs font-medium text-gray-700 hover:text-gray-900 flex items-center gap-1">
                      View all <ChevronRight size={12} />
                    </Link>
                  </div>
                  {leads.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                        <Users size={20} className="text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-500">No leads assigned yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {leads.slice(0, 8).map((lead) => {
                        const standingStyle: Record<string, string> = {
                          hot: "bg-gray-100 text-gray-800 border-gray-200",
                          warm: "bg-gray-100 text-gray-800 border-gray-200",
                          heated: "bg-gray-100 text-gray-800 border-gray-200",
                          cold: "bg-gray-100 text-gray-700 border-gray-200",
                          missed: "bg-gray-50 text-gray-500 border-gray-200",
                        };
                        return (
                          <Link key={lead._id} href={`/enquiries/${lead._id}`}
                            className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 border border-gray-300">
                              <span className="text-xs font-semibold text-gray-700">{lead.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                              <p className="text-xs text-gray-500 truncate">
                                {lead.phone}{lead.interestedCountry ? ` · ${lead.interestedCountry}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {lead.status && (() => {
                                const { label, colorClass } = resolveFdStatusPresentation(fdStatusOptions, lead.status);
                                return (
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded font-medium max-w-28 truncate ${colorClass}`}
                                    title={label}
                                  >
                                    {label}
                                  </span>
                                );
                              })()}
                              <span className={`text-xs px-2 py-0.5 rounded border font-medium ${standingStyle[lead.standing] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
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
                    <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
                      <Link href="/enquiries" className="text-xs text-gray-700 hover:text-gray-900 font-medium">
                        + {leads.length - 8} more leads
                      </Link>
                    </div>
                  )}
                </div>
                    );
                  }
                  return wrapDraggableSection("telecaller", idx, tid, block);
                })}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
