"use client";
import { useEffect, useState } from "react";
import { GraduationCap, Search, Phone, Mail } from "lucide-react";
import Link from "next/link";

interface AdmissionEntry {
  _id: string;
  country: string;
  universityName?: string;
  stage?: string;
  pipeline?: string;
  standing?: string;
  remarks?: string;
  statusDate?: string;
  closed?: boolean;
}

interface Student {
  _id: string;
  name: string;
  phone: string;
  email: string;
  enrolled: boolean;
  standing: string;
  currentStage: string;
  countries: Array<{ country: string; status: string; universityName?: string; admissionStatus?: string }>;
  admissionDetails?: AdmissionEntry[];
  counsellor: { name: string };
  enrolledAt?: string;
}

export default function AdmissionsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appLeadStages, setAppLeadStages] = useState<{ value: string; label: string; group: string }[]>([]);
  const [appLeadStageGroups, setAppLeadStageGroups] = useState<string[]>([]);
  const [appRemarkOptions, setAppRemarkOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/students?enrolled=true")
      .then((r) => r.json())
      .then((d) => { setStudents(Array.isArray(d) ? d : (Array.isArray(d?.students) ? d.students : [])); setLoading(false); });
    fetch("/api/settings/app")
      .then((r) => r.json())
      .then((d) => {
        if (d?.leadStages?.length) setAppLeadStages(d.leadStages);
        if (d?.leadStageGroups?.length) setAppLeadStageGroups(d.leadStageGroups);
        if (d?.remarkOptions?.length) setAppRemarkOptions(d.remarkOptions);
      }).catch(() => {});
  }, []);

  const quickUpdate = async (studentId: string, entryIndex: number, field: string, value: string) => {
    const today = new Date().toISOString().split("T")[0];
    let updatedDetails: AdmissionEntry[] = [];
    setStudents((prev) =>
      prev.map((s) => {
        if (s._id !== studentId) return s;
        const details = (s.admissionDetails || []).map((entry, i) => {
          if (i !== entryIndex) return entry;
          const patch: Partial<AdmissionEntry> = { [field]: value };
          if (field === "stage") patch.statusDate = today;
          return { ...entry, ...patch };
        });
        updatedDetails = details;
        return { ...s, admissionDetails: details };
      })
    );
    await fetch(`/api/students/${studentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admissionDetails: updatedDetails }),
    });
  };

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    const admissionMatches = s.admissionDetails?.some((entry) =>
      [entry.country, entry.universityName].filter(Boolean).some((v) => (v || "").toLowerCase().includes(q))
    ) ?? false;
    return (
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      admissionMatches
    );
  });

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 border border-gray-200 rounded-md">
            <GraduationCap size={16} className="text-gray-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Admissions</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? "Loadingâ€¦" : `${filtered.length} of ${students.length} enrolled students`}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student, destination, universityâ€¦"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-colors"
          />
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading && (
          <div className="bg-white border border-gray-200 rounded-lg p-14 text-center">
            <div className="inline-flex flex-col items-center gap-2 text-gray-400">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              <span className="text-sm">Loading admissionsâ€¦</span>
            </div>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-14 text-center">
            <div className="inline-flex flex-col items-center gap-2 text-gray-400">
              <GraduationCap size={28} className="text-gray-300" />
              <span className="text-sm">{search ? "No matching students found" : "No enrolled students yet"}</span>
              {search && (
                <button onClick={() => setSearch("")} className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-800">
                  Clear search
                </button>
              )}
            </div>
          </div>
        )}
        {!loading && filtered.map((s) => (
          <div key={s._id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {/* Student header row */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-gray-600">{s.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <Link href={`/students/${s._id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline underline-offset-2 transition-colors text-sm">
                    {s.name}
                  </Link>
                  <div className="flex items-center gap-3 mt-0.5">
                    <div className="flex items-center gap-1 text-[11px] text-gray-500">
                      <Phone size={9} className="text-gray-400 shrink-0" />
                      <a href={`tel:${s.phone}`} className="tabular-nums hover:text-blue-600 transition-colors">{s.phone}</a>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-gray-500">
                      <Mail size={9} className="text-gray-400 shrink-0" />
                      <a href={`mailto:${s.email}`} className="truncate max-w-44 hover:text-blue-600 transition-colors">{s.email}</a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {s.counsellor?.name && (
                  <span className="text-xs text-gray-500">{s.counsellor.name}</span>
                )}
                {s.enrolledAt && (
                  <span className="text-xs text-gray-400">
                    {new Date(s.enrolledAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
                <Link href={`/students/${s._id}`} className="text-xs font-medium text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-2.5 py-1 rounded transition-colors">
                  Manage
                </Link>
              </div>
            </div>

            {/* Admission entries table */}
            {s.admissionDetails && s.admissionDetails.length > 0 ? (
              <div>
                {/* Column headers */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] border-b border-gray-100 bg-gray-50">
                  {["University", "Stage", "Remarks", "Standing", "Pipeline", "Status Date"].map((col) => (
                    <div key={col} className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{col}</div>
                  ))}
                </div>
                {s.admissionDetails.map((entry, entryIndex) => (
                  <div
                    key={entry._id || entryIndex}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] border-b border-gray-50 last:border-0 items-center ${
                      entry.closed ? "opacity-50" : ""
                    }`}
                  >
                    {/* University + country */}
                    <div className="px-3 py-2.5 flex items-center gap-2 min-w-0">
                      <span className="shrink-0 px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-100">{entry.country}</span>
                      {entry.universityName && (
                        <span className="text-xs text-gray-700 font-medium truncate">{entry.universityName}</span>
                      )}
                    </div>
                    {/* Stage */}
                    <div className="px-2 py-2">
                      <select
                        value={entry.stage || ""}
                        disabled={entry.closed}
                        onChange={(e) => quickUpdate(s._id, entryIndex, "stage", e.target.value)}
                        className="w-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-2 py-1 focus:outline-none cursor-pointer disabled:cursor-default"
                      >
                        <option value="">â€”</option>
                        {appLeadStages.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                      </select>
                    </div>
                    {/* Remarks */}
                    <div className="px-2 py-2">
                      <select
                        value={entry.remarks || ""}
                        disabled={entry.closed}
                        onChange={(e) => quickUpdate(s._id, entryIndex, "remarks", e.target.value)}
                        className="w-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-1 focus:outline-none cursor-pointer disabled:cursor-default"
                      >
                        <option value="">â€”</option>
                        {appRemarkOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    {/* Standing */}
                    <div className="px-2 py-2">
                      <select
                        value={entry.standing || ""}
                        disabled={entry.closed}
                        onChange={(e) => quickUpdate(s._id, entryIndex, "standing", e.target.value)}
                        className="w-full text-xs font-medium rounded-full px-2 py-1 border focus:outline-none cursor-pointer disabled:cursor-default"
                        style={{
                          backgroundColor: entry.standing === "hot" ? "#fee2e2" : entry.standing === "warm" ? "#fed7aa" : entry.standing === "heated" ? "#fef3c7" : entry.standing === "cold" ? "#dbeafe" : "#f3f4f6",
                          color: entry.standing === "hot" ? "#991b1b" : entry.standing === "warm" ? "#92400e" : entry.standing === "heated" ? "#b45309" : entry.standing === "cold" ? "#1e40af" : "#374151",
                          borderColor: entry.standing === "hot" ? "#fca5a5" : entry.standing === "warm" ? "#fdba74" : entry.standing === "heated" ? "#fcd34d" : entry.standing === "cold" ? "#93c5fd" : "#e5e7eb",
                        }}
                      >
                        <option value="">â€”</option>
                        <option value="hot">ðŸ”´ Hot</option>
                        <option value="warm">ðŸŸ  Warm</option>
                        <option value="heated">ðŸŸ¡ Heated</option>
                        <option value="cold">ðŸ”µ Cold</option>
                        <option value="missed">âšª Missed</option>
                      </select>
                    </div>
                    {/* Pipeline */}
                    <div className="px-2 py-2">
                      <select
                        value={entry.pipeline || ""}
                        disabled={entry.closed}
                        onChange={(e) => quickUpdate(s._id, entryIndex, "pipeline", e.target.value)}
                        className="w-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-1 focus:outline-none cursor-pointer disabled:cursor-default"
                      >
                        <option value="">—</option>
                        {appLeadStageGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    {/* Status Date */}
                    <div className="px-2 py-2">
                      <input
                        type="date"
                        value={entry.statusDate ? entry.statusDate.split("T")[0] : ""}
                        disabled={entry.closed}
                        onChange={(e) => quickUpdate(s._id, entryIndex, "statusDate", e.target.value)}
                        className="text-xs text-gray-600 font-medium border border-gray-200 rounded-full px-2 py-1 focus:outline-none bg-gray-50 cursor-pointer disabled:cursor-default w-32"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-xs text-gray-400 italic">No admission entries</div>
            )}
          </div>
        ))}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          Showing {filtered.length} of {students.length} students
        </p>
      )}
    </div>
  );
}
