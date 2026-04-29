"use client";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, Search, X, Users, Paperclip, FileText, Trash2, ChevronDown, MessageSquare, MoreVertical, Phone, Mail, Calendar, FileSpreadsheet } from "lucide-react";
import {
  formatDate,
  getStatusColor,
  COUNTRIES,
  SERVICES,
  LEAD_STAGES,
  LEAD_STAGE_GROUPS,
  getLeadStageColor,
  getLeadStageDotColor,
  hasModuleAction,
} from "@/lib/utils";
import { isOrgWideAdmin } from "@/lib/roleGuards";

const DEFAULT_COUNTRIES = COUNTRIES;
import { ILead, LeadSource, LeadStanding } from "@/types";
import Link from "next/link";
import { useBranding } from "@/app/branding-context";
import { TELECALLER_FRESH_BUCKET } from "@/lib/telecallerFreshLeads";
import {
  isTelecallerOverviewDashboardBucket,
  TELECALLER_OVERVIEW_BUCKET_LABEL,
} from "@/lib/telecallerLeadOverviewBuckets";
import {
  DEFAULT_TELECALLER_TRANSFER_OUTCOMES,
  normalizeTelecallerTransferOutcomes,
  buildTelecallerTransferPatchFromOutcome,
} from "@/lib/telecallerTransferConfig";
import type { TelecallerTransferOutcome } from "@/types/telecallerTransfer";
import CounselledTimeInline from "@/components/CounselledTimeInline";
import {
  withLeadFilterDefaultFromTime,
  withLeadFilterDefaultToTime,
} from "@/lib/dateTimeRangeFilterDefaults";
import { fdWorkflowChoicesForPicker } from "@/lib/fdStatusOptions";
import { useFdStatusOptions } from "@/lib/useFdStatusOptions";
import { subscribeAppSettingsChanged } from "@/lib/appSettingsSync";
import { roleCanEditLeadFdStatus } from "@/lib/leadWorkflowStatusRoles";

const DEFAULT_SOURCES: { value: string; label: string }[] = [
  { value: "walk_in", label: "Walk-in" },
  { value: "capture_visit", label: "Capture Visit" },
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

const DEFAULT_STANDINGS = ["heated", "hot", "warm", "out_of_contact"];

type LeadFilterFacetResponse = {
  standings: string[];
  sources: string[];
  services: string[];
  stages: string[];
  academicYears: string[];
  applyLevels: string[];
  fdStatuses: string[];
  assignedToIds: string[];
  countries: string[];
};

const APPLY_LEVEL_FILTERS: { value: string; label: string }[] = [
  { value: "bachelor", label: "Bachelor" },
  { value: "master", label: "Master" },
  { value: "phd", label: "PhD" },
];

const FIELD_CLASS =
  "w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-colors";

const LABEL_CLASS = "block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide";
const REQUIRED_FORM_KEYS = new Set(["name", "phone", "source", "branch"]);

/** datetime-local value (no TZ) → UTC ISO for API (Mongo createdAt is UTC). */
function localDateTimeInputToUtcIsoParam(v: string): string {
  const ms = new Date(v.trim()).getTime();
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString();
}

function LeadsPageContent() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const isEnquiriesRoute = pathname.startsWith("/enquiries");
  const apiLeadsBase = isEnquiriesRoute ? "/api/enquiries" : "/api/leads";
  const leadsPathBase = isEnquiriesRoute ? "/enquiries" : "/leads";
  const searchParams = useSearchParams();
  const bucketFromUrl = searchParams.get("bucket");
  const isTelecallerFreshView = bucketFromUrl === TELECALLER_FRESH_BUCKET;
  const isTelecallerOverviewView =
    session?.user?.role === "telecaller" && isTelecallerOverviewDashboardBucket(bucketFromUrl);
  const telecallerBucketBanner =
    session?.user?.role === "telecaller" && (isTelecallerFreshView || isTelecallerOverviewView);
  const telecallerOverviewLabel =
    isTelecallerOverviewView && bucketFromUrl
      ? TELECALLER_OVERVIEW_BUCKET_LABEL[bucketFromUrl]
      : "";

  useEffect(() => {
    if (!session?.user) return;
    if (isEnquiriesRoute && session.user.role !== "telecaller" && !isOrgWideAdmin(session.user.role)) {
      router.replace("/dashboard");
    }
  }, [session?.user, isEnquiriesRoute, router]);

  /** Telecaller always uses Transfer + Update (same layout as fresh leads) for every list view. */
  const isTelecallerTransferTableView = session?.user?.role === "telecaller";
  const branding = useBranding();
  const [leads, setLeads] = useState<ILead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<ILead | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterService, setFilterService] = useState("");
  const [filterLeadStage, setFilterLeadStage] = useState("");
  const [filterAcademicYear, setFilterAcademicYear] = useState("");
  const [filterApplyLevel, setFilterApplyLevel] = useState("");
  const [filterFdStatus, setFilterFdStatus] = useState("");
  /** Cascading filter options for the current scope (from GET /api/leads/filter-meta). */
  const [filterFacetMeta, setFilterFacetMeta] = useState<LeadFilterFacetResponse | null>(null);
  /** Bumps when app settings save so filter facets refetch (e.g. new FD statuses). */
  const [filterFacetSettingsBump, setFilterFacetSettingsBump] = useState(0);
  /** Narrow lead stages to one pipeline group (UI only; API still uses stage value). */
  const [filterStageGroup, setFilterStageGroup] = useState("");
  const [branches, setBranches] = useState<{ _id: string; name: string }[]>([]);
  const [counsellors, setCounsellors] = useState<{ _id: string; name: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [assignCounsellorForLeadId, setAssignCounsellorForLeadId] = useState<string | null>(null);
  const [assignCounsellorUserId, setAssignCounsellorUserId] = useState("");
  /** Telecaller transfer UI (same table layout as other roles; action opens from row menu). */
  const [telecallerTransferModalLeadId, setTelecallerTransferModalLeadId] = useState<string | null>(null);
  const [telecallerFreshTransferChoice, setTelecallerFreshTransferChoice] = useState<Record<string, string>>({});
  const [telecallerFreshTransferCounsellor, setTelecallerFreshTransferCounsellor] = useState<Record<string, string>>({});
  const [telecallerTransferAppointmentDate, setTelecallerTransferAppointmentDate] = useState<Record<string, string>>({});
  const [telecallerFreshTransferUpdatingId, setTelecallerFreshTransferUpdatingId] = useState<string | null>(null);
  const [telecallerTransferOutcomes, setTelecallerTransferOutcomes] = useState<TelecallerTransferOutcome[]>(
    () => DEFAULT_TELECALLER_TRANSFER_OUTCOMES.map((o) => ({ ...o }))
  );

  // Dynamic settings from admin
  const [appSources, setAppSources] = useState(DEFAULT_SOURCES);
  const [appStandings, setAppStandings] = useState(DEFAULT_STANDINGS);
  const appFdStatuses = useFdStatusOptions();
  const [appLeadStages, setAppLeadStages] = useState(LEAD_STAGES);
  const [appStageGroups, setAppStageGroups] = useState(LEAD_STAGE_GROUPS);
  const [appCountries, setAppCountries] = useState<string[]>(DEFAULT_COUNTRIES);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", dateOfBirth: "",
    source: "walk_in" as LeadSource, interestedService: "",
    interestedCountry: "", branch: session?.user?.branch || "",
    standing: "warm" as LeadStanding, assignedTo: "", assignmentMethod: "manual",
    comments: "",
    status: "", stage: "",
    parentName: "", parentPhone1: "", parentPhone2: "",
    academicScore: "", academicInstitution: "", temporaryAddress: "", permanentAddress: "",
    examType: "", examScore: "", examJoinDate: "", examStartDate: "", examEndDate: "",
    examPaymentMethod: "", examEstimatedDate: "",
    gender: "", maritalStatus: "", nationality: "", passportNumber: "", visaExpiryDate: "",
    senderName: "",
    visitCaptured: false, visitedAt: "", visitPurpose: "",
    captureVisitEntries: [{ visitedAt: "", visitPurpose: "" }],
    appendCaptureVisit: false,
    academicYear: "", applyLevel: "", course: "", intakeYear: "", intakeQuarter: "",
  });

  const searchRef = useRef(search);
  searchRef.current = search;

  const appendLeadFilterParams = useCallback(
    (params: URLSearchParams, searchValue: string) => {
      const q = searchValue.trim();
      if (q) params.set("search", q);
      if (filterStatus) params.set("standing", filterStatus);
      if (filterCountry) params.set("country", filterCountry);
      if (filterAssignedTo) params.set("assignedTo", filterAssignedTo);
      if (filterSource) params.set("source", filterSource);
      if (filterDateFrom) {
        const iso = localDateTimeInputToUtcIsoParam(filterDateFrom);
        if (iso) params.set("from", iso);
      }
      if (filterDateTo) {
        const iso = localDateTimeInputToUtcIsoParam(filterDateTo);
        if (iso) params.set("to", iso);
      }
      if (filterService) params.set("service", filterService);
      if (filterLeadStage) params.set("stage", filterLeadStage);
      if (filterAcademicYear) params.set("academicYear", filterAcademicYear);
      if (filterApplyLevel) params.set("applyLevel", filterApplyLevel);
      if (filterFdStatus) params.set("status", filterFdStatus);
      const b = searchParams.get("bucket");
      if (b === TELECALLER_FRESH_BUCKET || isTelecallerOverviewDashboardBucket(b)) {
        params.set("bucket", b);
      }
    },
    [
      filterStatus,
      filterCountry,
      filterAssignedTo,
      filterSource,
      filterDateFrom,
      filterDateTo,
      filterService,
      filterLeadStage,
      filterAcademicYear,
      filterApplyLevel,
      filterFdStatus,
      searchParams,
    ]
  );

  const fetchLeads = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "50");
    appendLeadFilterParams(params, searchRef.current);
    const res = await fetch(`${apiLeadsBase}?${params}`, { cache: "no-store" });
    const data = await res.json();
    if (data && data.leads) {
      setLeads(data.leads);
      setTotalPages(data.pages ?? 1);
      setTotalLeads(data.total ?? 0);
      setCurrentPage(page);
    } else {
      setLeads(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, [
    filterStatus,
    filterCountry,
    filterAssignedTo,
    filterSource,
    filterDateFrom,
    filterDateTo,
    filterService,
    filterLeadStage,
    filterAcademicYear,
    filterApplyLevel,
    filterFdStatus,
    searchParams,
    apiLeadsBase,
    appendLeadFilterParams,
  ]);

  const fetchLeadsRef = useRef(fetchLeads);
  fetchLeadsRef.current = fetchLeads;

  // After session is ready: load settings, branches, counsellors (API scopes by org)
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/branches")
      .then((r) => (r.ok ? r.json() : []))
      .then((br) => setBranches(Array.isArray(br) ? br : []));
    fetch("/api/users?role=counsellor", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : []))
      .then((u) =>
        setCounsellors(
          Array.isArray(u)
            ? u.map((x: { _id: unknown; name?: string }) => ({
                _id: typeof x._id === "string" ? x._id : String(x._id),
                name: String(x.name ?? ""),
              }))
            : [],
        ),
      );
    fetch("/api/settings/app").then((r) => r.json()).then((d) => {
      if (d?.error) return;
      // Load dynamic lead config
      if (d?.leadSources?.length) {
        const normalized = d.leadSources.map((s: string) => ({
          value: s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
          label: s,
        }));
        const merged = [...DEFAULT_SOURCES];
        for (const src of normalized) {
          if (!merged.some((m) => m.value === src.value)) merged.push(src);
        }
        setAppSources(merged);
      } else {
        setAppSources(DEFAULT_SOURCES);
      }
      if (d?.leadStandings?.length) setAppStandings(d.leadStandings);
      if (d?.countries?.length) {
        setAppCountries(d.countries.map((c: string | { name: string }) => typeof c === "string" ? c : c.name));
      }
      if (d?.leadStages?.length) {
        setAppLeadStages(d.leadStages.map((s: { value: string; label: string; group: string }) => {
          const existing = LEAD_STAGES.find(ls => ls.value === s.value);
          return { value: s.value, label: s.label, color: existing?.color || "bg-gray-100 text-gray-700" };
        }));
      }
      if (d?.leadStageGroups?.length && d?.leadStages?.length) {
        const groupDots: Record<string, string> = {
          Application: "bg-amber-400", Offer: "bg-blue-400", GS: "bg-purple-400",
          COE: "bg-emerald-400", Visa: "bg-teal-400",
        };
        setAppStageGroups(d.leadStageGroups.map((g: string) => ({
          label: g,
          dot: groupDots[g] || "bg-gray-400",
          stages: d.leadStages.filter((s: { group: string }) => s.group === g).map((s: { value: string }) => s.value),
        })));
      }
      if (Array.isArray(d?.telecallerTransferOutcomes) && d.telecallerTransferOutcomes.length > 0) {
        setTelecallerTransferOutcomes(normalizeTelecallerTransferOutcomes(d.telecallerTransferOutcomes));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  useEffect(() => {
    const bump = () => setFilterFacetSettingsBump((n) => n + 1);
    return subscribeAppSettingsChanged(bump);
  }, []);

  // Refetch leads whenever any filter changes (also fires on initial mount)
  useEffect(() => {
    fetchLeads(1);
  }, [
    filterStatus,
    filterCountry,
    filterAssignedTo,
    filterSource,
    filterDateFrom,
    filterDateTo,
    filterService,
    filterLeadStage,
    filterAcademicYear,
    filterApplyLevel,
    filterFdStatus,
    searchParams.toString(),
    fetchLeads,
  ]);

  useEffect(() => {
    if (isEnquiriesRoute) {
      setFilterFacetMeta(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      appendLeadFilterParams(params, search);
      fetch(`/api/leads/filter-meta?${params}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data: LeadFilterFacetResponse & { error?: string }) => {
          if (cancelled || data?.error) return;
          if (
            Array.isArray(data.standings) &&
            Array.isArray(data.sources) &&
            Array.isArray(data.services)
          ) {
            setFilterFacetMeta(data);
          }
        })
        .catch(() => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isEnquiriesRoute, search, appendLeadFilterParams, filterFacetSettingsBump]);

  /** Debounced server search: name matches are sorted first on page 1 (see GET /api/leads). */
  const skipSearchEffectOnMount = useRef(true);
  useEffect(() => {
    if (!search.trim()) {
      if (skipSearchEffectOnMount.current) {
        skipSearchEffectOnMount.current = false;
        return;
      }
      fetchLeadsRef.current(1);
      return;
    }
    const t = setTimeout(() => fetchLeadsRef.current(1), 320);
    return () => clearTimeout(t);
  }, [search]);

  const clearFilters = () => {
    setFilterStatus("");
    setFilterCountry("");
    setFilterAssignedTo("");
    setFilterSource("");
    setFilterService("");
    setFilterLeadStage("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterAcademicYear("");
    setFilterApplyLevel("");
    setFilterFdStatus("");
    setFilterStageGroup("");
    const b = searchParams.get("bucket");
    if (b === TELECALLER_FRESH_BUCKET || isTelecallerOverviewDashboardBucket(b)) {
      router.replace(leadsPathBase);
    }
  };

  const activeFilterCount =
    [
      filterStatus,
      filterCountry,
      filterAssignedTo,
      filterSource,
      filterService,
      filterLeadStage,
      filterDateFrom || filterDateTo,
      filterAcademicYear,
      filterApplyLevel,
      filterFdStatus,
      filterCountry,
      filterStageGroup,
    ].filter(Boolean).length + (telecallerBucketBanner ? 1 : 0);

  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const modalSessionRef = useRef(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...files.filter((f) => !existingNames.has(f.name))];
    });
    e.target.value = "";
  };

  const removeFile = (name: string) =>
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name));

  const resetForm = () => {
    setForm({
      name: "", phone: "", email: "", dateOfBirth: "",
      source: "walk_in", interestedService: "", interestedCountry: "",
      branch: session?.user?.branch || "", standing: "warm",
      assignedTo: "", assignmentMethod: "manual", comments: "",
      status: "", stage: "",
      parentName: "", parentPhone1: "", parentPhone2: "",
      academicScore: "", academicInstitution: "", temporaryAddress: "", permanentAddress: "",
      examType: "", examScore: "", examJoinDate: "", examStartDate: "", examEndDate: "",
      examPaymentMethod: "", examEstimatedDate: "",
      gender: "", maritalStatus: "", nationality: "", passportNumber: "", visaExpiryDate: "",
      senderName: "",
      visitCaptured: false, visitedAt: "", visitPurpose: "",
      captureVisitEntries: [{ visitedAt: "", visitPurpose: "" }],
      appendCaptureVisit: false,
      academicYear: "", applyLevel: "", course: "", intakeYear: "", intakeQuarter: "",
    });
    setAttachedFiles([]);
    setSubmitError("");
    setEditingLead(null);
  };

  const closeLeadModalInternal = (force: boolean) => {
    if (submitting && !force) return;
    modalSessionRef.current += 1;
    setShowForm(false);
    resetForm();
  };
  const closeLeadModal = () => closeLeadModalInternal(false);

  const openCreateLeadModal = () => {
    if (submitting) return;
    modalSessionRef.current += 1;
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (lead: ILead) => {
    if (submitting) return;
    modalSessionRef.current += 1;
    const toDate = (v: unknown) =>
      v ? new Date(v as string).toISOString().slice(0, 10) : "";
    const branchId =
      typeof lead.branch === "object" && lead.branch !== null
        ? (lead.branch as { _id: string })._id
        : (lead.branch as string) || "";
    const assignedId =
      typeof lead.assignedTo === "object" && lead.assignedTo !== null
        ? (lead.assignedTo as { _id: string })._id
        : (lead.assignedTo as string) || "";
    const ext = lead as unknown as { status?: string; stage?: string };
    const existingCaptureVisits = ((lead as unknown as { captureVisits?: Array<{ visitedAt?: string; visitPurpose?: string }> }).captureVisits ?? [])
      .map((v) => ({
        visitedAt: toDate(v.visitedAt),
        visitPurpose: v.visitPurpose || "",
      }))
      .filter((v) => v.visitedAt || v.visitPurpose);
    const fallbackSingleVisit = {
      visitedAt: toDate((lead as unknown as { visitedAt?: string }).visitedAt),
      visitPurpose: (lead as unknown as { visitPurpose?: string }).visitPurpose || "",
    };
    const captureVisitEntries = existingCaptureVisits.length > 0
      ? existingCaptureVisits
      : (fallbackSingleVisit.visitedAt || fallbackSingleVisit.visitPurpose ? [fallbackSingleVisit] : [{ visitedAt: "", visitPurpose: "" }]);

    setForm({
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      dateOfBirth: toDate(lead.dateOfBirth),
      source: (lead.source as LeadSource) || "walk_in",
      interestedService: lead.interestedService || "",
      interestedCountry: lead.interestedCountry || "",
      branch: branchId,
      standing: (lead.standing as LeadStanding) || "warm",
      assignedTo: assignedId,
      assignmentMethod: "manual",
      comments: lead.comments || "",
      status: ext.status || "",
      stage: ext.stage || "",
      parentName: lead.parentName || "",
      parentPhone1: lead.parentPhone1 || "",
      parentPhone2: lead.parentPhone2 || "",
      academicScore: lead.academicScore || "",
      academicInstitution: lead.academicInstitution || "",
      temporaryAddress: lead.temporaryAddress || "",
      permanentAddress: lead.permanentAddress || "",
      examType: lead.examType || "",
      examScore: lead.examScore || "",
      examJoinDate: toDate(lead.examJoinDate),
      examStartDate: toDate(lead.examStartDate),
      examEndDate: toDate(lead.examEndDate),
      examPaymentMethod: lead.examPaymentMethod || "",
      examEstimatedDate: toDate(lead.examEstimatedDate),
      gender: lead.gender || "",
      maritalStatus: lead.maritalStatus || "",
      nationality: lead.nationality || "",
      passportNumber: lead.passportNumber || "",
      visaExpiryDate: toDate(lead.visaExpiryDate),
      senderName: lead.senderName || "",
      visitCaptured: Boolean((lead as unknown as { visitCaptured?: boolean }).visitCaptured),
      visitedAt: toDate((lead as unknown as { visitedAt?: string }).visitedAt),
      visitPurpose: (lead as unknown as { visitPurpose?: string }).visitPurpose || "",
      captureVisitEntries,
      appendCaptureVisit: false,
      academicYear: lead.academicYear || "",
      applyLevel: lead.applyLevel || "",
      course: lead.course || "",
      intakeYear: lead.intakeYear || "",
      intakeQuarter: lead.intakeQuarter || "",
    });
    setAttachedFiles([]);
    setSubmitError("");
    setEditingLead(lead);
    setShowForm(true);
  };

  const openCaptureVisitForLead = (lead: ILead) => {
    if (submitting) return;
    openEditForm(lead);
    setForm((prev) => ({
      ...prev,
      source: "capture_visit",
      visitCaptured: true,
      visitedAt: prev.visitedAt || new Date().toISOString().slice(0, 10),
      captureVisitEntries: [...(prev.captureVisitEntries || []), { visitedAt: new Date().toISOString().slice(0, 10), visitPurpose: "" }],
      appendCaptureVisit: true,
    }));
  };

  const parseApiErrorMessage = async (res: Response): Promise<{ data: unknown; message: string }> => {
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const data = await res.json();
      const msg =
        (data as { error?: string; message?: string })?.error ||
        (data as { error?: string; message?: string })?.message ||
        "";
      return {
        data,
        message: msg || `Request failed (${res.status}). Please try again.`,
      };
    }

    const rawText = await res.text();
    const compact = rawText.replace(/\s+/g, " ").trim();
    const looksHtml = compact.startsWith("<!DOCTYPE") || compact.startsWith("<html") || compact.startsWith("<");
    return {
      data: null,
      message: looksHtml
        ? `Server returned an unexpected response (${res.status}). Please refresh and try again.`
        : compact || `Request failed (${res.status}). Please try again.`,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const submitSession = modalSessionRef.current;

    const trimmedName = form.name.trim();
    const trimmedPhone = form.phone.trim();
    const normalizedSource = String(form.source || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const trimmedBranch = String(form.branch || "").trim();
    if (!trimmedName || !trimmedPhone || !normalizedSource || !trimmedBranch) {
      setSubmitError("Please fill all required fields: Full Name, Phone Number, Source, and Branch.");
      setSubmitting(false);
      return;
    }

    const payload: Record<string, unknown> = { ...form };
    payload.name = trimmedName;
    payload.phone = trimmedPhone;
    payload.source = normalizedSource;
    payload.branch = trimmedBranch;
    const captureVisitEntries = form.visitCaptured
      ? (form.captureVisitEntries || [])
          .map((v) => ({
            visitedAt: String(v.visitedAt || "").trim(),
            visitPurpose: String(v.visitPurpose || "").trim(),
          }))
          .filter((v) => v.visitedAt)
      : [];
    const latestCaptureVisit = captureVisitEntries[captureVisitEntries.length - 1];
    payload.visitPurpose = latestCaptureVisit?.visitPurpose || "";
    payload.visitedAt = latestCaptureVisit?.visitedAt ? new Date(latestCaptureVisit.visitedAt).toISOString() : "";
    if (captureVisitEntries.length > 0) {
      payload.captureVisitEntries = captureVisitEntries.map((v) => ({
        visitedAt: new Date(v.visitedAt).toISOString(),
        visitPurpose: v.visitPurpose,
      }));
    }
    delete payload.appendCaptureVisit;
    if (!payload.assignedTo) delete payload.assignedTo;
    if (!editingLead) {
      delete payload.status;
      delete payload.stage;
    }



    try {
      let res: Response;
      if (editingLead) {
        res = await fetch(`${apiLeadsBase}/${editingLead._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(apiLeadsBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const { data, message } = await parseApiErrorMessage(res);
      if (submitSession !== modalSessionRef.current) return;
      if (res.ok) {
        const parsed = (data as { _id?: string; lead?: { _id?: string } } | null) ?? null;
        const leadId = editingLead ? editingLead._id : (parsed?._id || parsed?.lead?._id);
        // Upload attached files one by one via chunked GridFS upload
        if (leadId && attachedFiles.length > 0) {
          const { uploadFile } = await import("@/lib/upload");
          await Promise.all(
            attachedFiles.map(async (file) => {
              const uploadData = await uploadFile(file);
              await fetch("/api/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  isEnquiriesRoute
                    ? {
                        enquiryId: leadId,
                        name: file.name,
                        fileUrl: uploadData.url,
                        originalName: uploadData.originalName,
                        fileSize: uploadData.fileSize,
                        fileType: uploadData.fileType,
                      }
                    : {
                        leadId,
                        name: file.name,
                        fileUrl: uploadData.url,
                        originalName: uploadData.originalName,
                        fileSize: uploadData.fileSize,
                        fileType: uploadData.fileType,
                      }
                ),
              });
            })
          );
        }
        const nextPage = editingLead ? currentPage : 1;
        closeLeadModalInternal(true);
        fetchLeads(nextPage);
      } else {
        setSubmitError(message || (editingLead ? "Failed to update lead." : "Failed to create lead. Please try again."));
      }
    } catch (error) {
      if (submitSession !== modalSessionRef.current) return;
      console.error("Form submission error:", error);
      setSubmitError(error instanceof Error ? error.message : "Network error. Please try again.");
    } finally {
      if (submitSession === modalSessionRef.current) {
        setSubmitting(false);
      }
    }
  };

  // Text search: server returns matching leads with name hits first (see GET /api/leads). Empty search: client-only extras (assigned counsellor, intake, formatted date, etc.) on the current page.
  const filtered = useMemo(() => {
    if (search.trim()) {
      return leads;
    }
    const q = search.toLowerCase();
    return leads.filter((l) => {
      const assignedName = (l.assignedTo as unknown as { name: string } | undefined)?.name ?? "";
      const dateStr = formatDate(l.createdAt).toLowerCase();
      const intakeText = `${l.intakeQuarter || ""} ${l.intakeYear || ""}`.trim().toLowerCase();
      const destinationAndUniversity = (l.interestedCountries || []).some((entry) =>
        [entry.country, entry.universityName]
          .filter(Boolean)
          .some((value) => (value || "").toLowerCase().includes(q))
      );
      return (
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.interestedCountry || "").toLowerCase().includes(q) ||
        destinationAndUniversity ||
        intakeText.includes(q) ||
        (l.course || "").toLowerCase().includes(q) ||
        (l.standing || "").replace("_", " ").toLowerCase().includes(q) ||
        assignedName.toLowerCase().includes(q) ||
        dateStr.includes(q)
      );
    });
  }, [leads, search]);

  const userPermissions = (session?.user?.permissions ?? []) as string[];
  const userRole = session?.user?.role;
  const canCreateLeadByRole = ["super_admin", "org_admin", "telecaller", "front_desk", "counsellor"].includes(userRole || "");
  const canCreate = canCreateLeadByRole && hasModuleAction(userPermissions, userRole, "leads", "add");
  const canAssign = ["super_admin", "org_admin", "telecaller", "front_desk"].includes(session?.user?.role || "");
  const canUpdateStatus = ["super_admin", "org_admin", "counsellor", "telecaller", "front_desk", "application_team", "admission_team", "visa_team"].includes(session?.user?.role || "");
  // counsellors no longer need access to stage controls
  const canUpdateStage = ["super_admin", "org_admin", "telecaller", "application_team", "admission_team", "visa_team"].includes(session?.user?.role || "");
  /** FD workflow status (same column for all roles; edit only where it was supported before). */
  const canUpdateFdStatus = roleCanEditLeadFdStatus(session?.user?.role);
  const canExport = hasModuleAction(userPermissions, userRole, "leads", "export");
  const isAdmin = isOrgWideAdmin(session?.user?.role);

  const leadsTableColumnCount = useMemo(
    () => (isAdmin ? 1 : 0) + 3 + 1 + 3,
    [isAdmin]
  );

  useEffect(() => {
    if (!filterStageGroup) return;
    const g = appStageGroups.find((x) => x.label === filterStageGroup);
    const allowed = g?.stages ?? [];
    if (filterLeadStage && allowed.length > 0 && !allowed.includes(filterLeadStage)) {
      setFilterLeadStage("");
    }
  }, [filterStageGroup, appStageGroups, filterLeadStage]);

  const allowedAssignedIds = filterFacetMeta?.assignedToIds;
  const counsellorOptions = useMemo(() => {
    if (!allowedAssignedIds?.length) return counsellors;
    const set = new Set(allowedAssignedIds);
    return counsellors.filter((c) => set.has(c._id));
  }, [counsellors, allowedAssignedIds]);

  const standingOptions = useMemo(() => {
    const allow = filterFacetMeta?.standings;
    if (!allow?.length) return appStandings;
    const set = new Set(allow);
    return appStandings.filter((s) => set.has(s));
  }, [appStandings, filterFacetMeta?.standings]);

  const sourceOptions = useMemo(() => {
    const allow = filterFacetMeta?.sources;
    if (!allow?.length) return appSources;
    const set = new Set(allow);
    const fromApp = appSources.filter((s) => set.has(s.value));
    const extras = allow
      .filter((v) => !appSources.some((s) => s.value === v))
      .map((v) => ({
        value: v,
        label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
    return [...fromApp, ...extras].sort((a, b) => a.label.localeCompare(b.label));
  }, [appSources, filterFacetMeta?.sources]);

  const serviceOptions = useMemo(() => {
    const allow = filterFacetMeta?.services;
    if (!allow?.length) return SERVICES;
    const set = new Set(allow);
    return SERVICES.filter((s) => set.has(s));
  }, [filterFacetMeta?.services]);

  const yearOptions = useMemo(() => {
    const years = Array.from({ length: 6 }, (_, i) => (new Date().getFullYear() + i - 1).toString());
    const allow = filterFacetMeta?.academicYears;
    if (!allow?.length) return years;
    const set = new Set(allow);
    return years.filter((y) => set.has(y));
  }, [filterFacetMeta?.academicYears]);

  const applyLevelOptions = useMemo(() => {
    const allow = filterFacetMeta?.applyLevels;
    if (!allow?.length) return APPLY_LEVEL_FILTERS;
    const lower = new Set(allow.map((x) => x.toLowerCase()));
    return APPLY_LEVEL_FILTERS.filter((o) => lower.has(o.value.toLowerCase()));
  }, [filterFacetMeta?.applyLevels]);

  const countryFilterOptions = useMemo(() => {
    const allow = filterFacetMeta?.countries;
    if (!allow?.length) return appCountries;
    const lower = new Map(allow.map((c) => [c.toLowerCase(), c]));
    const merged: string[] = [];
    for (const c of appCountries) {
      const hit = lower.get(c.toLowerCase());
      if (hit) merged.push(hit);
    }
    for (const c of allow) {
      if (!merged.some((m) => m.toLowerCase() === c.toLowerCase())) merged.push(c);
    }
    return merged.sort((a, b) => a.localeCompare(b));
  }, [appCountries, filterFacetMeta?.countries]);

  const stageSelectOptions = useMemo(() => {
    let stages = appLeadStages;
    if (filterStageGroup) {
      const g = appStageGroups.find((x) => x.label === filterStageGroup);
      const values = new Set(g?.stages ?? []);
      if (values.size > 0) stages = stages.filter((s) => values.has(s.value));
    }
    const allow = filterFacetMeta?.stages;
    if (allow?.length) {
      const set = new Set(allow);
      stages = stages.filter((s) => set.has(s.value));
    }
    return stages;
  }, [appLeadStages, appStageGroups, filterStageGroup, filterFacetMeta?.stages]);

  useEffect(() => {
    if (!filterLeadStage || !stageSelectOptions.length) return;
    if (!stageSelectOptions.some((s) => s.value === filterLeadStage)) setFilterLeadStage("");
  }, [filterLeadStage, stageSelectOptions]);

  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelectLead = (id: string) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedLeads.size === filtered.length) setSelectedLeads(new Set());
    else setSelectedLeads(new Set(filtered.map((l) => l._id)));
  };
  const bulkDeleteLeads = async () => {
    if (selectedLeads.size === 0) return;
    if (!confirm(`Delete ${selectedLeads.size} selected lead(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const res = await fetch(apiLeadsBase, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selectedLeads) }) });
    if (res.ok) { setSelectedLeads(new Set()); fetchLeads(1); }
    setBulkDeleting(false);
  };

  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [fdStatusDropdownId, setFdStatusDropdownId] = useState<string | null>(null);
  const [crmStageDropdownId, setCrmStageDropdownId] = useState<string | null>(null);
  const [crmStageDropdownPos, setCrmStageDropdownPos] = useState({ insetBlockStart: 0, insetInlineStart: 0 });
  const stageDropdownRef = useRef<HTMLDivElement>(null);
  const [stageSearch, setStageSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const [datePickerPos, setDatePickerPos] = useState({ insetBlockStart: 0, insetInlineStart: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        datePickerRef.current && !datePickerRef.current.contains(e.target as Node) &&
        dateButtonRef.current && !dateButtonRef.current.contains(e.target as Node)
      ) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (stageDropdownRef.current && !stageDropdownRef.current.contains(e.target as Node)) {
        setCrmStageDropdownId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openStageDropdown = (e: React.MouseEvent, leadId: string) => {
    if (crmStageDropdownId === leadId) { setCrmStageDropdownId(null); return; }
    setStageSearch("");
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popoverWidth = 320; // w-80
    const left = Math.min(rect.left, window.innerWidth - popoverWidth - 8);
    setCrmStageDropdownPos({ insetBlockStart: rect.bottom + window.scrollY + 8, insetInlineStart: left });
    setCrmStageDropdownId(leadId);
  };

  const openDatePicker = () => {
    if (dateButtonRef.current) {
      const rect = dateButtonRef.current.getBoundingClientRect();
      const popoverWidth = 320; // w-80
      // Right-align to button, but clamp so it never goes left of the button's container
      const idealLeft = rect.right - popoverWidth;
      const clampedLeft = Math.max(rect.left, Math.min(idealLeft, window.innerWidth - popoverWidth - 8));
      setDatePickerPos({
        insetBlockStart: rect.bottom + window.scrollY + 8,
        insetInlineStart: clampedLeft,
      });
    }
    setShowDatePicker((p) => !p);
  };

  const quickUpdateLeadStage = async (leadId: string, newStage: string) => {
    setCrmStageDropdownId(null);
    const now = new Date().toISOString();
    setLeads((prev) => prev.map((l) => {
      if (l._id !== leadId) return l;
      const ext = l as unknown as { stageDates?: Record<string, string> };
      return { ...l, stage: newStage, stageDates: newStage ? { ...(ext.stageDates ?? {}), [newStage]: now } : ext.stageDates } as typeof l;
    }));
    await fetch(`${apiLeadsBase}/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
  };

  const quickUpdateStatus = async (leadId: string, newStatus: string) => {
    setStatusDropdownId(null);
    setLeads((prev) => prev.map((l) => l._id === leadId ? { ...l, standing: newStatus as ILead["standing"] } : l));
    await fetch(`${apiLeadsBase}/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standing: newStatus }),
    });
  };

  const quickUpdateFdStatus = async (leadId: string, newStatus: string) => {
    setFdStatusDropdownId(null);
    const now = new Date().toISOString();
    setLeads((prev) => prev.map((l) => {
      if (l._id !== leadId) return l;
      const ext = l as unknown as { statusDates?: Record<string, string> };
      return { ...l, status: newStatus, statusDates: newStatus ? { ...(ext.statusDates ?? {}), [newStatus]: now } : ext.statusDates } as typeof l;
    }));
    const res = await fetch(`${apiLeadsBase}/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) fetchLeads(currentPage);
  };

  const submitTelecallerTransferToCounsellor = async () => {
    if (!assignCounsellorForLeadId || !assignCounsellorUserId || !session?.user?.id) return;
    const leadId = assignCounsellorForLeadId;
    const counsellorId = assignCounsellorUserId;
    const assignedBy = session.user.id;
    const counsellor = counsellors.find((c) => c._id === counsellorId);
    setAssignCounsellorForLeadId(null);
    setAssignCounsellorUserId("");
    const now = new Date().toISOString();
    setLeads((prev) => prev.map((l) => {
      if (l._id !== leadId) return l;
      const ext = l as unknown as { statusDates?: Record<string, string> };
      return {
        ...l,
        status: "Assigned",
        assignedTo: (counsellor
          ? { _id: counsellor._id, name: counsellor.name }
          : counsellorId) as ILead["assignedTo"],
        assignedBy: assignedBy as ILead["assignedBy"],
        statusDates: { ...(ext.statusDates ?? {}), Assigned: now },
      } as typeof l;
    }));
    const res = await fetch(`${apiLeadsBase}/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Assigned",
        assignedTo: counsellorId,
        assignedBy,
      }),
    });
    if (!res.ok) fetchLeads(currentPage);
  };

  const applyTelecallerFreshTransfer = async (leadId: string): Promise<boolean> => {
    const raw = telecallerFreshTransferChoice[leadId];
    if (!raw || !session?.user?.id) return false;
    const outcome = telecallerTransferOutcomes.find((o) => o.id === raw);
    if (!outcome) return false;
    if (outcome.requiresCounsellor) {
      const cid = telecallerFreshTransferCounsellor[leadId];
      if (!cid) return false;
    }
    if (outcome.requiresAppointmentDate) {
      const ad = telecallerTransferAppointmentDate[leadId]?.trim();
      if (!ad) return false;
    }
    const patch = buildTelecallerTransferPatchFromOutcome(outcome, {
      counsellorId: telecallerFreshTransferCounsellor[leadId],
      assignedBy: session.user.id,
      appointmentDate: telecallerTransferAppointmentDate[leadId],
    });
    if (outcome.effect === "assign_counsellor" && !patch.assignedTo) return false;

    setTelecallerFreshTransferUpdatingId(leadId);
    const res = await fetch(`${apiLeadsBase}/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setTelecallerFreshTransferUpdatingId(null);
    if (res.ok) {
      setTelecallerFreshTransferChoice((p) => {
        const n = { ...p };
        delete n[leadId];
        return n;
      });
      setTelecallerFreshTransferCounsellor((p) => {
        const n = { ...p };
        delete n[leadId];
        return n;
      });
      setTelecallerTransferAppointmentDate((p) => {
        const n = { ...p };
        delete n[leadId];
        return n;
      });
      await fetchLeads(currentPage);
      return true;
    }
    return false;
  };

  const formatLeadDateTime = (d: Date | string) => {
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, "0");
    const min = String(dt.getMinutes()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  };

  /** Display value from filter string (YYYY-MM-DD or datetime-local) in the chip row. */
  const formatDateFilterChip = (v: string, bound: "from" | "to") => {
    if (!v) return "";
    const parsed =
      v.length <= 10 && !v.includes("T")
        ? bound === "from"
          ? `${v}T01:00:00`
          : `${v}T23:00:00`
        : v;
    const dt = new Date(parsed);
    if (Number.isNaN(dt.getTime())) return v;
    return formatLeadDateTime(dt);
  };

  // ── Export filtered leads to Excel (CSV) ──
  const exportToExcel = () => {
    const headers = [
      `${branding.shortCode} ID`, "Name", "Phone", "Email", "Date of Birth", "Gender", "Marital Status",
      "Nationality", "Passport Number", "Standing", "Stage", "Source", "Referred By",
      "Interested Service", "Interested Country", "Branch", "Assigned To", "Created Date",
    ];
    const escape = (v?: string | null) => {
      const s = (v ?? "").toString().replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    };
    const rows = filtered.map((l) => {
      const assigned = (l.assignedTo as unknown as { name?: string } | undefined)?.name ?? "";
      const br = (l.branch as unknown as { name?: string } | undefined)?.name ?? "";
      const ext = l as unknown as Record<string, string | undefined>;
      const stageLabel = appLeadStages.find((s) => s.value === ext.stage)?.label ?? ext.stage ?? "";
      return [
        `${branding.shortCode}-${l._id.slice(-4).toUpperCase()}`,
        l.name, l.phone, l.email,
        l.dateOfBirth ?? "", ext.gender ?? "", ext.maritalStatus ?? "",
        ext.nationality ?? "", ext.passportNumber ?? "",
        (l.standing ?? "").replace(/_/g, " "),
        stageLabel,
        (l.source ?? "").replace(/_/g, " "),
        ext.senderName ?? "",
        l.interestedService ?? "",
        l.interestedCountry ?? "",
        br, assigned,
        formatDate(l.createdAt),
      ].map(escape).join(",");
    });
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const suffix = activeFilterCount > 0 ? `_filtered_${filtered.length}` : `_all_${leads.length}`;
    a.download = `ETG_Leads${suffix}_${dateStamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {telecallerBucketBanner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p>
            <span className="font-semibold">
              {isTelecallerFreshView ? "Fresh leads" : telecallerOverviewLabel}
            </span>
            {isTelecallerFreshView ? (
              <>
                {" - "}same list as the telecaller dashboard (new & pending contact only).
                {loading ? "" : ` ${totalLeads} total.`}
              </>
            ) : (
              <>
                {" - "}filtered to match this card on your telecaller dashboard.
                {loading ? "" : ` ${totalLeads} total.`}
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => router.replace(leadsPathBase)}
            className="shrink-0 rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
          >
            Show all leads
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading
              ? "Loading…"
              : isTelecallerFreshView
                ? (() => {
                    const t = totalLeads;
                    const pl = t !== 1 ? "s" : "";
                    return search.trim()
                      ? `${filtered.length} of ${t} fresh lead${pl} match search`
                      : `${t} fresh lead${pl}`;
                  })()
                : `${filtered.length} of ${totalLeads || leads.length} leads`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <button
              onClick={openCreateLeadModal}
              className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-700 text-white px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
            >
              <Plus size={15} />
              Add Lead
            </button>
          )}
          {canExport && (
          <button
            onClick={exportToExcel}
            disabled={loading || filtered.length === 0}
            title={`Export ${filtered.length} lead${filtered.length !== 1 ? "s" : ""} to Excel`}
            className="inline-flex items-center gap-2 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
          >
            <FileSpreadsheet size={15} />
            Export{activeFilterCount > 0 ? ` (${filtered.length})` : ""}
          </button>
          )}
        </div>
      </div>

      {/* Filter + Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-visible">
        <div className="flex items-stretch gap-0 divide-x divide-gray-200 flex-wrap">
          {/* Pipeline group — narrows stage list */}
          <div className="flex-1 min-w-[9.5rem] xl:min-w-28 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Pipeline</label>
            <select
              value={filterStageGroup}
              onChange={(e) => setFilterStageGroup(e.target.value)}
              title="Filter stage list by pipeline group"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All groups</option>
              {appStageGroups.map((g) => (
                <option key={g.label} value={g.label}>{g.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {/* Lead Stage filter */}
          <div className="flex-1 min-w-[9.5rem] xl:min-w-28 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Lead Stage</label>
            <select
              value={filterLeadStage}
              onChange={(e) => setFilterLeadStage(e.target.value)}
              title="Stages that appear in your current result set"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All stages</option>
              {stageSelectOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {/* FD workflow status filter */}
          <div className="flex-1 min-w-[9.5rem] xl:min-w-28 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Status</label>
            <select
              value={filterFdStatus}
              onChange={(e) => setFilterFdStatus(e.target.value)}
              title="Workflow statuses from Settings (same list as the Status column)"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All statuses</option>
              {appFdStatuses.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {/* Lead Standing */}
          <div className="flex-1 min-w-[9.5rem] xl:min-w-28 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Lead Standing</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              title="Standings present in current results"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All standings</option>
              {standingOptions.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Lead Source */}
          <div className="flex-1 min-w-[9.5rem] xl:min-w-28 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Lead Source</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              title="Sources in current results"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All sources</option>
              {sourceOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Services */}
          <div className="flex-1 min-w-[9.5rem] xl:min-w-28 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Service</label>
            <select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              title="Services in current results"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All services</option>
              {serviceOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Destination */}
          <div className="flex-1 min-w-[9.5rem] xl:min-w-28 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Destination</label>
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              title="Primary or multi-country interest (exact match)"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All countries</option>
              {countryFilterOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Academic Year */}
          <div className="flex-1 min-w-[8rem] xl:min-w-24 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Acad. Year</label>
            <select
              value={filterAcademicYear}
              onChange={(e) => setFilterAcademicYear(e.target.value)}
              title="Intake years in current results"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Apply Level */}
          <div className="flex-1 min-w-[8.5rem] xl:min-w-24 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Apply Level</label>
            <select
              value={filterApplyLevel}
              onChange={(e) => setFilterApplyLevel(e.target.value)}
              title="Levels in current results (case-insensitive match)"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All levels</option>
              {applyLevelOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Follow Up (Assigned Counsellor) */}
          <div className="flex-1 min-w-[9.5rem] xl:min-w-28 relative">
            <label className="absolute left-3 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Counsellor</label>
            <select
              value={filterAssignedTo}
              onChange={(e) => setFilterAssignedTo(e.target.value)}
              title="Counsellors with leads in current results"
              className="w-full pt-7 pb-2 px-3 bg-transparent text-sm text-gray-700 focus:outline-none focus:bg-gray-50 cursor-pointer appearance-none pr-8"
            >
              <option value="">All counsellors</option>
              {counsellorOptions.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Search */}
          <div className="flex-2 min-w-[12rem] xl:min-w-52 relative">
            <label className="absolute left-10 top-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-none">Search</label>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, email, destination, university…"
              className="w-full pt-7 pb-2 pl-9 pr-8 bg-transparent text-sm text-gray-800 focus:outline-none focus:bg-gray-50 placeholder-gray-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Date Range Picker */}
          <div className="flex items-center justify-center px-3 sm:px-4 shrink-0">
            <button
              ref={dateButtonRef}
              onClick={openDatePicker}
              title="Filter by date"
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border transition-colors ${
                filterDateFrom || filterDateTo
                  ? "bg-blue-50 text-blue-600 border-blue-200"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
              }`}
            >
              <Calendar size={14} />
              {filterDateFrom || filterDateTo ? "Date set" : "Date"}
            </button>
          </div>

        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest">Filters:</span>
            {filterStatus && <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-0.5 rounded-full font-medium capitalize">{filterStatus.replace(/_/g, " ")}<button onClick={() => setFilterStatus("")}><X size={10} /></button></span>}
            {filterSource && <span className="flex items-center gap-1 text-xs bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-0.5 rounded-full font-medium capitalize">{filterSource.replace(/_/g, " ")}<button onClick={() => setFilterSource("")}><X size={10} /></button></span>}
            {filterService && <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full font-medium">{filterService}<button onClick={() => setFilterService("")}><X size={10} /></button></span>}
            {filterLeadStage && <span className={`flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${getLeadStageColor(filterLeadStage)}`}>{appLeadStages.find((s) => s.value === filterLeadStage)?.label ?? filterLeadStage}<button onClick={() => setFilterLeadStage("")}><X size={10} /></button></span>}
            {filterAssignedTo && <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-0.5 rounded-full font-medium">{counsellors.find((c) => c._id === filterAssignedTo)?.name ?? "Assigned"}<button onClick={() => setFilterAssignedTo("")}><X size={10} /></button></span>}
            {filterDateFrom && (
              <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium max-w-[min(100%,14rem)] truncate" title={filterDateFrom}>
                From: {formatDateFilterChip(filterDateFrom, "from")}
                <button type="button" onClick={() => setFilterDateFrom("")}><X size={10} /></button>
              </span>
            )}
            {filterDateTo && (
              <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium max-w-[min(100%,14rem)] truncate" title={filterDateTo}>
                To: {formatDateFilterChip(filterDateTo, "to")}
                <button type="button" onClick={() => setFilterDateTo("")}><X size={10} /></button>
              </span>
            )}
            {filterAcademicYear && <span className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-full font-medium">Year: {filterAcademicYear}<button onClick={() => setFilterAcademicYear("")}><X size={10} /></button></span>}
            {filterApplyLevel && <span className="flex items-center gap-1 text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2.5 py-0.5 rounded-full font-medium capitalize">{filterApplyLevel}<button onClick={() => setFilterApplyLevel("")}><X size={10} /></button></span>}
            {filterCountry && <span className="flex items-center gap-1 text-xs bg-cyan-50 text-cyan-800 border border-cyan-100 px-2.5 py-0.5 rounded-full font-medium">{filterCountry}<button type="button" onClick={() => setFilterCountry("")}><X size={10} /></button></span>}
            {filterStageGroup && (
              <span className="flex items-center gap-1 text-xs bg-slate-50 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full font-medium">{filterStageGroup}<button type="button" onClick={() => setFilterStageGroup("")}><X size={10} /></button></span>
            )}
            {filterFdStatus && <span className="flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-100 px-2.5 py-0.5 rounded-full font-medium">{appFdStatuses.find((s) => s.value === filterFdStatus)?.label ?? filterFdStatus}<button onClick={() => setFilterFdStatus("")}><X size={10} /></button></span>}
            <button onClick={clearFilters} className="ml-auto text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1"><X size={11} /> Clear all</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden" onClick={() => { setStatusDropdownId(null); setFdStatusDropdownId(null); setCrmStageDropdownId(null); setMenuOpenId(null); }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {(() => {
                  const headers: string[] = [];
                  if (isAdmin) headers.push(""); // checkbox column
                  headers.push("Lead", "Client", "Services", "Status", "Standing", "Counselling", "Follow-Up");
                  return headers.map((h, i) => (
                    <th key={h || `chk-${i}`} className={`text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap ${h === "" ? "w-10" : ""}`}>
                      {h === "" ? (
                        <input type="checkbox" checked={filtered.length > 0 && selectedLeads.size === filtered.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500 cursor-pointer" />
                      ) : h}
                    </th>
                  ));
                })()}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={leadsTableColumnCount} className="text-center py-14">
                    <div className="inline-flex flex-col items-center gap-2 text-gray-400">
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                      <span className="text-sm">Loading leads…</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={leadsTableColumnCount} className="text-center py-14">
                    <div className="inline-flex flex-col items-center gap-2 text-gray-400">
                      <Users size={28} className="text-gray-300" />
                      <span className="text-sm">No leads found</span>
                      {(search || activeFilterCount > 0) && (
                        <button
                          onClick={() => { setSearch(""); clearFilters(); }}
                          className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-800"
                        >
                          Clear search &amp; filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filtered.map((lead) => {
                const assignedUser = lead.assignedTo as unknown as { name: string; _id: string } | undefined;
                const latestNote = lead.notes?.[lead.notes.length - 1];
                const initials = assignedUser?.name
                  ? assignedUser.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
                  : null;
                const leadTag = `${branding.shortCode}-${lead._id.slice(-4).toUpperCase()}`;
                const countryPart = lead.interestedCountries?.[0]?.country || lead.interestedCountry;
                return (
                  <React.Fragment key={lead._id}>
                    <tr key={lead._id} className={`hover:bg-gray-50/60 transition-colors align-top ${selectedLeads.has(lead._id) ? "bg-blue-50/40" : ""}`}>

                      {/* Checkbox column (admin only) */}
                      {isAdmin && (
                        <td className="px-4 py-3.5 w-10" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedLeads.has(lead._id)} onChange={() => toggleSelectLead(lead._id)} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500 cursor-pointer" />
                        </td>
                      )}

                      {/* LEAD column */}
                      <td className="px-4 py-3.5 min-w-32">
                        <p className="font-bold text-gray-900 text-sm">{leadTag}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{formatLeadDateTime(lead.createdAt)}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 capitalize">{lead.source?.replace(/_/g, " ")}</p>
                        {lead.senderName && (
                          <p className="text-[11px] text-blue-600 mt-0.5 font-medium truncate max-w-36" title={lead.senderName}>↗ {lead.senderName}</p>
                        )}
                      </td>

                      {/* CLIENT column */}
                      <td className="px-4 py-3.5 min-w-44">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-amber-400 text-sm">★</span>
                          <Link href={`${leadsPathBase}/${lead._id}`} className="font-semibold text-gray-900 text-sm hover:text-blue-600 hover:underline underline-offset-2 transition-colors">{lead.name}</Link>
                        </div>
                        <div className="flex items-center gap-1 text-[12px] text-gray-500 mb-0.5">
                          <Phone size={10} className="text-gray-400 shrink-0" />
                          <a href={`tel:${lead.phone}`} className="tabular-nums hover:text-blue-600 hover:underline transition-colors">{lead.phone}</a>
                          {lead.phone && (
                            <a
                              href={`https://wa.me/${lead.phone.replace(/[^\d]/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Open WhatsApp"
                              className="ml-1 shrink-0 hover:opacity-80 transition-opacity"
                            >
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#25D366]" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[12px] text-gray-500 mb-1">
                          <Mail size={10} className="text-gray-400 shrink-0" />
                          <a href={`mailto:${lead.email}`} className="truncate max-w-36 hover:text-blue-600 hover:underline transition-colors">{lead.email}</a>
                          {lead.email && (
                            <a
                              href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(lead.email)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Send Gmail"
                              className="ml-1 shrink-0 hover:opacity-80 transition-opacity"
                            >
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/></svg>
                            </a>
                          )}
                        </div>
                        {/* Recent note / comment preview */}
                        {(latestNote || lead.comments) && (
                          <div className="mt-1.5 flex items-start gap-1 text-[11px] text-gray-500 bg-gray-50 rounded px-1.5 py-1 max-w-52.5">
                            <MessageSquare size={9} className="text-gray-400 mt-0.5 shrink-0" />
                            <span className="line-clamp-2 leading-relaxed">
                              {latestNote ? latestNote.content : lead.comments}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* SERVICES column */}
                      <td className="px-4 py-3.5 min-w-36">
                        <p className="text-sm font-medium text-gray-800">
                          {lead.interestedService || <span className="text-gray-300">-</span>}
                          {countryPart && <span className="text-gray-500 font-normal"> - ({countryPart})</span>}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1 tabular-nums whitespace-nowrap">{formatDate(lead.createdAt)}</p>
                      </td>

                      {/* FD workflow status — visible for every role; edit where permitted */}
                      <td className="px-4 py-3.5 min-w-36">
                        {(() => {
                          const ext = lead as unknown as { status?: string; statusDates?: Record<string, string> };
                          const leadStatus = ext.status;
                          const statusInfo = appFdStatuses.find((s) => s.value === leadStatus);
                          const statusDate = leadStatus && ext.statusDates?.[leadStatus];
                          if (!canUpdateFdStatus) {
                            return (
                              <div className="inline-block" onClick={(e) => e.stopPropagation()}>
                                <span
                                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-default pointer-events-none ${
                                    statusInfo
                                      ? statusInfo.color
                                      : "bg-white border border-dashed border-gray-300 text-gray-400"
                                  }`}
                                >
                                  <span className="w-2 h-2 rounded-full bg-white/60 shrink-0" />
                                  {statusInfo ? statusInfo.label : "Set Status"}
                                  <ChevronDown size={12} className="shrink-0 opacity-50" aria-hidden />
                                </span>
                                {statusDate && (
                                  <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{formatDate(new Date(statusDate))}</p>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setFdStatusDropdownId(fdStatusDropdownId === lead._id ? null : lead._id)}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 group
                                  ${
                                    statusInfo
                                      ? `${statusInfo.color} cursor-pointer hover:shadow-md hover:scale-105`
                                      : "bg-white border border-dashed border-gray-300 text-gray-400 cursor-pointer hover:border-gray-400"
                                  }`}
                              >
                                <span className="w-2 h-2 rounded-full bg-white/60" />
                                {statusInfo ? statusInfo.label : "Set Status"}
                                <ChevronDown size={12} className={`shrink-0 opacity-60 transition-transform duration-200 ${fdStatusDropdownId === lead._id ? "rotate-180" : ""}`} />
                              </button>
                              {fdStatusDropdownId === lead._id && (
                                <div className="absolute z-30 top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-64 max-h-96 overflow-y-auto">
                                  <div className="sticky top-0 bg-linear-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                                    <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Change Status</p>
                                  </div>
                                  <div className="p-3 space-y-1.5">
                                    {fdWorkflowChoicesForPicker(appFdStatuses, leadStatus).map((s) => {
                                      const isSelected = leadStatus === s.value;
                                      const bgColor = s.color;
                                      return (
                                        <button
                                          key={s.value}
                                          type="button"
                                          onClick={() => {
                                            if (session?.user?.role === "telecaller" && s.value === "Assigned") {
                                              setFdStatusDropdownId(null);
                                              setAssignCounsellorUserId("");
                                              setAssignCounsellorForLeadId(lead._id);
                                              return;
                                            }
                                            void quickUpdateFdStatus(lead._id, s.value);
                                          }}
                                          className={`w-full px-3.5 py-3 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-between group
                                            ${isSelected
                                              ? `${bgColor} shadow-md scale-100 ring-2 ring-offset-1`
                                              : `${bgColor} opacity-70 hover:opacity-100 hover:shadow-md hover:scale-105`
                                            }`}
                                        >
                                          <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-white/60 group-hover:bg-white" />
                                            {s.label}
                                          </span>
                                          {isSelected && (
                                            <span className="text-white font-bold animate-pulse">✓</span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {statusDate && (
                                <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{formatDate(new Date(statusDate))}</p>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* STANDING column */}
                      <td className="px-4 py-3.5 min-w-28">
                        <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={!canUpdateStatus}
                            onClick={() => canUpdateStatus && setStatusDropdownId(statusDropdownId === lead._id ? null : lead._id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${getStatusColor(lead.standing)} ${canUpdateStatus ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-95"}`}
                          >
                            <span className="capitalize max-w-24 truncate">{lead.standing?.replace(/_/g, " ")}</span>
                            <ChevronDown size={11} className={`shrink-0 ${canUpdateStatus ? "" : "opacity-60"} transition-transform ${statusDropdownId === lead._id ? "rotate-180" : ""}`} />
                          </button>
                          {canUpdateStatus && statusDropdownId === lead._id && (
                            <div className="absolute z-30 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-36">
                              {appStandings.map((s) => (
                                <button key={s} onClick={() => quickUpdateStatus(lead._id, s)}
                                  className={`w-full text-left px-3 py-2 text-xs font-medium capitalize transition-colors flex items-center justify-between ${
                                    lead.standing === s ? "bg-gray-100 text-gray-900 font-semibold" : "text-gray-600 hover:bg-gray-50"
                                  }`}>
                                  {s.replace(/_/g, " ")}
                                  {lead.standing === s && <span className="text-gray-500">✓</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* COUNSELLING elapsed (Counselled / Phone counselling from statusDates) */}
                      <td className="px-4 py-3.5 min-w-[7.5rem]">
                        <CounselledTimeInline
                          statusDates={(lead as unknown as { statusDates?: unknown }).statusDates}
                        />
                      </td>

                      {/* FOLLOW-UP column */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Link href={`${leadsPathBase}/${lead._id}#notes`}
                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5 border border-blue-100 hover:border-blue-300 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
                            + Add
                          </Link>
                          {initials && (
                            <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center shrink-0 border border-violet-200">
                              {initials}
                            </span>
                          )}
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setMenuOpenId(menuOpenId === lead._id ? null : lead._id)}
                              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors">
                              <MoreVertical size={14} />
                            </button>
                            {menuOpenId === lead._id && (
                              <div className="absolute z-30 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-36">
                                <Link href={`${leadsPathBase}/${lead._id}`} className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 font-medium">View Details</Link>
                                {isTelecallerTransferTableView && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      setTelecallerTransferModalLeadId(lead._id);
                                    }}
                                    className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 font-medium"
                                  >
                                    Transfer lead…
                                  </button>
                                )}
                                {canUpdateStage && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      setMenuOpenId(null);
                                      openStageDropdown(e, lead._id);
                                    }}
                                    className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 font-medium"
                                  >
                                    Change lead stage…
                                  </button>
                                )}
                                {canCreate && (
                                  <button
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      openCaptureVisitForLead(lead);
                                    }}
                                    className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 font-medium"
                                  >
                                    Capture Visit
                                  </button>
                                )}
                                {canCreate && (
                                  <button
                                    onClick={() => { setMenuOpenId(null); openEditForm(lead); }}
                                    className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 font-medium"
                                  >Edit Lead</button>
                                )}
                                {isAdmin && (
                                  <button
                                    onClick={async () => {
                                      setMenuOpenId(null);
                                      if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
                                      const res = await fetch(`${apiLeadsBase}/${lead._id}`, { method: "DELETE" });
                                      if (res.ok) fetchLeads();
                                    }}
                                    className="block w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 font-medium"
                                  >Delete Lead</button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>


                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer count + pagination */}
        {!loading && (filtered.length > 0 || totalPages > 1) && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-gray-500">
              Showing <span className="font-semibold text-gray-700">{filtered.length}</span> on page {currentPage}
              {totalLeads > 0 && <> of <span className="font-semibold text-gray-700">{totalLeads}</span> total leads</>}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchLeads(currentPage - 1)}
                  disabled={currentPage <= 1 || loading}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-500 tabular-nums">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => fetchLeads(currentPage + 1)}
                  disabled={currentPage >= totalPages || loading}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk Delete Bar */}
      {isAdmin && selectedLeads.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-sm font-medium">{selectedLeads.size} lead{selectedLeads.size > 1 ? "s" : ""} selected</span>
          <button
            onClick={bulkDeleteLeads}
            disabled={bulkDeleting}
            className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Trash2 size={14} />
            {bulkDeleting ? "Deleting…" : "Delete Selected"}
          </button>
          <button
            onClick={() => setSelectedLeads(new Set())}
            className="text-gray-300 hover:text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Telecaller: pick counsellor when transferring (status → Assigned) */}
      {assignCounsellorForLeadId && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => { setAssignCounsellorForLeadId(null); setAssignCounsellorUserId(""); }}
          role="presentation"
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="transfer-counsellor-title"
          >
            <h3 id="transfer-counsellor-title" className="text-base font-semibold text-gray-900">
              Transfer to counsellor
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              The lead will be set to <span className="font-medium text-gray-700">Assigned</span> and handed to the counsellor you choose.
            </p>
            {counsellors.length === 0 ? (
              <p className="text-sm text-amber-700 mt-4 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                No counsellors are available. Ask an admin to add counsellor users first.
              </p>
            ) : (
              <div className="mt-4">
                <label className={LABEL_CLASS}>Counsellor</label>
                <select
                  value={assignCounsellorUserId}
                  onChange={(e) => setAssignCounsellorUserId(e.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value="">Select counsellor</option>
                  {counsellors.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => { setAssignCounsellorForLeadId(null); setAssignCounsellorUserId(""); }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!assignCounsellorUserId || counsellors.length === 0}
                onClick={() => void submitTelecallerTransferToCounsellor()}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Telecaller: transfer outcome (same table as other roles; opened from row menu) */}
      {telecallerTransferModalLeadId && isTelecallerTransferTableView && (() => {
        const lid = telecallerTransferModalLeadId;
        const tLead = leads.find((l) => l._id === lid);
        const close = () => setTelecallerTransferModalLeadId(null);
        return (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={close}
            role="presentation"
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="telecaller-transfer-title"
            >
              <h3 id="telecaller-transfer-title" className="text-base font-semibold text-gray-900">
                Transfer lead
              </h3>
              {tLead && (
                <p className="text-sm text-gray-500 mt-1">
                  {tLead.name}
                  <span className="text-gray-400"> · </span>
                  {`${branding.shortCode}-${tLead._id.slice(-4).toUpperCase()}`}
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                <select
                  value={telecallerFreshTransferChoice[lid] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const sel = telecallerTransferOutcomes.find((o) => o.id === v);
                    setTelecallerFreshTransferChoice((prev) => ({ ...prev, [lid]: v }));
                    if (!sel?.requiresCounsellor) {
                      setTelecallerFreshTransferCounsellor((prev) => {
                        const next = { ...prev };
                        delete next[lid];
                        return next;
                      });
                    }
                    if (!sel?.requiresAppointmentDate) {
                      setTelecallerTransferAppointmentDate((prev) => {
                        const next = { ...prev };
                        delete next[lid];
                        return next;
                      });
                    }
                  }}
                  className={FIELD_CLASS}
                >
                  <option value="">Choose transfer…</option>
                  {telecallerTransferOutcomes.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                {(() => {
                  const sel = telecallerTransferOutcomes.find((o) => o.id === telecallerFreshTransferChoice[lid]);
                  return sel?.requiresCounsellor;
                })() && (
                  <select
                    value={telecallerFreshTransferCounsellor[lid] ?? ""}
                    onChange={(e) =>
                      setTelecallerFreshTransferCounsellor((prev) => ({
                        ...prev,
                        [lid]: e.target.value,
                      }))
                    }
                    className={FIELD_CLASS}
                  >
                    <option value="">Select counsellor</option>
                    {counsellors.map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {(() => {
                  const sel = telecallerTransferOutcomes.find((o) => o.id === telecallerFreshTransferChoice[lid]);
                  return sel?.requiresAppointmentDate;
                })() && (
                  <div>
                    <label className={LABEL_CLASS}>Appointment date</label>
                    <input
                      type="date"
                      value={telecallerTransferAppointmentDate[lid] ?? ""}
                      onChange={(e) =>
                        setTelecallerTransferAppointmentDate((prev) => ({
                          ...prev,
                          [lid]: e.target.value,
                        }))
                      }
                      className={FIELD_CLASS}
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={close}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={(() => {
                    const choice = telecallerFreshTransferChoice[lid];
                    const sel = telecallerTransferOutcomes.find((o) => o.id === choice);
                    return (
                      telecallerFreshTransferUpdatingId === lid ||
                      !choice ||
                      !sel ||
                      (sel.requiresCounsellor && (!telecallerFreshTransferCounsellor[lid] || counsellors.length === 0)) ||
                      (sel.requiresAppointmentDate && !telecallerTransferAppointmentDate[lid]?.trim())
                    );
                  })()}
                  onClick={() => {
                    void (async () => {
                      const ok = await applyTelecallerFreshTransfer(lid);
                      if (ok) close();
                    })();
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {telecallerFreshTransferUpdatingId === lid ? "Updating…" : "Apply transfer"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Lead Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{editingLead ? "Edit Lead" : "Add New Lead"}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{editingLead ? "Update the lead details below" : "Fill in the details to register a new lead"}</p>
              </div>
              <button
                onClick={closeLeadModal}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

              {/* Personal Info */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Personal Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: "Full Name", key: "name", type: "text" },
                    { label: "Phone Number", key: "phone", type: "tel" },
                    { label: "Email Address", key: "email", type: "email" },
                    { label: "Date of Birth", key: "dateOfBirth", type: "date" },
                  ].map(({ label, key, type }) => (
                    <div key={key}>
                      <label className={LABEL_CLASS}>
                        {label}{REQUIRED_FORM_KEYS.has(key) ? " *" : ""}
                      </label>
                      <input
                        type={type}
                        value={String((form as Record<string, unknown>)[key] ?? "")}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className={FIELD_CLASS}
                        required={REQUIRED_FORM_KEYS.has(key)}
                      />
                    </div>
                  ))}

                  {/* Gender */}
                  <div>
                    <label className={LABEL_CLASS}>Gender</label>
                    <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={FIELD_CLASS}>
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>

                  {/* Marital Status */}
                  <div>
                    <label className={LABEL_CLASS}>Marital Status</label>
                    <select value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })} className={FIELD_CLASS}>
                      <option value="">Select status</option>
                      <option value="single">Single</option>
                      <option value="married">Married</option>
                      <option value="divorced">Divorced</option>
                      <option value="widowed">Widowed</option>
                      <option value="separated">Separated</option>
                    </select>
                  </div>

                  {/* Nationality */}
                  <div>
                    <label className={LABEL_CLASS}>Nationality</label>
                    <input
                      type="text"
                      value={form.nationality}
                      onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                      placeholder="e.g. Nepali, Indian"
                      className={FIELD_CLASS}
                    />
                  </div>

                  {/* Passport Number */}
                  <div>
                    <label className={LABEL_CLASS}>Passport Number</label>
                    <input
                      type="text"
                      value={form.passportNumber}
                      onChange={(e) => setForm({ ...form, passportNumber: e.target.value })}
                      placeholder="e.g. A1234567"
                      className={`${FIELD_CLASS} uppercase placeholder-gray-400`}
                    />
                  </div>

                  {/* Visa Expiry Date */}
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLASS}>Visa Expiry Date</label>
                    <input
                      type="date"
                      value={form.visaExpiryDate}
                      onChange={(e) => setForm({ ...form, visaExpiryDate: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Interest Info */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Interest Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLASS}>Source *</label>
                    <select
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value as LeadSource })}
                      className={FIELD_CLASS}
                      required
                    >
                      {appSources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>

                  {/* Sender Name */}
                  <div>
                    <label className={LABEL_CLASS}>Sender / Referred By</label>
                    <input
                      type="text"
                      value={form.senderName}
                      onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                      placeholder="Name of person who sent this lead"
                      className={FIELD_CLASS}
                    />
                  </div>

                  <div className="sm:col-span-2 p-3 rounded-md border border-gray-200 bg-gray-50 space-y-3">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 sm:col-span-1">
                      <input
                        type="checkbox"
                        checked={form.visitCaptured}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            visitCaptured: e.target.checked,
                            captureVisitEntries:
                              e.target.checked && (!form.captureVisitEntries || form.captureVisitEntries.length === 0)
                                ? [{ visitedAt: new Date().toISOString().slice(0, 10), visitPurpose: "" }]
                                : form.captureVisitEntries,
                          })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                      />
                      Capture Visit
                    </label>
                    {form.visitCaptured && (
                      <>
                        {(form.captureVisitEntries || []).map((entry, idx) => (
                          <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input
                              type="date"
                              value={entry.visitedAt}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  captureVisitEntries: (form.captureVisitEntries || []).map((x, i) =>
                                    i === idx ? { ...x, visitedAt: e.target.value } : x
                                  ),
                                })
                              }
                              className={FIELD_CLASS}
                            />
                            <input
                              type="text"
                              value={entry.visitPurpose}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  captureVisitEntries: (form.captureVisitEntries || []).map((x, i) =>
                                    i === idx ? { ...x, visitPurpose: e.target.value } : x
                                  ),
                                })
                              }
                              placeholder="Visit purpose"
                              className={FIELD_CLASS}
                            />
                            <div className="flex items-center gap-2">
                              {(form.captureVisitEntries || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm({
                                      ...form,
                                      captureVisitEntries: (form.captureVisitEntries || []).filter((_, i) => i !== idx),
                                    })
                                  }
                                  className="px-3 py-2 text-xs font-semibold rounded-md border border-red-200 hover:bg-red-50 text-red-600"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-start">
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                captureVisitEntries: [
                                  ...(form.captureVisitEntries || []),
                                  { visitedAt: new Date().toISOString().slice(0, 10), visitPurpose: "" },
                                ],
                              })
                            }
                            className="px-3 py-2 text-xs font-semibold rounded-md border border-gray-300 hover:bg-gray-100 text-gray-700"
                          >
                            Add Capture Visit
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <label className={LABEL_CLASS}>Standing</label>
                    <select
                      value={form.standing}
                      onChange={(e) => setForm({ ...form, standing: e.target.value as LeadStanding })}
                      className={FIELD_CLASS}
                    >
                      {appStandings.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                      ))}
                    </select>
                  </div>

                  {editingLead && (
                    <div>
                      <label className={LABEL_CLASS}>FD Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className={FIELD_CLASS}
                      >
                        <option value="">No status</option>
                        {fdWorkflowChoicesForPicker(appFdStatuses, form.status).map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {editingLead && (
                    <div>
                      <label className={LABEL_CLASS}>Stage</label>
                      <select
                        value={form.stage}
                        onChange={(e) => setForm({ ...form, stage: e.target.value })}
                        className={FIELD_CLASS}
                      >
                        <option value="">No stage</option>
                        {appLeadStages.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className={LABEL_CLASS}>Interested Country</label>
                    <select
                      value={form.interestedCountry}
                      onChange={(e) => setForm({ ...form, interestedCountry: e.target.value })}
                      className={FIELD_CLASS}
                    >
                      <option value="">Select country</option>
                      {appCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className={LABEL_CLASS}>Interested Service</label>
                    <select
                      value={form.interestedService}
                      onChange={(e) => setForm({ ...form, interestedService: e.target.value })}
                      className={FIELD_CLASS}
                    >
                      <option value="">Select service</option>
                      {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Apply Level */}
                  <div>
                    <label className={LABEL_CLASS}>Apply Level</label>
                    <select
                      value={form.applyLevel}
                      onChange={(e) => setForm({ ...form, applyLevel: e.target.value })}
                      className={FIELD_CLASS}
                    >
                      <option value="">Select level</option>
                      <option value="bachelor">Bachelor</option>
                      <option value="master">Master</option>
                      <option value="phd">PhD</option>
                    </select>
                  </div>

                  {/* Course */}
                  <div>
                    <label className={LABEL_CLASS}>Course</label>
                    <input
                      type="text"
                      value={form.course}
                      onChange={(e) => setForm({ ...form, course: e.target.value })}
                      placeholder="e.g. Computer Science, MBA"
                      className={FIELD_CLASS}
                    />
                  </div>

                  {/* Academic Year */}
                  <div>
                    <label className={LABEL_CLASS}>Academic Year</label>
                    <select
                      value={form.academicYear}
                      onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
                      className={FIELD_CLASS}
                    >
                      <option value="">Select year</option>
                      {Array.from({ length: 6 }, (_, i) => (new Date().getFullYear() + i - 1).toString()).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  {/* Intake */}
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLASS}>Intake</label>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={form.intakeYear}
                        onChange={(e) => setForm({ ...form, intakeYear: e.target.value })}
                        className={FIELD_CLASS}
                      >
                        <option value="">Intake Year</option>
                        {Array.from({ length: 6 }, (_, i) => (new Date().getFullYear() + i - 1).toString()).map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                      <select
                        value={form.intakeQuarter}
                        onChange={(e) => setForm({ ...form, intakeQuarter: e.target.value })}
                        className={FIELD_CLASS}
                      >
                        <option value="">Quarter</option>
                        <option value="Q1">Q1 (Jan - Mar)</option>
                        <option value="Q2">Q2 (Apr - Jun)</option>
                        <option value="Q3">Q3 (Jul - Sep)</option>
                        <option value="Q4">Q4 (Oct - Dec)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Assignment Info */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Assignment</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLASS}>Branch *</label>
                    <select
                      value={form.branch}
                      onChange={(e) => setForm({ ...form, branch: e.target.value })}
                      className={FIELD_CLASS}
                      required
                    >
                      <option value="">Select branch</option>
                      {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                    </select>
                  </div>

                  {canAssign && (
                    <>
                      <div>
                        <label className={LABEL_CLASS}>Assignment Method</label>
                        <select
                          value={form.assignmentMethod}
                          onChange={(e) => setForm({ ...form, assignmentMethod: e.target.value })}
                          className={FIELD_CLASS}
                        >
                          <option value="manual">Manual</option>
                          <option value="round_robin">Round Robin (Auto)</option>
                        </select>
                      </div>

                      {form.assignmentMethod === "manual" && (
                        <div>
                          <label className={LABEL_CLASS}>Assign to Counsellor</label>
                          <select
                            value={form.assignedTo}
                            onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                            className={FIELD_CLASS}
                          >
                            <option value="">Unassigned</option>
                            {counsellors.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Parent Information */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Parent Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLASS}>Parent&apos;s Full Name</label>
                    <input
                      type="text"
                      value={form.parentName}
                      onChange={(e) => setForm({ ...form, parentName: e.target.value })}
                      placeholder="Parent or guardian name"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Parent Phone Number 1</label>
                    <input
                      type="tel"
                      value={form.parentPhone1}
                      onChange={(e) => setForm({ ...form, parentPhone1: e.target.value })}
                      placeholder="Primary contact"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Parent Phone Number 2</label>
                    <input
                      type="tel"
                      value={form.parentPhone2}
                      onChange={(e) => setForm({ ...form, parentPhone2: e.target.value })}
                      placeholder="Secondary contact"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Student Academic Information */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Student Academic Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLASS}>Scored GPA / Percentage</label>
                    <input
                      type="text"
                      value={form.academicScore}
                      onChange={(e) => setForm({ ...form, academicScore: e.target.value })}
                      placeholder="e.g. 3.8 GPA or 85%"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Academic School / College Name</label>
                    <input
                      type="text"
                      value={form.academicInstitution}
                      onChange={(e) => setForm({ ...form, academicInstitution: e.target.value })}
                      placeholder="Institution name"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Temporary Address</label>
                    <input
                      type="text"
                      value={form.temporaryAddress}
                      onChange={(e) => setForm({ ...form, temporaryAddress: e.target.value })}
                      placeholder="Current / temporary address"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Permanent Address</label>
                    <input
                      type="text"
                      value={form.permanentAddress}
                      onChange={(e) => setForm({ ...form, permanentAddress: e.target.value })}
                      placeholder="Permanent home address"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* IELTS / PTE Information */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">IELTS / PTE Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLASS}>Exam Type</label>
                    <select
                      value={form.examType}
                      onChange={(e) => setForm({ ...form, examType: e.target.value })}
                      className={FIELD_CLASS}
                    >
                      <option value="">None / Not Applicable</option>
                      <option value="IELTS">IELTS</option>
                      <option value="PTE">PTE</option>
                      <option value="Duolingo">Duolingo</option>
                      <option value="Oxford IELTS">Oxford IELTS</option>
                      <option value="TOEFL">TOEFL</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Score (if already taken)</label>
                    <input
                      type="text"
                      value={form.examScore}
                      onChange={(e) => setForm({ ...form, examScore: e.target.value })}
                      placeholder="e.g. 6.5 band or 65 PTE"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Join Date</label>
                    <input
                      type="date"
                      value={form.examJoinDate}
                      onChange={(e) => setForm({ ...form, examJoinDate: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Start Date</label>
                    <input
                      type="date"
                      value={form.examStartDate}
                      onChange={(e) => setForm({ ...form, examStartDate: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>End Date</label>
                    <input
                      type="date"
                      value={form.examEndDate}
                      onChange={(e) => setForm({ ...form, examEndDate: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Payment Method</label>
                    <select
                      value={form.examPaymentMethod}
                      onChange={(e) => setForm({ ...form, examPaymentMethod: e.target.value })}
                      className={FIELD_CLASS}
                    >
                      <option value="">Select method</option>
                      <option value="online">Online</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                  {form.examPaymentMethod === "online" && (
                    <div className="sm:col-span-2">
                      {branding.paymentQrPath ? (
                        <div className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg bg-gray-50">
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Scan to Pay</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={branding.paymentQrPath} alt="Payment QR Code" className="w-40 h-40 object-contain rounded-md border border-gray-200 bg-white p-1" />
                          <p className="text-xs text-gray-400">Use the company QR code to make the payment</p>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                          No payment QR code configured. Please ask an admin to upload one in Settings → Branding.
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className={LABEL_CLASS}>Exam Estimated / Booked Date</label>
                    <input
                      type="date"
                      value={form.examEstimatedDate}
                      onChange={(e) => setForm({ ...form, examEstimatedDate: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Documents */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Documents</p>
                <div className="space-y-3">
                  <label
                    htmlFor="lead-file-upload"
                    className="flex items-center gap-2.5 border-2 border-dashed border-gray-200 rounded-lg px-4 py-4 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    <Paperclip size={16} className="text-gray-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Attach files</p>
                      <p className="text-xs text-gray-400 mt-0.5">Images (JPG, PNG, WEBP) and PDF - multiple allowed</p>
                    </div>
                    <input
                      id="lead-file-upload"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>

                  {attachedFiles.length > 0 && (
                    <ul className="space-y-1.5">
                      {attachedFiles.map((file) => (
                        <li key={file.name} className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                          {file.type === "application/pdf" ? (
                            <FileText size={15} className="text-red-400 shrink-0" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="w-7 h-7 object-cover rounded border border-gray-200 shrink-0"
                            />
                          )}
                          <span className="flex-1 text-xs text-gray-700 truncate">{file.name}</span>
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFile(file.name)}
                            className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Notes */}
              <div>
                <label className={LABEL_CLASS}>Comments / Notes</label>
                <textarea
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                  rows={3}
                  placeholder="Any additional notes about this lead…"
                  className={`${FIELD_CLASS} resize-none`}
                />
              </div>

              {/* Error */}
              {submitError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{submitError}</p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeLeadModal}
                  className="px-4 py-2.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
                >
                  {submitting && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {submitting ? (editingLead ? "Saving…" : "Creating…") : (editingLead ? "Save Changes" : "Create Lead")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CRM Stage dropdown portal - renders outside overflow:hidden table container */}
      {crmStageDropdownId && typeof document !== "undefined" && (() => {
        const dropLead = leads.find((l) => l._id === crmStageDropdownId);
        if (!dropLead) return null;
        const dropLeadStage = (dropLead as unknown as { stage?: string }).stage;
        const dropStageInfo = appLeadStages.find((s) => s.value === dropLeadStage);
        const searched = stageSearch.trim().toLowerCase();
        const filteredStages = searched ? appLeadStages.filter((s) => s.label.toLowerCase().includes(searched)) : null;
        return createPortal(
          <div
            ref={stageDropdownRef}
            style={{ position: "fixed", insetBlockStart: crmStageDropdownPos.insetBlockStart, insetInlineStart: crmStageDropdownPos.insetInlineStart, zIndex: 9999 }}
            className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-gray-100 w-80"
          >
            {/* Header */}
            <div className="px-4 pt-3.5 pb-2.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">Select Stage</span>
              {dropStageInfo && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${dropStageInfo.color}`}>{dropStageInfo.label}</span>
              )}
            </div>
            {/* Search */}
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  autoFocus
                  value={stageSearch}
                  onChange={(e) => setStageSearch(e.target.value)}
                  placeholder="Search stages…"
                  className="w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 text-gray-800 placeholder-gray-300"
                />
                {stageSearch && (
                  <button onClick={() => setStageSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={10} /></button>
                )}
              </div>
            </div>
            {/* Stages list */}
            <div className="overflow-y-auto max-h-[50vh] py-1.5">
              {filteredStages ? (
                filteredStages.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-5">No stages match &ldquo;{stageSearch}&rdquo;</p>
                  : filteredStages.map((s) => {
                      const isActive = dropLeadStage === s.value;
                      return (
                        <button key={s.value} onClick={() => quickUpdateLeadStage(crmStageDropdownId, s.value)}
                          className={`w-full text-left px-3.5 py-2 flex items-center justify-between gap-3 transition-colors duration-100 ${isActive ? "bg-gray-50" : "hover:bg-gray-50/80"}`}
                        >
                          <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold ${s.color}`}>{s.label}</span>
                          {isActive && <span className="w-4 h-4 rounded-full bg-gray-900 flex items-center justify-center shrink-0"><svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>}
                        </button>
                      );
                    })
              ) : (
                appStageGroups.map((group) => {
                  const groupStages = appLeadStages.filter((s) => group.stages.includes(s.value));
                  return (
                    <div key={group.label}>
                      <div className="px-3.5 pt-3 pb-1 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${group.dot}`} />
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em]">{group.label}</span>
                      </div>
                      {groupStages.map((s) => {
                        const isActive = dropLeadStage === s.value;
                        return (
                          <button key={s.value} onClick={() => quickUpdateLeadStage(crmStageDropdownId, s.value)}
                            className={`w-full text-left px-3.5 py-2 flex items-center justify-between gap-3 transition-colors duration-100 ${isActive ? "bg-gray-50" : "hover:bg-gray-50/80"}`}
                          >
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold ${s.color}`}>{s.label}</span>
                            {isActive && <span className="w-4 h-4 rounded-full bg-gray-900 flex items-center justify-center shrink-0"><svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
            {dropLeadStage && (
              <div className="border-t border-gray-100 px-3.5 py-2">
                <button
                  onClick={() => quickUpdateLeadStage(crmStageDropdownId, "")}
                  className="text-[11px] text-gray-400 hover:text-red-500 font-medium transition-colors flex items-center gap-1.5"
                >
                  <X size={10} /> Clear stage
                </button>
              </div>
            )}
          </div>,
          document.body
        );
      })()}

      {/* Date picker portal - renders outside overflow:hidden containers */}
      {showDatePicker && typeof document !== "undefined" && createPortal(
        <div
          ref={datePickerRef}
          style={{ position: "fixed", insetBlockStart: datePickerPos.insetBlockStart, insetInlineStart: datePickerPos.insetInlineStart, zIndex: 9999 }}
          className="w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl p-5"
        >
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Filter by date &amp; time</p>
          <p className="text-[10px] text-gray-400 mb-4 leading-snug">Uses lead <span className="font-semibold text-gray-500">created</span> time (your local timezone).</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">From</label>
              <input
                type="datetime-local"
                step={60}
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(withLeadFilterDefaultFromTime(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">To</label>
              <input
                type="datetime-local"
                step={60}
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(withLeadFilterDefaultToTime(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  setFilterDateFrom((f) => (f ? withLeadFilterDefaultFromTime(f) : ""));
                  setFilterDateTo((t) => (t ? withLeadFilterDefaultToTime(t) : ""));
                  setShowDatePicker(false);
                }}
                className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors"
              >
                Apply
              </button>
              {(filterDateFrom || filterDateTo) && (
                <button
                  onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setShowDatePicker(false); }}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
          Loading leads…
        </div>
      }
    >
      <LeadsPageContent />
    </Suspense>
  );
}
