"use client";

import { use, useEffect, useState } from "react";
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
} from "lucide-react";
import { formatDate, formatDateTime, getStatusColor, getRoleLabel, COUNTRIES } from "@/lib/utils";

const DEFAULT_COUNTRIES = COUNTRIES;
import Link from "next/link";
import { useBranding } from "@/app/branding-context";

interface AdmissionCourse {
  name: string;
  level: string;
  intakeQuarter: string;
  intakeYear: string;
  commencementDate: string;
  courseEndDate: string;
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
  const [appRemarkOptions, setAppRemarkOptions] = useState<string[]>([]);
  const [appStandings, setAppStandings] = useState<string[]>(["hot", "warm", "heated", "cold", "missed"]);

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

  useEffect(() => {
    fetch("/api/settings/app").then(r => r.json()).then(d => {
      if (d?.countries?.length) {
        setAppCountries(d.countries.map((c: string | { name: string }) => typeof c === "string" ? c : c.name));
        const uniMap: Record<string, string[]> = {};
        d.countries.forEach((c: { name: string; universities: string[] } | string) => {
          if (typeof c !== "string" && c.universities?.length) {
            uniMap[c.name] = c.universities;
          }
        });
        setCountryUniversities(uniMap);
      }
      if (d?.b2bNames?.length) {
        setB2bNames(d.b2bNames);
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
      if (d?.remarkOptions?.length) {
        setAppRemarkOptions(d.remarkOptions);
      }
      if (d?.leadStandings?.length) {
        setAppStandings(d.leadStandings);
      }
    }).catch(() => {});
  }, []);

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
    await fetch(`/api/students/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visaApproved: true, country }),
    });
    fetchData();
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
    if (!admissionForm.country) return;
    if (admissionForm.courses.some((course) => !course.name.trim())) return;

    setSavingAdmission(true);

    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        $push: {
          admissionDetails: {
            ...admissionForm,
            courses: admissionForm.courses.map((course) => ({ ...course })),
          },
        },
      }),
    });
    const updatedStudent = await res.json();
    setSavingAdmission(false);
    setShowAdmissionForm(false);
    setAdmissionForm(EMPTY_ADMISSION_FORM);
    setStudent((prev) => prev ? { ...prev, admissionDetails: updatedStudent.admissionDetails ?? prev.admissionDetails } : prev);
  };

  const quickUpdateAdmission = (index: number, field: string, value: string) => {
    if (!student) return;
    const today = new Date().toISOString().split("T")[0];
    const extra = field === "stage" ? { statusDate: today } : {};
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
    await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admissionDetails: updated }),
    });
    setDirtyAdmissionRows((prev) => { const s = new Set(prev); s.delete(index); return s; });
    setSavingAdmissionRowIndex(null);
  };

  const deleteAdmissionDetail = async (index: number) => {
    const entry = student?.admissionDetails?.[index];
    if (!entry) return;

    // Optimistic removal
    setStudent((prev) => prev ? { ...prev, admissionDetails: prev.admissionDetails.filter((_, i) => i !== index) } : prev);

    await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ $pull: { admissionDetails: { _id: entry._id } } }),
    });
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
    setStudent((prev) => prev ? { ...prev, admissionDetails: updatedStudent.admissionDetails ?? updated } : prev);
  };

  const toggleAdmissionClosed = async (index: number) => {
    if (!student) return;
    const updated = student.admissionDetails.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, closed: !entry.closed } : entry
    ));

    await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admissionDetails: updated }),
    });

    setStudent({ ...student, admissionDetails: updated });
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
  const canAdmission = ["super_admin", "admission_team"].includes(role);
  const canToggleAdmission = canAdmission;
  const canVisa = ["super_admin", "visa_team"].includes(role);
  const filteredDocs = docs.filter((doc) => !selectedCountry || doc.country === selectedCountry);

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

          {(canAdmission || canToggleAdmission) && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <GraduationCap size={16} /> Admission Details
                </h2>
                {!showAdmissionForm && canAdmission && (
                  <button onClick={() => setShowAdmissionForm(true)} className="text-blue-600 text-xs flex items-center gap-1 hover:underline">
                    <Plus size={12} /> Add Entry
                  </button>
                )}
              </div>

              {showAdmissionForm && (
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
                            onChange={(e) => setAdmissionForm((form) => ({ ...form, country: e.target.value }))}
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
                            onFocus={() => setUniDropdownOpen("new")}
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
                            if (filtered.length === 0) return null;
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
                            onFocus={() => setB2bDropdownOpen("new")}
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
                              onChange={(e) => setAdmissionForm((form) => ({ ...form, stage: e.target.value, statusDate: new Date().toISOString().split("T")[0] }))}
                              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                            >
                              <option value="">Select stage</option>
                              {appLeadStages.map((s) => (
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
                                <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
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
                              {appRemarkOptions.map((r) => (
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
                {student.admissionDetails?.map((entry, index) => (
                  <div key={entry._id ?? index} className={`p-4 rounded-xl border transition-all duration-300 ${entry.closed ? "bg-gray-100 border-gray-300" : "bg-gray-50 border-gray-100"}`}>
                    {editingAdmission === index ? (
                      <div className="space-y-4">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Edit Entry</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Country</label>
                            <select
                              value={editAdmissionForm.country}
                              onChange={(e) => setEditAdmissionForm((form) => ({ ...form, country: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Select country</option>
                              {student.countries?.map((country) => (
                                <option key={country.country} value={country.country}>{country.country}</option>
                              ))}
                            </select>
                          </div>
                          <div className="relative">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">University Name</label>
                            <input
                              value={editAdmissionForm.universityName}
                              onChange={(e) => {
                                setEditAdmissionForm((form) => ({ ...form, universityName: e.target.value }));
                                setUniDropdownOpen("edit");
                              }}
                              onFocus={() => setUniDropdownOpen("edit")}
                              onBlur={() => setTimeout(() => setUniDropdownOpen(null), 150)}
                              placeholder="Type or select university"
                              autoComplete="off"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {uniDropdownOpen === "edit" && (() => {
                              const unis = countryUniversities[editAdmissionForm.country] || [];
                              const filtered = unis.filter((u) => u.toLowerCase().includes(editAdmissionForm.universityName.toLowerCase()));
                              
                              if (!editAdmissionForm.country) {
                                return (
                                  <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                    <li className="px-3 py-2 text-sm text-gray-500 italic">Select a country first</li>
                                  </ul>
                                );
                              }
                              
                              if (filtered.length === 0) return null;
                              
                              return (
                                <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                  {filtered.map((name) => (
                                    <li key={name} onMouseDown={() => { setEditAdmissionForm((form) => ({ ...form, universityName: name })); setUniDropdownOpen(null); }}
                                      className="px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900 cursor-pointer truncate">
                                      {name}
                                    </li>
                                  ))}
                                </ul>
                              );
                            })()}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Location / Campus</label>
                            <input
                              value={editAdmissionForm.location}
                              onChange={(e) => setEditAdmissionForm((form) => ({ ...form, location: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">B2B Agent</label>
                            <select
                              value={editAdmissionForm.b2bAgentType}
                              onChange={(e) => setEditAdmissionForm((form) => ({ ...form, b2bAgentType: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                              <option value="">Select type</option>
                              <option value="Agent">Agent</option>
                              <option value="Sub-Agent">Sub-Agent</option>
                            </select>
                          </div>
                          <div className="relative">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">B2B Name</label>
                            <input
                              value={editAdmissionForm.b2bName}
                              onChange={(e) => {
                                setEditAdmissionForm((form) => ({ ...form, b2bName: e.target.value }));
                                setB2bDropdownOpen("edit");
                              }}
                              onFocus={() => setB2bDropdownOpen("edit")}
                              onBlur={() => setTimeout(() => setB2bDropdownOpen(null), 150)}
                              placeholder="Type or select a B2B name"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoComplete="off"
                            />
                            {b2bDropdownOpen === "edit" && b2bNames.filter((n) => n.toLowerCase().includes(editAdmissionForm.b2bName.toLowerCase())).length > 0 && (
                              <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                {b2bNames.filter((n) => n.toLowerCase().includes(editAdmissionForm.b2bName.toLowerCase())).map((name) => (
                                  <li
                                    key={name}
                                    onMouseDown={() => {
                                      setEditAdmissionForm((form) => ({ ...form, b2bName: name }));
                                      setB2bDropdownOpen(null);
                                    }}
                                    className="px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                                  >
                                    {name}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        {/* Student Status Group - Edit */}
                        <div className="border-t border-gray-200 pt-4 mt-4">
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Student Status</p>
                          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Stage</label>
                                <select
                                  value={editAdmissionForm.stage}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, stage: e.target.value, statusDate: new Date().toISOString().split("T")[0] }))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                  <option value="">Select stage</option>
                                  {appLeadStages.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Status Date</label>
                                <input
                                  type="date"
                                  value={editAdmissionForm.statusDate}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, statusDate: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Student ID</label>
                                <input
                                  value={editAdmissionForm.studentId ?? ""}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, studentId: e.target.value }))}
                                  placeholder="e.g. STU-2026-001"
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Annual Tuition Fee</label>
                                <input
                                  value={editAdmissionForm.annualTuitionFee}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, annualTuitionFee: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Tuition Fee Paid</label>
                                <input
                                  value={editAdmissionForm.tuitionFeesPaid ?? ""}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, tuitionFeesPaid: e.target.value }))}
                                  placeholder="e.g. AUD 10,000"
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Standing</label>
                                <select
                                  value={editAdmissionForm.standing}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, standing: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                  <option value="">Select standing</option>
                                  {appStandings.map((s) => (
                                    <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks</label>
                                <select
                                  value={editAdmissionForm.remarks}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, remarks: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                  <option value="">Select remark</option>
                                  {appRemarkOptions.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Pipeline</label>
                                <select
                                  value={editAdmissionForm.pipeline ?? ""}
                                  onChange={(e) => setEditAdmissionForm((form) => ({ ...form, pipeline: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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

                        <div className="border-t border-gray-300 pt-3 mt-3">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Courses</p>
                            <button
                              onClick={() => setEditAdmissionForm((form) => ({ ...form, courses: [...form.courses, { ...EMPTY_COURSE }] }))}
                              className="text-blue-600 text-xs flex items-center gap-1 hover:underline"
                            >
                              <Plus size={12} /> Add Course
                            </button>
                          </div>
                          <div className="space-y-3">
                            {editAdmissionForm.courses.map((course, courseIndex) => (
                              <div key={courseIndex} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div className="relative">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Course Name *</label>
                                    <input
                                      value={course.name}
                                      onChange={(e) => {
                                        const updated = [...editAdmissionForm.courses];
                                        updated[courseIndex] = { ...updated[courseIndex], name: e.target.value };
                                        setEditAdmissionForm((form) => ({ ...form, courses: updated }));
                                      }}
                                      onFocus={() => setCourseDropdownOpen("edit")}
                                      onBlur={() => setTimeout(() => setCourseDropdownOpen(null), 150)}
                                      placeholder="Select or type course"
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      autoComplete="off"
                                    />
                                    {courseDropdownOpen === "edit" && appCourses.filter((c) => c.toLowerCase().includes(course.name.toLowerCase())).length > 0 && (
                                      <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                                        {appCourses.filter((c) => c.toLowerCase().includes(course.name.toLowerCase())).map((courseName) => (
                                          <li
                                            key={courseName}
                                            onMouseDown={() => {
                                              const updated = [...editAdmissionForm.courses];
                                              updated[courseIndex] = { ...updated[courseIndex], name: courseName };
                                              setEditAdmissionForm((form) => ({ ...form, courses: updated }));
                                              setCourseDropdownOpen(null);
                                            }}
                                            className="px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                                          >
                                            {courseName}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Level</label>
                                    <select
                                      value={course.level}
                                      onChange={(e) => {
                                        const updated = [...editAdmissionForm.courses];
                                        updated[courseIndex] = { ...updated[courseIndex], level: e.target.value };
                                        setEditAdmissionForm((form) => ({ ...form, courses: updated }));
                                      }}
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      <option value="">Select level</option>
                                      {appEducationLevels.map((l) => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Intake Quarter</label>
                                    <select
                                      value={course.intakeQuarter}
                                      onChange={(e) => {
                                        const updated = [...editAdmissionForm.courses];
                                        updated[courseIndex] = { ...updated[courseIndex], intakeQuarter: e.target.value };
                                        setEditAdmissionForm((form) => ({ ...form, courses: updated }));
                                      }}
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      <option value="">Select quarter</option>
                                      <option value="Q1">Q1</option>
                                      <option value="Q2">Q2</option>
                                      <option value="Q3">Q3</option>
                                      <option value="Q4">Q4</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Intake Year</label>
                                    <input
                                      value={course.intakeYear}
                                      onChange={(e) => {
                                        const updated = [...editAdmissionForm.courses];
                                        updated[courseIndex] = { ...updated[courseIndex], intakeYear: e.target.value };
                                        setEditAdmissionForm((form) => ({ ...form, courses: updated }));
                                      }}
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Course Commencement Date</label>
                                    <input
                                      type="date"
                                      value={course.commencementDate}
                                      onChange={(e) => {
                                        const updated = [...editAdmissionForm.courses];
                                        updated[courseIndex] = { ...updated[courseIndex], commencementDate: e.target.value };
                                        setEditAdmissionForm((form) => ({ ...form, courses: updated }));
                                      }}
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Course End Date</label>
                                    <input
                                      type="date"
                                      value={course.courseEndDate ?? ""}
                                      onChange={(e) => {
                                        const updated = [...editAdmissionForm.courses];
                                        updated[courseIndex] = { ...updated[courseIndex], courseEndDate: e.target.value };
                                        setEditAdmissionForm((form) => ({ ...form, courses: updated }));
                                      }}
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                </div>
                                {editAdmissionForm.courses.length > 1 && (
                                  <button
                                    onClick={() => setEditAdmissionForm((form) => ({
                                      ...form,
                                      courses: form.courses.filter((_, currentIndex) => currentIndex !== courseIndex),
                                    }))}
                                    className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                                  >
                                    <Trash2 size={12} /> Remove Course
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => updateAdmissionDetail(index)}
                            disabled={!editAdmissionForm.country || editAdmissionForm.courses.some((course) => !course.name.trim()) || savingAdmission}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium"
                          >
                            {savingAdmission ? "Saving..." : "Update"}
                          </button>
                          <button
                            onClick={() => setEditingAdmission(null)}
                            className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm"
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
                            {canToggleAdmission && (
                              <button
                                onClick={() => toggleAdmissionClosed(index)}
                                className={`p-1.5 rounded-md transition-colors ${entry.closed ? "text-green-600 hover:bg-green-50" : "text-orange-400 hover:bg-orange-50"}`}
                                title={entry.closed ? "Reopen entry" : "Close entry"}
                              >
                                {entry.closed ? <Unlock size={13} /> : <Lock size={13} />}
                              </button>
                            )}
                            {canAdmission && !entry.closed && (
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
                                {canAdmission ? (
                                  <select
                                    value={entry.stage || ""}
                                    onChange={(e) => quickUpdateAdmission(index, "stage", e.target.value)}
                                    className="w-full text-xs font-semibold bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer text-center"
                                  >
                                    <option value="">—</option>
                                    {appLeadStages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                  </select>
                                ) : (
                                  <div className="text-center text-xs font-semibold px-2 py-1.5 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-100 truncate">
                                    {appLeadStages.find((s) => s.value === entry.stage)?.label || entry.stage || "—"}
                                  </div>
                                )}
                              </div>
                              {/* REMARKS */}
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Remarks</p>
                                {canAdmission ? (
                                  <select
                                    value={entry.remarks || ""}
                                    onChange={(e) => quickUpdateAdmission(index, "remarks", e.target.value)}
                                    className="w-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer text-center"
                                  >
                                    <option value="">—</option>
                                    {appRemarkOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                ) : (
                                  <div className="text-center text-xs font-semibold px-2 py-1.5 bg-amber-50 text-amber-800 rounded-lg border border-amber-100 truncate">
                                    {entry.remarks || "—"}
                                  </div>
                                )}
                              </div>
                              {/* STANDING */}
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Standing</p>
                                {canAdmission ? (
                                  <select
                                    value={entry.standing || ""}
                                    onChange={(e) => quickUpdateAdmission(index, "standing", e.target.value)}
                                    className="w-full text-xs font-semibold rounded-lg px-2 py-1.5 border focus:outline-none cursor-pointer text-center"
                                    style={{
                                      backgroundColor: entry.standing === "hot" ? "#fee2e2" : entry.standing === "warm" ? "#fed7aa" : entry.standing === "heated" ? "#fef3c7" : entry.standing === "cold" ? "#dbeafe" : "#f3f4f6",
                                      color: entry.standing === "hot" ? "#991b1b" : entry.standing === "warm" ? "#92400e" : entry.standing === "heated" ? "#b45309" : entry.standing === "cold" ? "#1e40af" : "#374151",
                                      borderColor: entry.standing === "hot" ? "#fca5a5" : entry.standing === "warm" ? "#fdba74" : entry.standing === "heated" ? "#fcd34d" : entry.standing === "cold" ? "#93c5fd" : "#e5e7eb",
                                    }}
                                  >
                                    <option value="">—</option>
                                    <option value="hot">🔴 Hot</option>
                                    <option value="warm">🟠 Warm</option>
                                    <option value="heated">🟡 Heated</option>
                                    <option value="cold">🔵 Cold</option>
                                    <option value="missed">⚪ Missed</option>
                                  </select>
                                ) : (
                                  <div className="text-center text-xs font-semibold px-2 py-1.5 rounded-lg border" style={{
                                    backgroundColor: entry.standing === "hot" ? "#fee2e2" : entry.standing === "warm" ? "#fed7aa" : entry.standing === "heated" ? "#fef3c7" : entry.standing === "cold" ? "#dbeafe" : "#f3f4f6",
                                    color: entry.standing === "hot" ? "#991b1b" : entry.standing === "warm" ? "#92400e" : entry.standing === "heated" ? "#b45309" : entry.standing === "cold" ? "#1e40af" : "#374151",
                                    borderColor: entry.standing === "hot" ? "#fca5a5" : entry.standing === "warm" ? "#fdba74" : entry.standing === "heated" ? "#fcd34d" : entry.standing === "cold" ? "#93c5fd" : "#e5e7eb",
                                  }}>
                                    {entry.standing ? entry.standing.charAt(0).toUpperCase() + entry.standing.slice(1) : "—"}
                                  </div>
                                )}
                              </div>
                              {/* PIPELINE */}
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Pipeline</p>
                                {canAdmission ? (
                                  <select
                                    value={entry.pipeline || ""}
                                    onChange={(e) => quickUpdateAdmission(index, "pipeline", e.target.value)}
                                    className="w-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200 rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer text-center"
                                  >
                                    <option value="">—</option>
                                    {appLeadStageGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                                  </select>
                                ) : (
                                  <div className="text-center text-xs font-semibold px-2 py-1.5 bg-purple-50 text-purple-800 rounded-lg border border-purple-100 truncate">
                                    {entry.pipeline || "—"}
                                  </div>
                                )}
                              </div>
                              {/* STATUS DATE */}
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Status Date</p>
                                {canAdmission ? (
                                  <input
                                    type="date"
                                    value={entry.statusDate ? entry.statusDate.split("T")[0] : ""}
                                    onChange={(e) => quickUpdateAdmission(index, "statusDate", e.target.value)}
                                    className="w-full text-xs text-gray-700 font-medium border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer bg-gray-50 text-center"
                                  />
                                ) : (
                                  <div className="text-center text-xs text-gray-600 font-medium px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                                    {entry.statusDate ? entry.statusDate.split("T")[0] : "—"}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Update button — shown when any field in this row has been changed */}
                          {canAdmission && dirtyAdmissionRows.has(index) && (
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
                ))}
              </div>
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

          {canVisa && selectedCountry && !student.countries.find((country) => country.country === selectedCountry)?.visaApprovedAt && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Visa Approval</h2>
              <p className="text-sm text-gray-500 mb-3">Mark visa as approved for {selectedCountry}. This will decrement counsellor target.</p>
              <button onClick={() => approveVisa(selectedCountry)} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Approve Visa for {selectedCountry}
              </button>
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
