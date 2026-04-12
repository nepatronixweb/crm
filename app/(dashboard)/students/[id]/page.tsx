"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle,
  Plus,
  UserCheck,
  Trash2,
  GraduationCap,
  Pencil,
  Lock,
  Unlock,
  Calendar,
  DollarSign,
  BookOpen,
  MapPin,
  Clock,
  History,
  X,
} from "lucide-react";
import { formatDate, formatDateTime, getStatusColor, getRoleLabel, COUNTRIES } from "@/lib/utils";
import { mergeRemarksForPipeline, type DeptRemarkLists } from "@/lib/admissionPipelineRemarks";
import { normalizeUniversitiesArray, universityEntryNames } from "@/lib/countryUniversities";
import { formatStandingLabel, standingInlineStyle, standingOptionPrefix } from "@/lib/studentStandingUi";

const DEFAULT_COUNTRIES = COUNTRIES;
import Link from "next/link";
import { useBranding } from "@/app/branding-context";
import { getCounselledEvent } from "@/lib/counselledAt";
import CounselledClockCard from "@/components/CounselledClockCard";

interface AdmissionCourse {
  name: string;
  level: string;
  intakeQuarter: string;
  intakeYear: string;
  commencementDate: string;
  courseEndDate: string;
}

interface AdmissionFieldChange {
  from: string;
  to: string;
}

interface AdmissionTrackingEntry {
  at: string;
  changedBy?: string;
  changedByName?: string;
  stage?: AdmissionFieldChange;
  pipeline?: AdmissionFieldChange;
  standing?: AdmissionFieldChange;
  remarks?: AdmissionFieldChange;
  statusDate?: AdmissionFieldChange;
}

interface AdmissionDetail {
  _id: string;
  country: string;
  universityName: string;
  location?: string;
  annualTuitionFee: string;
  stage?: string;
  pipeline?: string;
  standing: string;
  remarks?: string;
  statusDate?: string;
  closed?: boolean;
  b2bAgentType?: string;
  b2bName?: string;
  studentId?: string;
  tuitionFeesPaid?: string;
  courses: AdmissionCourse[];
  createdAt: string;
  trackingHistory?: AdmissionTrackingEntry[];
}

const TRACKING_FIELD_LABELS = {
  stage: "Stage",
  pipeline: "Pipeline",
  standing: "Standing",
  remarks: "Remarks",
  statusDate: "Status date",
} as const;

const ADMISSION_SUMMARY_FIELD_ORDER = [
  "stage",
  "remarks",
  "standing",
  "pipeline",
  "statusDate",
] as const satisfies readonly (keyof typeof TRACKING_FIELD_LABELS)[];

/** When the save was recorded (e.g. 04/07/2026, 15:30). */
function formatTrackingEventWhen(at: unknown): string {
  const raw = typeof at === "string" ? at : at != null ? String(at) : "";
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

interface StudentDetail {
  _id: string;
  name: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  source: string;
  currentStage: string;
  standing?: string;
  enrolled?: boolean;
  enrolledAt?: string;
  counsellor: { name: string; email: string };
  branch: { name: string };
  lead?: { statusDates?: Record<string, string> };
  enquiry?: { statusDates?: Record<string, string> };
  countries: Array<{ country: string; status: string; universityName?: string; visaStatus?: string; visaApprovedAt?: string }>;
  admissionDetails: AdmissionDetail[];
  notes: Array<{ _id: string; content: string; addedByName: string; addedByRole: string; createdAt: string }>;
}

interface Document {
  _id: string;
  name: string;
  originalName: string;
  filePath: string;
  country: string;
  fileSize: number;
  uploadedBy: { name: string };
  isVerified: boolean;
  createdAt: string;
}

const EMPTY_COURSE: AdmissionCourse = {
  name: "",
  level: "",
  intakeQuarter: "",
  intakeYear: "",
  commencementDate: "",
  courseEndDate: "",
};

const EMPTY_ADMISSION_FORM = {
  country: "",
  universityName: "",
  location: "",
  annualTuitionFee: "",
  studentId: "",
  tuitionFeesPaid: "",
  stage: "",
  pipeline: "",
  standing: "",
  remarks: "",
  statusDate: new Date().toISOString().split("T")[0],
  b2bAgentType: "",
  b2bName: "",
  courses: [{ ...EMPTY_COURSE }],
};

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const branding = useBranding();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [docName, setDocName] = useState("");
  const [addingCountry, setAddingCountry] = useState(false);
  const [newCountry, setNewCountry] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [admissionForm, setAdmissionForm] = useState(EMPTY_ADMISSION_FORM);
  const [savingAdmission, setSavingAdmission] = useState(false);
  const [savingAdmissionRowIndex, setSavingAdmissionRowIndex] = useState<number | null>(null);
  const [dirtyAdmissionRows, setDirtyAdmissionRows] = useState<Set<number>>(new Set());
  const [editingAdmission, setEditingAdmission] = useState<number | null>(null);
  const [editAdmissionForm, setEditAdmissionForm] = useState(EMPTY_ADMISSION_FORM);
  const [admissionSummaryIndex, setAdmissionSummaryIndex] = useState<number | null>(null);
  const [visaApproving, setVisaApproving] = useState(false);
  const [appCountries, setAppCountries] = useState<string[]>(DEFAULT_COUNTRIES);
  const [countryUniversities, setCountryUniversities] = useState<Record<string, string[]>>({});
  const [b2bNames, setB2bNames] = useState<string[]>([]);
  const [appCourses, setAppCourses] = useState<string[]>([]);
  const [appEducationLevels, setAppEducationLevels] = useState<string[]>(["Diploma", "Bachelor", "Master"]);
  const [b2bDropdownOpen, setB2bDropdownOpen] = useState<"new" | "edit" | null>(null);
  const [uniDropdownOpen, setUniDropdownOpen] = useState<"new" | "edit" | null>(null);
  const [courseDropdownOpen, setCourseDropdownOpen] = useState<"new" | "edit" | null>(null);
  const [appLeadStages, setAppLeadStages] = useState<{ value: string; label: string; group: string }[]>([]);
  const [appLeadStageGroups, setAppLeadStageGroups] = useState<string[]>([]);
  const [countryStages, setCountryStages] = useState<Record<string, { value: string; label: string; pipeline: string }[]>>({});
  const [appRemarkOptions, setAppRemarkOptions] = useState<string[]>([]);
  const [remarkOptionsByDept, setRemarkOptionsByDept] = useState<DeptRemarkLists>({
    application: [],
    admission: [],
    visa: [],
  });
  const [appStandings, setAppStandings] = useState<string[]>([]);

  const mergedAdmissionRemarks = useCallback(
    (pipeline: string | undefined) => mergeRemarksForPipeline(pipeline, appRemarkOptions, remarkOptionsByDept),
    [appRemarkOptions, remarkOptionsByDept]
  );

  const formatAdmissionTrackingValue = useCallback(
    (
      field: keyof typeof TRACKING_FIELD_LABELS,
      value: string,
      country: string,
      opts?: { fullRemarks?: boolean },
    ) => {
      if (!value) return "-";
      if (field === "stage") {
        const list =
          country && countryStages[country]?.length
            ? countryStages[country].map((s) => ({ value: s.value, label: s.label, group: s.pipeline }))
            : appLeadStages;
        return list.find((s) => s.value === value)?.label || value;
      }
      if (field === "standing") {
        return `${standingOptionPrefix(value)}${formatStandingLabel(value)}`;
      }
      if (field === "statusDate") {
        const t = Date.parse(value);
        return Number.isNaN(t) ? value : formatDate(value);
      }
      if (field === "remarks" && !opts?.fullRemarks && value.length > 120) {
        return `${value.slice(0, 117)}…`;
      }
      return value;
    },
    [countryStages, appLeadStages],
  );

  // Returns country-specific stages if available, otherwise global lead stages
  const getStagesForCountry = (country?: string) => {
    if (country && countryStages[country]?.length) {
      return countryStages[country].map((s) => ({ value: s.value, label: s.label, group: s.pipeline }));
    }
    return appLeadStages;
  };

  const fetchData = async () => {
    const [studentRes, docsRes] = await Promise.all([
      fetch(`/api/students/${id}`),
      fetch(`/api/documents?student=${id}`),
    ]);
    const studentData = await studentRes.json();
    const docsData = await docsRes.json();
    
    setStudent(studentData);
    setDocs(docsData.documents || []);
    
    if (studentData.countries?.length > 0) {
      setSelectedCountry((current) => current || studentData.countries[0].country);
    }
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadB2bNames = useCallback(() => {
    fetch("/api/settings/b2b", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.b2bNames)) setB2bNames(d.b2bNames);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadB2bNames();
  }, [loadB2bNames]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") loadB2bNames();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadB2bNames]);

  const loadDashboardSettings = useCallback(() => {
    fetch("/api/settings/app", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.countries?.length) {
          setAppCountries(d.countries.map((c: string | { name: string }) => (typeof c === "string" ? c : c.name)));
          const uniMap: Record<string, string[]> = {};
          for (const c of d.countries as (string | { name: string; universities?: unknown[] })[]) {
            if (typeof c === "string") {
              uniMap[c] = [];
            } else if (c?.name) {
              uniMap[c.name] = universityEntryNames(normalizeUniversitiesArray(c.universities));
            }
          }
          setCountryUniversities(uniMap);
        }
        if (d?.courses?.length) {
          setAppCourses(d.courses);
        }
        if (d?.educationLevels?.length) {
          setAppEducationLevels(d.educationLevels);
        }
        if (d?.leadStages?.length) {
          setAppLeadStages(d.leadStages);
        }
        if (d?.leadStageGroups?.length) {
          setAppLeadStageGroups(d.leadStageGroups);
        }
        if (d?.countryStages && typeof d.countryStages === "object") {
          setCountryStages(d.countryStages);
        }
        const globalR = Array.isArray(d?.remarkOptions) && d.remarkOptions.length > 0 ? d.remarkOptions : [];
        setAppRemarkOptions(globalR);
        setRemarkOptionsByDept({
          application:
            Array.isArray(d?.remarkOptionsApplication) && d.remarkOptionsApplication.length > 0
              ? d.remarkOptionsApplication
              : globalR,
          admission:
            Array.isArray(d?.remarkOptionsAdmission) && d.remarkOptionsAdmission.length > 0
              ? d.remarkOptionsAdmission
              : globalR,
          visa:
            Array.isArray(d?.remarkOptionsVisa) && d.remarkOptionsVisa.length > 0 ? d.remarkOptionsVisa : globalR,
        });
        if (d?.leadStandings?.length) {
          setAppStandings(d.leadStandings);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDashboardSettings();
  }, [loadDashboardSettings]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") loadDashboardSettings();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadDashboardSettings]);

  const addNote = async () => {
    if (!note.trim()) return;

    const noteContent = note.trim();
    await fetch(`/api/students/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteContent }),
    });

    setNote("");
    fetchData();

    if (student?.phone) {
      const waPhone = student.phone.replace(/[^\d]/g, "");
      const waMsg = encodeURIComponent(`Hi ${student.name},\n\n${noteContent}\n\n- ${branding.shortCode} Team`);
      window.open(`https://wa.me/${waPhone}?text=${waMsg}`, "_blank");
    }

    if (student?.email) {
      const subject = encodeURIComponent(`Update from ${branding.shortCode} - ${student.name}`);
      const body = encodeURIComponent(`Hi ${student.name},\n\n${noteContent}\n\nBest regards,\n${branding.shortCode} Team`);
      window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(student.email)}&su=${subject}&body=${body}`, "_blank");
    }
  };

  const updateStage = async (stage: string) => {
    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentStage: stage }),
    });
    const updated = await res.json();
    setStudent((prev) => prev ? { ...prev, currentStage: updated.currentStage } : prev);
  };

  const enrollStudent = async () => {
    setEnrolling(true);
    const enrolledAt = new Date().toISOString();

    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrolled: true, enrolledAt, standing: "heated", currentStage: "application" }),
      });

      if (res.ok) {
        setStudent((prev) => prev ? {
          ...prev,
          enrolled: true,
          enrolledAt,
          standing: "heated",
          currentStage: "application",
        } : prev);
      } else {
        const data = await res.json();
        alert(`Enroll failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      alert(`Network error: ${error}`);
    }

    setEnrolling(false);
  };

  const unenrollStudent = async () => {
    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrolled: false, enrolledAt: null }),
      });

      if (res.ok) {
        setStudent((prev) => prev ? { ...prev, enrolled: false, enrolledAt: undefined } : prev);
      }
    } catch {
      // ignore
    }
  };

  const updateStanding = async (standing: string) => {
    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standing }),
    });
    const updated = await res.json();
    setStudent((prev) => prev ? { ...prev, standing: updated.standing } : prev);
  };

  const approveVisa = async (country: string) => {
    setVisaApproving(true);
    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visaApproved: true, country }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err?.error || "Could not record visa approval.");
      }
    } catch {
      alert("Network error while approving visa.");
    } finally {
      setVisaApproving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCountry || !docName) return;

    setUploading(true);

    try {
      const { uploadFile } = await import("@/lib/upload");
      const uploadData = await uploadFile(file);

      await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: id,
          country: selectedCountry,
          name: docName,
          fileUrl: uploadData.url,
          originalName: uploadData.originalName,
          fileSize: uploadData.fileSize,
          fileType: uploadData.fileType,
        }),
      });
    } catch {
      // silent
    }

    setUploading(false);
    setDocName("");
    e.target.value = "";
    fetchData();
  };

  const addCountry = async () => {
    if (!newCountry) return;

    const existing = student?.countries.map((country) => country.country) || [];
    const updatedCountries = [...existing.map((country) => ({ country })), { country: newCountry }];

    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countries: updatedCountries }),
    });
    const updated = await res.json();
    setStudent((prev) => prev ? { ...prev, countries: updated.countries } : prev);
    setNewCountry("");
    setAddingCountry(false);
  };

  const saveAdmissionDetail = async () => {
    if (!student || !admissionForm.country) return;
    if (admissionForm.courses.some((course) => !course.name.trim())) return;

    setSavingAdmission(true);

    const newEntry = {
      ...admissionForm,
      courses: admissionForm.courses.map((course) => ({ ...course })),
    };
    const admissionDetails = [...(student.admissionDetails || []), newEntry];

    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admissionDetails }),
    });
    const updatedStudent = await res.json();
    setSavingAdmission(false);
    setShowAdmissionForm(false);
    setAdmissionForm(EMPTY_ADMISSION_FORM);
    setStudent((prev) => (prev ? { ...prev, ...updatedStudent } : prev));
  };

  const quickUpdateAdmission = (index: number, field: string, value: string) => {
    if (!student) return;
    const today = new Date().toISOString().split("T")[0];
    let extra: Record<string, string> = {};
    if (field === "stage") {
      const entryCountry = student.admissionDetails[index]?.country;
      const stageList = getStagesForCountry(entryCountry);
      const autoPipeline = stageList.find((s) => s.value === value)?.group || "";
      extra = { statusDate: today, pipeline: autoPipeline, remarks: "", standing: "" };
    }
    const updated = student.admissionDetails.map((entry, i) =>
      i === index ? { ...entry, [field]: value, ...extra } : entry
    );
    setStudent({ ...student, admissionDetails: updated });
    setDirtyAdmissionRows((prev) => new Set(prev).add(index));
  };

  const saveAdmissionRow = async (index: number) => {
    if (!student) return;
    setSavingAdmissionRowIndex(index);
    const updated = student.admissionDetails;
    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admissionDetails: updated }),
    });
    if (res.ok) {
      const saved = await res.json();
      setStudent((prev) => prev ? { ...prev, ...saved } : prev);
    }
    setDirtyAdmissionRows((prev) => { const s = new Set(prev); s.delete(index); return s; });
    setSavingAdmissionRowIndex(null);
  };

  const deleteAdmissionDetail = async (index: number) => {
    const entry = student?.admissionDetails?.[index];
    if (!entry) return;

    setStudent((prev) => prev ? { ...prev, admissionDetails: prev.admissionDetails.filter((_, i) => i !== index) } : prev);

    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ $pull: { admissionDetails: { _id: entry._id } } }),
    });
    if (res.ok) {
      const saved = await res.json();
      setStudent((prev) => (prev ? { ...prev, ...saved } : prev));
    } else {
      fetchData();
    }
  };

  const updateAdmissionDetail = async (index: number) => {
    const entry = student?.admissionDetails?.[index];
    if (!entry) return;

    setSavingAdmission(true);
    const existing = student?.admissionDetails || [];
    const updated = existing.map((admission, admissionIndex) => (
      admissionIndex === index
        ? { ...editAdmissionForm, _id: admission._id, closed: admission.closed }
        : admission
    ));

    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admissionDetails: updated }),
    });
    const updatedStudent = await res.json();
    setSavingAdmission(false);
    setEditingAdmission(null);
    setStudent((prev) => (prev ? { ...prev, ...updatedStudent } : prev));
  };

  const toggleAdmissionClosed = async (index: number) => {
    if (!student) return;
    const updated = student.admissionDetails.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, closed: !entry.closed } : entry
    ));

    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admissionDetails: updated }),
    });
    if (res.ok) {
      const saved = await res.json();
      setStudent((prev) => (prev ? { ...prev, ...saved } : prev));
    } else {
      fetchData();
    }
  };

  if (!student) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }

  const stages = appLeadStageGroups.length > 0 ? appLeadStageGroups : ["counsellor", "application", "admission", "visa", "completed"];
  const role = session?.user?.role || "";
  const canUpload = ["super_admin", "counsellor", "application_team"].includes(role);
  const canNote = ["super_admin", "counsellor", "application_team", "admission_team", "visa_team"].includes(role);
  const canStage = ["super_admin", "counsellor", "application_team", "admission_team", "visa_team"].includes(role);
  const canEnroll = ["super_admin", "application_team", "counsellor"].includes(role);
  /** Add/edit admission rows (incl. B2B). Counsellors and front desk see the section read-only so B2B is visible across departments. */
  const canEditAdmission = ["super_admin", "org_admin", "admission_team", "application_team", "visa_team"].includes(role);
  const canViewAdmission = canEditAdmission || ["counsellor", "front_desk"].includes(role);
  const canVisa = ["super_admin", "visa_team"].includes(role);
  const isCountryVisaApproved = (country: string) =>
    !!student.countries?.find((c) => c.country === country)?.visaApprovedAt;
  const filteredDocs = docs.filter((doc) => !selectedCountry || doc.country === selectedCountry);

  const counselledEvent =
    getCounselledEvent(student.lead?.statusDates) ?? getCounselledEvent(student.enquiry?.statusDates);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/students" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
          <p className="text-gray-500 text-sm">Student Profile</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {student.enrolled && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
              <CheckCircle size={11} /> Enrolled
            </span>
          )}
          {student.standing && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
              student.standing === "hot"
                ? "bg-red-50 text-red-600 border-red-200"
                : student.standing === "warm"
                  ? "bg-amber-50 text-amber-600 border-amber-200"
                  : student.standing === "heated"
                    ? "bg-orange-50 text-orange-600 border-orange-200"
                    : "bg-gray-50 text-gray-500 border-gray-200"
            }`}>
              {student.standing.replace("_", " ")}
            </span>
          )}
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(student.currentStage)}`}>
            {student.currentStage}
          </span>
        </div>
      </div>

      {counselledEvent && (
        <CounselledClockCard atIso={counselledEvent.atIso} sourceLabel={counselledEvent.sourceLabel} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Student Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Phone", student.phone],
                ["Email", student.email],
                ["DOB", student.dateOfBirth],
                ["Source", student.source?.replace("_", " ")],
                ["Counsellor", student.counsellor?.name],
                ["Branch", student.branch?.name],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-medium text-gray-800 mt-1 capitalize">{value || "-"}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Countries</h2>
              {canStage && (
                <button onClick={() => setAddingCountry(true)} className="text-blue-600 text-xs flex items-center gap-1 hover:underline">
                  <Plus size={12} /> Add Country
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap mb-4">
              {student.countries?.map((country) => (
                <button
                  key={country.country}
                  onClick={() => setSelectedCountry(country.country)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedCountry === country.country
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {country.country}
                  <span className={`ml-1 ${getStatusColor(country.status)} px-1 py-0.5 rounded text-xs`}>{country.status}</span>
                </button>
              ))}
            </div>

            {addingCountry && (
              <div className="flex gap-2 mt-2">
                <select
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select country</option>
                  {appCountries.filter((country) => !student.countries.map((entry) => entry.country).includes(country)).map((country) => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
                <button onClick={addCountry} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Add</button>
                <button onClick={() => setAddingCountry(false)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
              </div>
            )}
          </div>

          {canViewAdmission && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <GraduationCap size={16} /> Admission Details
                </h2>
                {!showAdmissionForm && canEditAdmission && (
                  <button onClick={() => setShowAdmissionForm(true)} className="text-blue-600 text-xs flex items-center gap-1 hover:underline">
                    <Plus size={12} /> Add Entry
                  </button>
                )}
              </div>

              {showAdmissionForm && canEditAdmission && (
                <div className="bg-white rounded-2xl border border-blue-100 shadow-md mb-6 overflow-hidden">
                  {/* Form Header */}
                  <div className="px-6 py-4 bg-linear-to-r from-blue-600 to-indigo-600 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                        <GraduationCap size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">New Admission Entry</p>
                        <p className="text-blue-100 text-xs">Fill in the university and course details</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">

                    {/* University Info Section */}
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-5 rounded-full bg-blue-500"></div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">University Info</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Country <span className="text-red-400">*</span></label>
                          <select
                            value={admissionForm.country}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAdmissionForm((form) => ({ ...form, country: v }));
                              loadDashboardSettings();
                            }}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:bg-white transition-all"
                          >
                            <option value="">Select country</option>
                            {student.countries?.map((country) => (
                              <option key={country.country} value={country.country}>{country.country}</option>
                            ))}
                          </select>
                        </div>
                        <div className="relative">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">University Name</label>
                          <input
                            value={admissionForm.universityName}
                            onChange={(e) => {
                              setAdmissionForm((form) => ({ ...form, universityName: e.target.value }));
                              setUniDropdownOpen("new");
                            }}
                            onFocus={() => {
                              loadDashboardSettings();
                              setUniDropdownOpen("new");
                            }}
                            onBlur={() => setTimeout(() => setUniDropdownOpen(null), 150)}
                            placeholder="Type or select university"
                            autoComplete="off"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:bg-white transition-all"
                          />
                          {uniDropdownOpen === "new" && (() => {
                            const unis = countryUniversities[admissionForm.country] || [];
                            const filtered = unis.filter((u) => u.toLowerCase().includes(admissionForm.universityName.toLowerCase()));
                            if (!admissionForm.country) {
                              return (
                                <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                  <li className="px-4 py-2.5 text-sm text-gray-400 italic">Select a country first</li>
                                </ul>
                              );
                            }
                            if (filtered.length === 0) {
                              if (unis.length === 0) {
                                return (
                                  <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                    <li className="px-4 py-2.5 text-xs text-gray-500">
                                      No universities listed for {admissionForm.country} in Settings → Destination countries. Add one there to see suggestions here.
                                    </li>
                                  </ul>
                                );
                              }
                              return null;
                            }
                            return (
                              <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                {filtered.map((name) => (
                                  <li key={name} onMouseDown={() => { setAdmissionForm((form) => ({ ...form, universityName: name })); setUniDropdownOpen(null); }}
                                    className="px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 cursor-pointer">
                                    {name}
                                  </li>
                                ))}
                              </ul>
                            );
                          })()}
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location / Campus</label>
                          <input
                            value={admissionForm.location}
                            onChange={(e) => setAdmissionForm((form) => ({ ...form, location: e.target.value }))}
                            placeholder="e.g. Melbourne, Sydney"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:bg-white transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* B2B Agent Section */}
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-5 rounded-full bg-purple-500"></div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">B2B Agent</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Agent Type</label>
                          <select
                            value={admissionForm.b2bAgentType}
                            onChange={(e) => setAdmissionForm((form) => ({ ...form, b2bAgentType: e.target.value }))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:bg-white transition-all"
                          >
                            <option value="">Select type</option>
                            <option value="Agent">Agent</option>
                            <option value="Sub-Agent">Sub-Agent</option>
                          </select>
                        </div>
                        <div className="relative">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Agent Name</label>
                          <input
                            value={admissionForm.b2bName}
                            onChange={(e) => {
                              setAdmissionForm((form) => ({ ...form, b2bName: e.target.value }));
                              setB2bDropdownOpen("new");
                            }}
                            onFocus={() => {
                              loadB2bNames();
                              setB2bDropdownOpen("new");
                            }}
                            onBlur={() => setTimeout(() => setB2bDropdownOpen(null), 150)}
                            placeholder="Type or select a B2B name"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:bg-white transition-all"
                            autoComplete="off"
                          />
                          {b2bDropdownOpen === "new" && b2bNames.filter((n) => n.toLowerCase().includes(admissionForm.b2bName.toLowerCase())).length > 0 && (
                            <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                              {b2bNames.filter((n) => n.toLowerCase().includes(admissionForm.b2bName.toLowerCase())).map((name) => (
                                <li
                                  key={name}
                                  onMouseDown={() => {
                                    setAdmissionForm((form) => ({ ...form, b2bName: name }));
                                    setB2bDropdownOpen(null);
                                  }}
                                  className="px-4 py-2.5 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 cursor-pointer"
                                >
                                  {name}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Student Status Section */}
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-5 rounded-full bg-emerald-500"></div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Student Status</p>
                      </div>
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Stage</label>
                            <select
                              value={admissionForm.stage}
                              onChange={(e) => {
                                const v = e.target.value;
                                const list = getStagesForCountry(admissionForm.country);
                                const autoPipeline = list.find((s) => s.value === v)?.group || "";
                                setAdmissionForm((form) => ({
                                  ...form,
                                  stage: v,
                                  statusDate: new Date().toISOString().split("T")[0],
                                  pipeline: autoPipeline,
                                  remarks: "",
                                  standing: "",
                                }));
                              }}
                              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                            >
                              <option value="">Select stage</option>
                              {getStagesForCountry(admissionForm.country).map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status Date</label>
                            <input
                              type="date"
                              value={admissionForm.statusDate}
                              onChange={(e) => setAdmissionForm((form) => ({ ...form, statusDate: e.target.value }))}
                              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Student ID</label>
                            <input
                              value={admissionForm.studentId}
                              onChange={(e) => setAdmissionForm((form) => ({ ...form, studentId: e.target.value }))}
                              placeholder="e.g. STU-2026-001"
                              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Annual Tuition Fee</label>
                            <input
                              value={admissionForm.annualTuitionFee}
                              onChange={(e) => setAdmissionForm((form) => ({ ...form, annualTuitionFee: e.target.value }))}
                              placeholder="e.g. AUD 32,000"
                              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tuition Fee Paid</label>
                            <input
                              value={admissionForm.tuitionFeesPaid}
                              onChange={(e) => setAdmissionForm((form) => ({ ...form, tuitionFeesPaid: e.target.value }))}
                              placeholder="e.g. AUD 10,000"
                              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Standing</label>
                            <select
                              value={admissionForm.standing}
                              onChange={(e) => setAdmissionForm((form) => ({ ...form, standing: e.target.value }))}
                              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                            >
                              <option value="">Select standing</option>
                              {appStandings.map((s) => (
                                <option key={s} value={s}>
                                  {standingOptionPrefix(s)}
                                  {formatStandingLabel(s)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Remarks</label>
                            <select
                              value={admissionForm.remarks}
                              onChange={(e) => setAdmissionForm((form) => ({ ...form, remarks: e.target.value }))}
                              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                            >
                              <option value="">Select remark</option>
                              {mergedAdmissionRemarks(admissionForm.pipeline).map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pipeline</label>
                            <select
                              value={admissionForm.pipeline}
                              onChange={(e) => setAdmissionForm((form) => ({ ...form, pipeline: e.target.value }))}
                              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                            >
                              <option value="">Select pipeline</option>
                              {appLeadStageGroups.map((g) => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Courses Section */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-5 rounded-full bg-orange-500"></div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Courses</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAdmissionForm((form) => ({ ...form, courses: [...form.courses, { ...EMPTY_COURSE }] }))}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg text-xs font-semibold hover:bg-orange-100 transition-colors"
                        >
                          <Plus size={12} /> Add Course
                        </button>
                      </div>
                      <div className="space-y-4">
                        {admissionForm.courses.map((course, index) => (
                          <div key={index} className="bg-orange-50/40 border border-orange-100 rounded-2xl p-5">
                            {admissionForm.courses.length > 1 && (
                              <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-bold text-orange-600 uppercase tracking-wide">Course {index + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => setAdmissionForm((form) => ({
                                    ...form,
                                    courses: form.courses.filter((_, courseIndex) => courseIndex !== index),
                                  }))}
                                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                                >
                                  <Trash2 size={11} /> Remove
                                </button>
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="sm:col-span-2 relative">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Course Name <span className="text-red-400">*</span></label>
                                <input
                                  value={course.name}
                                  onChange={(e) => {
                                    const updated = [...admissionForm.courses];
                                    updated[index] = { ...updated[index], name: e.target.value };
                                    setAdmissionForm((form) => ({ ...form, courses: updated }));
                                  }}
                                  onFocus={() => setCourseDropdownOpen("new")}
                                  onBlur={() => setTimeout(() => setCourseDropdownOpen(null), 150)}
                                  placeholder="e.g. Bachelor of IT"
                                  className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all"
                                  autoComplete="off"
                                />
                                {courseDropdownOpen === "new" && appCourses.filter((c) => c.toLowerCase().includes(course.name.toLowerCase())).length > 0 && (
                                  <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                    {appCourses.filter((c) => c.toLowerCase().includes(course.name.toLowerCase())).map((courseName) => (
                                      <li
                                        key={courseName}
                                        onMouseDown={() => {
                                          const updated = [...admissionForm.courses];
                                          updated[index] = { ...updated[index], name: courseName };
                                          setAdmissionForm((form) => ({ ...form, courses: updated }));
                                          setCourseDropdownOpen(null);
                                        }}
                                        className="px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 cursor-pointer"
                                      >
                                        {courseName}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Level</label>
                                <select
                                  value={course.level}
                                  onChange={(e) => {
                                    const updated = [...admissionForm.courses];
                                    updated[index] = { ...updated[index], level: e.target.value };
                                    setAdmissionForm((form) => ({ ...form, courses: updated }));
                                  }}
                                  className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all"
                                >
                                  <option value="">Select level</option>
                                  {appEducationLevels.map((l) => <option key={l} value={l}>{l}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Intake Quarter</label>
                                <select
                                  value={course.intakeQuarter}
                                  onChange={(e) => {
                                    const updated = [...admissionForm.courses];
                                    updated[index] = { ...updated[index], intakeQuarter: e.target.value };
                                    setAdmissionForm((form) => ({ ...form, courses: updated }));
                                  }}
                                  className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all"
                                >
                                  <option value="">Select quarter</option>
                                  <option value="Q1">Q1</option>
                                  <option value="Q2">Q2</option>
                                  <option value="Q3">Q3</option>
                                  <option value="Q4">Q4</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Intake Year</label>
                                <input
                                  value={course.intakeYear}
                                  onChange={(e) => {
                                    const updated = [...admissionForm.courses];
                                    updated[index] = { ...updated[index], intakeYear: e.target.value };
                                    setAdmissionForm((form) => ({ ...form, courses: updated }));
                                  }}
                                  placeholder="e.g. 2026"
                                  className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Commencement Date</label>
                                <input
                                  type="date"
                                  value={course.commencementDate}
                                  onChange={(e) => {
                                    const updated = [...admissionForm.courses];
                                    updated[index] = { ...updated[index], commencementDate: e.target.value };
                                    setAdmissionForm((form) => ({ ...form, courses: updated }));
                                  }}
                                  className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Course End Date</label>
                                <input
                                  type="date"
                                  value={course.courseEndDate}
                                  onChange={(e) => {
                                    const updated = [...admissionForm.courses];
                                    updated[index] = { ...updated[index], courseEndDate: e.target.value };
                                    setAdmissionForm((form) => ({ ...form, courses: updated }));
                                  }}
                                  className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2 border-t border-gray-100">
                      <button
                        onClick={saveAdmissionDetail}
                        disabled={!admissionForm.country || admissionForm.courses.some((course) => !course.name.trim()) || savingAdmission}
                        className="px-6 py-2.5 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-blue-300 disabled:to-indigo-300 text-white rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow-md"
                      >
                        {savingAdmission ? "Saving..." : "Save Entry"}
                      </button>
                      <button
                        onClick={() => {
                          setShowAdmissionForm(false);
                          setAdmissionForm(EMPTY_ADMISSION_FORM);
                        }}
                        className="px-6 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-medium transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(!student.admissionDetails || student.admissionDetails.length === 0) && !showAdmissionForm && (
                <p className="text-sm text-gray-400 text-center py-4">No admission details added yet</p>
              )}

              <div className="space-y-3">
                {student.admissionDetails?.map((entry, index) => {
                  const rowVisaLocked = isCountryVisaApproved(entry.country);
                  const canEditAdmissionRow = canEditAdmission && !rowVisaLocked;
                  return (
                  <div key={entry._id ?? index} className={`p-4 rounded-xl border transition-all duration-300 ${entry.closed ? "bg-gray-100 border-gray-300" : "bg-gray-50 border-gray-100"}`}>
                    {canEditAdmission && editingAdmission === index ? (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        {/* Form header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">Edit Entry</p>
                            <p className="text-xs text-blue-600 font-medium">Update admission details below</p>
                          </div>
                        </div>

                        <div className="p-6 space-y-6">
                          {isCountryVisaApproved(editAdmissionForm.country) && (
                            <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 leading-relaxed">
                              <Lock size={12} className="inline-block mr-1.5 align-text-bottom text-emerald-700" />
                              Visa approved for this country - <strong>stage</strong>, <strong>standing</strong>, <strong>remarks</strong>, and <strong>pipeline</strong> are locked. You can still update other fields below.
                            </p>
                          )}
                          {/* Section: Institution */}
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-1 h-4 rounded-full bg-blue-500"></div>
                              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Institution</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Country</label>
                                <select
                                  value={editAdmissionForm.country}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setEditAdmissionForm((form) => ({ ...form, country: v }));
                                    loadDashboardSettings();
                                  }}
                                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                                >
                                  <option value="">Select country</option>
                                  {student.countries?.map((country) => (
                                    <option key={country.country} value={country.country}>{country.country}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="relative">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">University Name</label>
                                <input
                                  value={editAdmissionForm.universityName}
                                  onChange={(e) => { setEditAdmissionForm((form) => ({ ...form, universityName: e.target.value })); setUniDropdownOpen("edit"); }}
                                  onFocus={() => {
                                    loadDashboardSettings();
                                    setUniDropdownOpen("edit");
                                  }}
                                  onBlur={() => setTimeout(() => setUniDropdownOpen(null), 150)}
                                  placeholder="Type or select university"
                                  autoComplete="off"
                                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                                />
                                {uniDropdownOpen === "edit" && (() => {
                                  const unis = countryUniversities[editAdmissionForm.country] || [];
                                  const filtered = unis.filter((u) => u.toLowerCase().includes(editAdmissionForm.universityName.toLowerCase()));
                                  if (!editAdmissionForm.country) return (
                                    <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                      <li className="px-4 py-2.5 text-sm text-gray-400 italic">Select a country first</li>
                                    </ul>
                                  );
                                  if (filtered.length === 0) {
                                    if (unis.length === 0) {
                                      return (
                                        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                          <li className="px-4 py-2.5 text-xs text-gray-500">
                                            No universities listed for {editAdmissionForm.country} in Settings → Destination countries.
                                          </li>
                                        </ul>
                                      );
                                    }
                                    return null;
                                  }
                                  return (
                                    <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                      {filtered.map((name) => (
                                        <li key={name} onMouseDown={() => { setEditAdmissionForm((form) => ({ ...form, universityName: name })); setUniDropdownOpen(null); }}
                                          className="px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 cursor-pointer transition-colors truncate">{name}</li>
                                      ))}
                                    </ul>
                                  );
                                })()}
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Location / Campus</label>
                                <input
                                  value={editAdmissionForm.location}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, location: e.target.value }))}
                                  placeholder="e.g. Melbourne"
                                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">B2B Agent</label>
                                <select
                                  value={editAdmissionForm.b2bAgentType}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, b2bAgentType: e.target.value }))}
                                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                                >
                                  <option value="">Select type</option>
                                  <option value="Agent">Agent</option>
                                  <option value="Sub-Agent">Sub-Agent</option>
                                </select>
                              </div>
                              <div className="relative sm:col-span-2">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">B2B Name</label>
                                <input
                                  value={editAdmissionForm.b2bName}
                                  onChange={(e) => { setEditAdmissionForm((form) => ({ ...form, b2bName: e.target.value })); setB2bDropdownOpen("edit"); }}
                                  onFocus={() => {
                                    loadB2bNames();
                                    setB2bDropdownOpen("edit");
                                  }}
                                  onBlur={() => setTimeout(() => setB2bDropdownOpen(null), 150)}
                                  placeholder="Type or select a B2B partner name"
                                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                                  autoComplete="off"
                                />
                                {b2bDropdownOpen === "edit" && b2bNames.filter((n) => n.toLowerCase().includes(editAdmissionForm.b2bName.toLowerCase())).length > 0 && (
                                  <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                    {b2bNames.filter((n) => n.toLowerCase().includes(editAdmissionForm.b2bName.toLowerCase())).map((name) => (
                                      <li key={name} onMouseDown={() => { setEditAdmissionForm((form) => ({ ...form, b2bName: name })); setB2bDropdownOpen(null); }}
                                        className="px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors">{name}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Section: Student Status */}
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-1 h-4 rounded-full bg-emerald-500"></div>
                              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Student Status</p>
                            </div>
                            <div className="bg-gray-50/70 rounded-2xl border border-gray-100 p-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Stage</label>
                                  <select
                                    value={editAdmissionForm.stage}
                                    disabled={isCountryVisaApproved(editAdmissionForm.country)}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      const list = getStagesForCountry(editAdmissionForm.country);
                                      const autoPipeline = list.find((s) => s.value === v)?.group || "";
                                      setEditAdmissionForm((form) => ({
                                        ...form,
                                        stage: v,
                                        statusDate: new Date().toISOString().split("T")[0],
                                        pipeline: autoPipeline,
                                        remarks: "",
                                        standing: "",
                                      }));
                                    }}
                                    className="w-full px-4 py-2.5 bg-white border border-yellow-200 rounded-xl text-sm text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                  >
                                    <option value="">Select stage</option>
                                    {getStagesForCountry(editAdmissionForm.country).map((s) => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status Date</label>
                                  <input
                                    type="date"
                                    value={editAdmissionForm.statusDate}
                                    onChange={(e) => setEditAdmissionForm((form) => ({ ...form, statusDate: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Student ID</label>
                                  <input
                                    value={editAdmissionForm.studentId ?? ""}
                                    onChange={(e) => setEditAdmissionForm((form) => ({ ...form, studentId: e.target.value }))}
                                    placeholder="e.g. STU-2026-001"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Annual Tuition Fee</label>
                                  <input
                                    value={editAdmissionForm.annualTuitionFee}
                                    onChange={(e) => setEditAdmissionForm((form) => ({ ...form, annualTuitionFee: e.target.value }))}
                                    placeholder="e.g. 15000"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tuition Fee Paid</label>
                                  <input
                                    value={editAdmissionForm.tuitionFeesPaid ?? ""}
                                    onChange={(e) => setEditAdmissionForm((form) => ({ ...form, tuitionFeesPaid: e.target.value }))}
                                    placeholder="e.g. AUD 10,000"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Standing</label>
                                  <select
                                    value={editAdmissionForm.standing}
                                    disabled={isCountryVisaApproved(editAdmissionForm.country)}
                                    onChange={(e) => setEditAdmissionForm((form) => ({ ...form, standing: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white border border-orange-200 rounded-xl text-sm text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                  >
                                    <option value="">Select standing</option>
                                    {appStandings.map((s) => (
                                      <option key={s} value={s}>
                                        {standingOptionPrefix(s)}
                                        {formatStandingLabel(s)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Remarks</label>
                                  <select
                                    value={editAdmissionForm.remarks}
                                    disabled={isCountryVisaApproved(editAdmissionForm.country)}
                                    onChange={(e) => setEditAdmissionForm((form) => ({ ...form, remarks: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl text-sm text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                  >
                                    <option value="">Select remark</option>
                                    {mergedAdmissionRemarks(editAdmissionForm.pipeline).map((r) => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Pipeline</label>
                                  <select
                                    value={editAdmissionForm.pipeline ?? ""}
                                    disabled={isCountryVisaApproved(editAdmissionForm.country)}
                                    onChange={(e) => setEditAdmissionForm((form) => ({ ...form, pipeline: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white border border-purple-200 rounded-xl text-sm text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                  >
                                    <option value="">Select pipeline</option>
                                    {appLeadStageGroups.map((g) => (
                                      <option key={g} value={g}>{g}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Section: Courses */}
                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <div className="w-1 h-4 rounded-full bg-orange-500"></div>
                                <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Courses</p>
                              </div>
                              <button
                                onClick={() => setEditAdmissionForm((form) => ({ ...form, courses: [...form.courses, { ...EMPTY_COURSE }] }))}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg text-xs font-semibold hover:bg-orange-100 transition-colors"
                              >
                                <Plus size={12} /> Add Course
                              </button>
                            </div>
                            <div className="space-y-3">
                              {editAdmissionForm.courses.map((course, courseIndex) => (
                                <div key={courseIndex} className="bg-orange-50/40 border border-orange-100 rounded-2xl p-4 space-y-3">
                                  {editAdmissionForm.courses.length > 1 && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Course {courseIndex + 1}</span>
                                      <button onClick={() => setEditAdmissionForm((form) => ({ ...form, courses: form.courses.filter((_, ci) => ci !== courseIndex) }))}
                                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold transition-colors">
                                        <Trash2 size={11} /> Remove
                                      </button>
                                    </div>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="relative sm:col-span-2">
                                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Course Name *</label>
                                      <input
                                        value={course.name}
                                        onChange={(e) => { const u = [...editAdmissionForm.courses]; u[courseIndex] = { ...u[courseIndex], name: e.target.value }; setEditAdmissionForm((f) => ({ ...f, courses: u })); setCourseDropdownOpen("edit"); }}
                                        onFocus={() => setCourseDropdownOpen("edit")}
                                        onBlur={() => setTimeout(() => setCourseDropdownOpen(null), 150)}
                                        placeholder="Select or type course name"
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all"
                                        autoComplete="off"
                                      />
                                      {courseDropdownOpen === "edit" && appCourses.filter((c) => c.toLowerCase().includes(course.name.toLowerCase())).length > 0 && (
                                        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-32 overflow-y-auto">
                                          {appCourses.filter((c) => c.toLowerCase().includes(course.name.toLowerCase())).map((cn) => (
                                            <li key={cn} onMouseDown={() => { const u = [...editAdmissionForm.courses]; u[courseIndex] = { ...u[courseIndex], name: cn }; setEditAdmissionForm((f) => ({ ...f, courses: u })); setCourseDropdownOpen(null); }}
                                              className="px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-900 cursor-pointer transition-colors">{cn}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Level</label>
                                      <select value={course.level} onChange={(e) => { const u = [...editAdmissionForm.courses]; u[courseIndex] = { ...u[courseIndex], level: e.target.value }; setEditAdmissionForm((f) => ({ ...f, courses: u })); }}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all">
                                        <option value="">Select level</option>
                                        {appEducationLevels.map((l) => <option key={l} value={l}>{l}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Intake Quarter</label>
                                      <select value={course.intakeQuarter} onChange={(e) => { const u = [...editAdmissionForm.courses]; u[courseIndex] = { ...u[courseIndex], intakeQuarter: e.target.value }; setEditAdmissionForm((f) => ({ ...f, courses: u })); }}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all">
                                        <option value="">Select quarter</option>
                                        <option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Intake Year</label>
                                      <input value={course.intakeYear} onChange={(e) => { const u = [...editAdmissionForm.courses]; u[courseIndex] = { ...u[courseIndex], intakeYear: e.target.value }; setEditAdmissionForm((f) => ({ ...f, courses: u })); }}
                                        placeholder="e.g. 2026"
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all" />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Commencement Date</label>
                                      <input type="date" value={course.commencementDate} onChange={(e) => { const u = [...editAdmissionForm.courses]; u[courseIndex] = { ...u[courseIndex], commencementDate: e.target.value }; setEditAdmissionForm((f) => ({ ...f, courses: u })); }}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all" />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Course End Date</label>
                                      <input type="date" value={course.courseEndDate ?? ""} onChange={(e) => { const u = [...editAdmissionForm.courses]; u[courseIndex] = { ...u[courseIndex], courseEndDate: e.target.value }; setEditAdmissionForm((f) => ({ ...f, courses: u })); }}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-all" />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                          <button
                            onClick={() => updateAdmissionDetail(index)}
                            disabled={!editAdmissionForm.country || editAdmissionForm.courses.some((course) => !course.name.trim()) || savingAdmission}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
                          >
                            {savingAdmission ? (
                              <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg> Saving…</>
                            ) : (
                              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Update Entry</>
                            )}
                          </button>
                          <button
                            onClick={() => setEditingAdmission(null)}
                            className="px-5 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-semibold transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`rounded-xl border overflow-hidden transition-all ${entry.closed ? "border-gray-200 bg-gray-50/50" : "border-gray-200 bg-white shadow-sm"}`}>
                        {/* Card Header */}
                        <div className={`px-4 py-3 flex items-center justify-between gap-3 ${entry.closed ? "bg-gray-100/60" : "bg-linear-to-r from-blue-50 to-indigo-50 border-b border-blue-100/60"}`}>
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${entry.closed ? "bg-gray-200 text-gray-400" : "bg-blue-600 text-white"}`}>
                              {(entry.country || "?").substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${entry.closed ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-700"}`}>{entry.country}</span>
                                {entry.universityName && (
                                  <span className={`font-semibold text-sm ${entry.closed ? "text-gray-400" : "text-gray-900"}`}>{entry.universityName}</span>
                                )}
                                {entry.closed && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-500 text-[10px] font-bold rounded-md uppercase tracking-wide border border-red-200">Closed</span>
                                )}
                              </div>
                              {entry.location && (
                                <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                                  <MapPin size={10} />{entry.location}
                                </p>
                              )}
                              {entry.courses && entry.courses.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                  {entry.courses.map((course, ci) => course.name && (
                                    <span key={ci} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${entry.closed ? "bg-gray-200 text-gray-400" : "bg-white/80 text-gray-700 border border-gray-200"}`}>
                                      <BookOpen size={9} className={entry.closed ? "text-gray-400" : "text-blue-500"} />
                                      {course.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {canEditAdmission && (
                              <button
                                onClick={() => toggleAdmissionClosed(index)}
                                className={`p-1.5 rounded-md transition-colors ${entry.closed ? "text-green-600 hover:bg-green-50" : "text-orange-400 hover:bg-orange-50"}`}
                                title={entry.closed ? "Reopen entry" : "Close entry"}
                              >
                                {entry.closed ? <Unlock size={13} /> : <Lock size={13} />}
                              </button>
                            )}
                            {canEditAdmission && !entry.closed && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingAdmission(index);
                                    setEditAdmissionForm({
                                      country: entry.country,
                                      universityName: entry.universityName || "",
                                      location: entry.location || "",
                                      annualTuitionFee: entry.annualTuitionFee || "",
                                      studentId: entry.studentId || "",
                                      tuitionFeesPaid: entry.tuitionFeesPaid || "",
                                      stage: entry.stage || "",
                                      standing: entry.standing || "",
                                      remarks: entry.remarks || "",
                                      statusDate: entry.statusDate || "",
                                      b2bAgentType: entry.b2bAgentType || "",
                                      b2bName: entry.b2bName || "",
                                      pipeline: entry.pipeline || "",
                                      courses: entry.courses?.length ? entry.courses.map((course) => ({ ...course, courseEndDate: course.courseEndDate || "" })) : [{ ...EMPTY_COURSE }],
                                    });
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Edit entry"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => deleteAdmissionDetail(index)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                  title="Remove entry"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className={entry.closed ? "opacity-40 blur-sm pointer-events-none select-none" : ""}>
                          {/* Info Strip */}
                          <div className="px-4 py-2.5 flex flex-wrap gap-x-5 gap-y-1.5 border-b border-gray-100 bg-white">
                            {entry.studentId && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-gray-400 font-medium">ID</span>
                                <span className="font-semibold text-gray-800 font-mono">{entry.studentId}</span>
                              </div>
                            )}
                            {entry.annualTuitionFee && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <DollarSign size={11} className="text-green-500 shrink-0" />
                                <span className="font-semibold text-gray-800">{entry.annualTuitionFee}</span>
                                <span className="text-gray-400">/ yr</span>
                              </div>
                            )}
                            {entry.tuitionFeesPaid && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="px-1.5 py-0.5 bg-green-50 text-green-700 font-semibold rounded text-[10px] border border-green-200">Paid</span>
                                <span className="font-semibold text-gray-800">{entry.tuitionFeesPaid}</span>
                              </div>
                            )}
                            {entry.createdAt && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Calendar size={11} className="text-gray-400 shrink-0" />
                                <span>Added {formatDate(entry.createdAt)}</span>
                              </div>
                            )}
                            {entry.statusDate && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <Clock size={11} className="text-blue-400 shrink-0" />
                                <span className="text-gray-500">Updated</span>
                                <span className="font-semibold text-gray-700">{formatDate(entry.statusDate)}</span>
                              </div>
                            )}
                            {(entry.b2bAgentType || entry.b2bName) && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="px-2 py-0.5 bg-teal-50 text-teal-700 font-semibold rounded-full border border-teal-200 text-[10px]">{entry.b2bAgentType}</span>
                                {entry.b2bName && <span className="font-semibold text-gray-700">{entry.b2bName}</span>}
                              </div>
                            )}
                          </div>

                          {/* Status Bar */}
                          <div className="px-4 pt-3 pb-2">
                            <div className="grid grid-cols-5 gap-2">
                              {/* STAGE */}
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Stage</p>
                                {canEditAdmissionRow ? (
                                  <select
                                    value={entry.stage || ""}
                                    onChange={(e) => quickUpdateAdmission(index, "stage", e.target.value)}
                                    className="w-full text-xs font-semibold bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer text-center"
                                  >
                                    <option value="">-</option>
                                    {getStagesForCountry(entry.country).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                  </select>
                                ) : (
                                  <div
                                    className={`text-center text-xs font-semibold px-2 py-1.5 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-100 truncate ${rowVisaLocked ? "opacity-90" : ""}`}
                                    title={rowVisaLocked ? "Locked after visa approval" : undefined}
                                  >
                                    {getStagesForCountry(entry.country).find((s) => s.value === entry.stage)?.label || entry.stage || "-"}
                                  </div>
                                )}
                              </div>
                              {/* REMARKS */}
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Remarks</p>
                                {canEditAdmissionRow ? (
                                  <select
                                    value={entry.remarks || ""}
                                    onChange={(e) => quickUpdateAdmission(index, "remarks", e.target.value)}
                                    className="w-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer text-center"
                                  >
                                    <option value="">-</option>
                                    {mergedAdmissionRemarks(entry.pipeline).map((r) => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <div
                                    className={`text-center text-xs font-semibold px-2 py-1.5 bg-amber-50 text-amber-800 rounded-lg border border-amber-100 truncate ${rowVisaLocked ? "opacity-90" : ""}`}
                                    title={rowVisaLocked ? "Locked after visa approval" : undefined}
                                  >
                                    {entry.remarks || "-"}
                                  </div>
                                )}
                              </div>
                              {/* STANDING */}
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Standing</p>
                                {canEditAdmissionRow ? (
                                  <select
                                    value={entry.standing || ""}
                                    onChange={(e) => quickUpdateAdmission(index, "standing", e.target.value)}
                                    className="w-full text-xs font-semibold rounded-lg px-2 py-1.5 border focus:outline-none cursor-pointer text-center"
                                    style={standingInlineStyle(entry.standing)}
                                  >
                                    <option value="">-</option>
                                    {appStandings.map((s) => (
                                      <option key={s} value={s}>
                                        {standingOptionPrefix(s)}
                                        {formatStandingLabel(s)}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div
                                    className={`text-center text-xs font-semibold px-2 py-1.5 rounded-lg border truncate ${rowVisaLocked ? "opacity-90" : ""}`}
                                    style={standingInlineStyle(entry.standing)}
                                    title={rowVisaLocked ? "Locked after visa approval" : undefined}
                                  >
                                    {entry.standing
                                      ? `${standingOptionPrefix(entry.standing)}${formatStandingLabel(entry.standing)}`
                                      : "-"}
                                  </div>
                                )}
                              </div>
                              {/* PIPELINE - auto-set from stage, read-only */}
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Pipeline</p>
                                <div
                                  className={`text-center text-xs font-semibold px-2 py-1.5 bg-purple-50 text-purple-800 rounded-lg border border-purple-100 truncate cursor-not-allowed ${rowVisaLocked ? "ring-1 ring-emerald-200/80" : ""}`}
                                  title={rowVisaLocked ? "Locked after visa approval" : "Automatically set based on stage"}
                                >
                                  {entry.pipeline || "-"}
                                </div>
                              </div>
                              {/* STATUS DATE */}
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Status Date</p>
                                {canEditAdmission ? (
                                  <input
                                    type="date"
                                    value={entry.statusDate ? entry.statusDate.split("T")[0] : ""}
                                    onChange={(e) => quickUpdateAdmission(index, "statusDate", e.target.value)}
                                    className="w-full text-xs text-gray-700 font-medium border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer bg-gray-50 text-center"
                                  />
                                ) : (
                                  <div className="text-center text-xs text-gray-600 font-medium px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                                    {entry.statusDate ? entry.statusDate.split("T")[0] : "-"}
                                  </div>
                                )}
                              </div>
                            </div>
                            {canViewAdmission && (
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => setAdmissionSummaryIndex(index)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 transition-colors"
                                >
                                  <History size={14} className="shrink-0 text-indigo-600" />
                                  Summary
                                  {entry.trackingHistory && entry.trackingHistory.length > 0 && (
                                    <span className="font-normal text-indigo-600/80">({entry.trackingHistory.length})</span>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Update button - shown when any field in this row has been changed */}
                          {canEditAdmission && dirtyAdmissionRows.has(index) && (
                            <div className="px-4 pb-3">
                              <button
                                onClick={() => saveAdmissionRow(index)}
                                disabled={savingAdmissionRowIndex === index}
                                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-semibold rounded-xl transition-colors"
                              >
                                {savingAdmissionRowIndex === index ? (
                                  <><svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg> Saving…</>
                                ) : (
                                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Update</>
                                )}
                              </button>
                            </div>
                          )}
                          {entry.courses && entry.courses.length > 0 && (
                            <div className="px-4 pb-4 pt-2">
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Courses</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {entry.courses.map((course, courseIndex) => (
                                  <div key={courseIndex} className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                                    <div className="flex items-start gap-2">
                                      <div className="mt-0.5 w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center shrink-0">
                                        <BookOpen size={11} className="text-blue-600" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900 leading-tight">{course.name}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                          {course.level && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-semibold border border-blue-100">
                                              {course.level}
                                            </span>
                                          )}
                                          {(course.intakeQuarter || course.intakeYear) && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-100">
                                              <Calendar size={8} />
                                              {[course.intakeQuarter, course.intakeYear].filter(Boolean).join(" ")}
                                            </span>
                                          )}
                                          {course.commencementDate && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-semibold border border-green-100">
                                              <Clock size={8} />
                                              Starts {formatDate(course.commencementDate)}
                                            </span>
                                          )}
                                          {course.courseEndDate && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-semibold border border-red-100">
                                              <Clock size={8} />
                                              Ends {formatDate(course.courseEndDate)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>

              {admissionSummaryIndex !== null && student.admissionDetails[admissionSummaryIndex] != null && (() => {
                const sumEntry = student.admissionDetails[admissionSummaryIndex]!;
                const hist = sumEntry.trackingHistory ?? [];
                return (
                  <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admission-summary-title"
                    onClick={() => setAdmissionSummaryIndex(null)}
                  >
                    <div
                      className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col border border-gray-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
                        <div className="min-w-0">
                          <h3 id="admission-summary-title" className="text-sm font-bold text-gray-900">
                            Stage &amp; status summary
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {[sumEntry.universityName, sumEntry.country].filter(Boolean).join(" · ") || "Admission entry"}
                            {hist.length > 0 && (
                              <span className="text-gray-400"> · {hist.length} update{hist.length !== 1 ? "s" : ""}</span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAdmissionSummaryIndex(null)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 shrink-0"
                          aria-label="Close"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <div className="overflow-y-auto px-5 py-4 space-y-4 min-h-0">
                        {hist.length === 0 ? (
                          <p className="text-sm text-gray-600 leading-relaxed">
                            No history yet. After you change <strong>stage</strong>, <strong>remarks</strong>,{" "}
                            <strong>standing</strong>, <strong>pipeline</strong>, or <strong>status date</strong>, click{" "}
                            <strong>Update</strong> on this card - each save is listed below with the exact{" "}
                            <strong>date and time</strong> (for example: Stage changed to COE · 04/07/2026, 15:30).
                          </p>
                        ) : (
                          [...hist].reverse().map((ev, hi) => {
                            const whenStr = formatTrackingEventWhen(ev.at);
                            return (
                            <div
                              key={`sum-${hi}-${String(ev.at)}`}
                              className="rounded-xl border border-slate-200 bg-slate-50/90 p-4"
                            >
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Update</p>
                                <p className="text-sm font-bold text-gray-900 tabular-nums">{whenStr}</p>
                              </div>
                              {ev.changedByName ? (
                                <p className="text-[11px] text-gray-500 mt-1">By {ev.changedByName}</p>
                              ) : null}
                              <ul className="mt-3 space-y-2.5 border-t border-slate-200/80 pt-3">
                                {ADMISSION_SUMMARY_FIELD_ORDER.map((field) => {
                                  const ch = ev[field];
                                  if (!ch) return null;
                                  const fromFmt = formatAdmissionTrackingValue(field, ch.from, sumEntry.country, {
                                    fullRemarks: true,
                                  });
                                  const toFmt = formatAdmissionTrackingValue(field, ch.to, sumEntry.country, {
                                    fullRemarks: true,
                                  });
                                  const label = TRACKING_FIELD_LABELS[field];
                                  const hadFrom = (ch.from ?? "").toString().trim() !== "";
                                  return (
                                    <li
                                      key={field}
                                      className="text-sm text-gray-800 leading-relaxed border-l-2 border-indigo-200/80 pl-3"
                                      title={hadFrom ? `${label}: ${fromFmt} → ${toFmt} · ${whenStr}` : `${label}: ${toFmt} · ${whenStr}`}
                                    >
                                      <span className="font-semibold text-gray-900">{label}</span>
                                      {hadFrom ? (
                                        <>
                                          {" "}
                                          changed from{" "}
                                          <span className="text-rose-800/90 line-through decoration-rose-400/70 break-words">
                                            {fromFmt}
                                          </span>{" "}
                                          to{" "}
                                          <span className="font-semibold text-emerald-900 break-words">{toFmt}</span>
                                        </>
                                      ) : (
                                        <>
                                          {" "}
                                          set to <span className="font-semibold text-emerald-900 break-words">{toFmt}</span>
                                        </>
                                      )}
                                      <span className="text-gray-500 font-medium tabular-nums whitespace-nowrap">
                                        {" "}
                                        · {whenStr}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                            );
                          })
                        )}
                      </div>
                      <div className="px-5 py-3 border-t border-gray-100 flex justify-end shrink-0">
                        <button
                          type="button"
                          onClick={() => setAdmissionSummaryIndex(null)}
                          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText size={16} /> Documents
              {selectedCountry && <span className="text-gray-400 text-sm font-normal">- {selectedCountry}</span>}
            </h2>

            {canUpload && selectedCountry && (
              <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-100">
                <p className="text-sm font-medium text-blue-800 mb-2">Upload Document for {selectedCountry}</p>
                <div className="flex gap-2 flex-wrap">
                  <input
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="Document name (e.g. Passport Copy)"
                    className="flex-1 min-w-40 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${docName.trim() ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
                    <Upload size={14} />
                    {uploading ? "Uploading..." : "Choose File"}
                    <input type="file" className="hidden" disabled={!docName.trim() || uploading} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleUpload} />
                  </label>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {filteredDocs.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">No documents uploaded yet</p>}
              {filteredDocs.map((doc) => (
                <div key={doc._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText size={16} className="text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                      <p className="text-xs text-gray-400">{doc.originalName} · {doc.uploadedBy?.name} · {formatDate(doc.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.isVerified && <CheckCircle size={14} className="text-green-500" />}
                    <a href={doc.filePath} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline">View</a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Notes</h2>
            <div className="space-y-3 mb-4">
              {student.notes?.length === 0 && <p className="text-gray-400 text-sm">No notes yet</p>}
              {student.notes?.map((entry) => (
                <div key={entry._id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{entry.addedByName} · {getRoleLabel(entry.addedByRole as never)}</span>
                    <span className="text-xs text-gray-400">{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{entry.content}</p>
                </div>
              ))}
            </div>
            {canNote && (
              <div className="flex gap-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Add note..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button onClick={addNote} disabled={!note.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm">
                  Add
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {canEnroll && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <UserCheck size={16} /> Enrollment
              </h2>
              {!student.enrolled ? (
                <>
                  <p className="text-sm text-gray-500 mb-3">
                    Enroll this student to move them into the application pipeline. Standing will be set to <span className="font-semibold text-orange-600">Heated</span> automatically and visible to the Admission department.
                  </p>
                  <button
                    onClick={enrollStudent}
                    disabled={enrolling}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <UserCheck size={15} /> {enrolling ? "Enrolling..." : "Enroll Student"}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl mb-3">
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                      <CheckCircle size={16} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-green-800">Student Enrolled</p>
                      {student.enrolledAt && <p className="text-xs text-green-600">Enrolled on {formatDate(student.enrolledAt)}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">This student is now visible in the Admission department.</p>
                  <button onClick={unenrollStudent} className="text-[11px] text-gray-400 hover:text-red-500 font-medium transition-colors">
                    Undo enrollment
                  </button>
                </>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5">Standing</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { value: "hot", label: "Hot", active: "bg-red-500 text-white border-red-500", idle: "border-red-200 text-red-600 hover:bg-red-50" },
                    { value: "warm", label: "Warm", active: "bg-amber-500 text-white border-amber-500", idle: "border-amber-200 text-amber-600 hover:bg-amber-50" },
                    { value: "heated", label: "Heated", active: "bg-orange-500 text-white border-orange-500", idle: "border-orange-200 text-orange-600 hover:bg-orange-50" },
                    { value: "out_of_contact", label: "Out of Contact", active: "bg-gray-500 text-white border-gray-500", idle: "border-gray-200 text-gray-500 hover:bg-gray-50" },
                  ] as const).map((standing) => (
                    <button
                      key={standing.value}
                      onClick={() => updateStanding(student.standing === standing.value ? "" : standing.value)}
                      className={`px-2 py-1.5 rounded-md text-xs font-semibold border transition-colors ${student.standing === standing.value ? standing.active : standing.idle}`}
                    >
                      {standing.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {canStage && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Pipeline Stage</h2>
              <div className="space-y-2">
                {stages.map((stage, index) => {
                  const current = stages.indexOf(student.currentStage);
                  const isActive = student.currentStage === stage;
                  const isDone = index < current;

                  return (
                    <button
                      key={stage}
                      onClick={() => updateStage(stage)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? "bg-blue-600 text-white" : isDone ? "bg-green-50 text-green-700" : "hover:bg-gray-50 text-gray-600"}`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? "bg-white text-blue-600" : isDone ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                        {isDone ? "✓" : index + 1}
                      </span>
                      <span className="capitalize">{stage}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {canVisa && selectedCountry && (() => {
            const countryRow = student.countries.find((c) => c.country === selectedCountry);
            const approvedAt = countryRow?.visaApprovedAt;
            const isApproved = !!approvedAt;
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h2 className="font-semibold text-gray-900 mb-3">Visa Approval</h2>
                {isApproved ? (
                  <>
                    <p className="text-sm text-emerald-800 mb-3 leading-relaxed">
                      Visa is <strong>approved</strong> for {selectedCountry}.
                      {approvedAt ? (
                        <span className="block text-xs text-emerald-700/90 mt-1 tabular-nums">
                          Recorded {formatDateTime(typeof approvedAt === "string" ? approvedAt : String(approvedAt))}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      Stage, standing, remarks, and pipeline for admission entries in this country are locked. The counsellor target was decremented when this was first approved.
                    </p>
                    <button
                      type="button"
                      disabled
                      className="w-full bg-emerald-700/85 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-default opacity-95"
                    >
                      Visa approved - {selectedCountry}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-3">Mark visa as approved for {selectedCountry}. This will decrement counsellor target.</p>
                    <button
                      type="button"
                      disabled={visaApproving}
                      onClick={() => approveVisa(selectedCountry)}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-500/80 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      {visaApproving ? "Saving…" : `Approve Visa for ${selectedCountry}`}
                    </button>
                  </>
                )}
              </div>
            );
          })()}


        </div>
      </div>
    </div>
  );
}
