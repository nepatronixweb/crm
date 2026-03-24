"use client";
import { useEffect, useState, Fragment } from "react";
import { useSession } from "next-auth/react";
import { Plus, Search, X, FileText, Phone, Mail } from "lucide-react";
import { formatDate, getStatusColor } from "@/lib/utils";
import Link from "next/link";

interface AdmissionEntry {
  _id: string;
  country: string;
  universityName?: string;
  stage?: string;
  pipeline?: string;
  standing?: string;
  remarks?: string;
  closed?: boolean;
}

interface Application {
  _id: string;
  student: {
    _id: string;
    name: string;
    email: string;
    phone: string;
    admissionDetails?: AdmissionEntry[];
  };
  country: string;
  universityName: string;
  course: string;
  status: string;
  submittedAt?: string;
  createdAt: string;
}

const APP_STATUSES = ["pending", "submitted", "accepted", "rejected", "deferred"];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  ...APP_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
];

const FIELD_CLASS =
  "w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-colors";

const LABEL_CLASS = "block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide";

export default function ApplicationsPage() {
  const { data: session } = useSession();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [students, setStudents] = useState<{ _id: string; name: string }[]>([]);
  const [form, setForm] = useState({ student: "", country: "", universityName: "", course: "", status: "pending" });
  const [appLeadStages, setAppLeadStages] = useState<{ value: string; label: string; group: string }[]>([]);
  const [appLeadStageGroups, setAppLeadStageGroups] = useState<string[]>([]);
  const [appRemarkOptions, setAppRemarkOptions] = useState<string[]>([]);

  const fetchApps = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/applications?${params}`);
    const data = await res.json();
    setApps(Array.isArray(data) ? data : (Array.isArray(data?.applications) ? data.applications : []));
    setLoading(false);
  };

  useEffect(() => {
    fetchApps();
    fetch("/api/students").then((r) => r.json()).then((s) => setStudents(Array.isArray(s) ? s : (Array.isArray(s?.students) ? s.students : [])));
    fetch("/api/settings/app")
      .then((r) => r.json())
      .then((d) => {
        if (d?.leadStages?.length) setAppLeadStages(d.leadStages);
        if (d?.leadStageGroups?.length) setAppLeadStageGroups(d.leadStageGroups);
        if (d?.remarkOptions?.length) setAppRemarkOptions(d.remarkOptions);
      }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    fetchApps();
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/applications/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchApps();
  };

  const quickUpdateAdmission = async (studentId: string, allEntries: AdmissionEntry[], entryIndex: number, field: string, value: string) => {
    const updatedDetails = allEntries.map((entry, i) =>
      i === entryIndex ? { ...entry, [field]: value } : entry
    );
    setApps((prev) =>
      prev.map((app) => {
        if (app.student._id !== studentId) return app;
        return { ...app, student: { ...app.student, admissionDetails: updatedDetails } };
      })
    );
    await fetch(`/api/students/${studentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admissionDetails: updatedDetails }),
    });
  };

  const filtered = apps.filter((a) =>
    a.universityName?.toLowerCase().includes(search.toLowerCase()) ||
    a.student?.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.country?.toLowerCase().includes(search.toLowerCase())
  );

  const canCreate = ["super_admin", "application_team", "counsellor"].includes(session?.user?.role || "");

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Applications</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? "Loading…" : `${filtered.length} of ${apps.length} applications`}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-700 text-white px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Add Application
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student, university or country…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`px-3 py-2 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap ${
                  filterStatus === opt.value
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-500 hover:text-gray-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Student", "University", "Country", "Course", "Status", "Date", "Update Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-14">
                    <div className="inline-flex flex-col items-center gap-2 text-gray-400">
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                      <span className="text-sm">Loading applications…</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-14">
                    <div className="inline-flex flex-col items-center gap-2 text-gray-400">
                      <FileText size={28} className="text-gray-300" />
                      <span className="text-sm">No applications found</span>
                      {search && (
                        <button
                          onClick={() => setSearch("")}
                          className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-800"
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filtered.map((app) => (
                <Fragment key={app._id}>
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-gray-600">
                          {app.student?.name?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <Link href={`/students/${app.student?._id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline underline-offset-2 transition-colors">{app.student?.name}</Link>
                        <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
                          <Phone size={9} className="text-gray-400 shrink-0" />
                          <a href={`tel:${app.student?.phone}`} className="tabular-nums hover:text-blue-600 hover:underline transition-colors">{app.student?.phone}</a>
                          {app.student?.phone && (
                            <a href={`https://wa.me/${app.student.phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Open WhatsApp" className="ml-1 shrink-0 hover:opacity-80 transition-opacity">
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#25D366]" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-gray-500">
                          <Mail size={9} className="text-gray-400 shrink-0" />
                          <a href={`mailto:${app.student?.email}`} className="truncate max-w-36 hover:text-blue-600 hover:underline transition-colors">{app.student?.email}</a>
                          {app.student?.email && (
                            <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(app.student.email)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Send Gmail" className="ml-1 shrink-0 hover:opacity-80 transition-opacity">
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.907 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/></svg>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-gray-700 max-w-40 truncate">{app.universityName}</td>
                  <td className="px-4 py-3.5 text-gray-600">{app.country}</td>
                  <td className="px-4 py-3.5 text-gray-600 max-w-36 truncate">{app.course}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${getStatusColor(app.status)}`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-500 tabular-nums whitespace-nowrap">
                    {formatDate(app.createdAt)}
                  </td>
                  <td className="px-4 py-3.5">
                    {canCreate && (
                      <select
                        value={app.status}
                        onChange={(e) => updateStatus(app._id, e.target.value)}
                        className="px-2.5 py-1.5 border border-gray-300 rounded-md text-xs text-gray-700 bg-white focus:outline-none focus:border-gray-500 transition-colors"
                      >
                        {APP_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
                {/* Admission detail sub-row for this application's matching entry */}
                {(() => {
                  const entries = app.student.admissionDetails || [];
                  const matchingEntries = entries.filter(
                    (e) => e.country?.toLowerCase() === app.country?.toLowerCase() ||
                      e.universityName?.toLowerCase() === app.universityName?.toLowerCase()
                  );
                  const entriesToShow = matchingEntries.length > 0 ? matchingEntries : entries;
                  if (entriesToShow.length === 0) return null;
                  return (
                    <tr className="bg-gray-50/60 border-b border-gray-100">
                      <td colSpan={7} className="px-4 py-0">
                        <div className="border border-gray-100 rounded-lg overflow-hidden my-2">
                          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-gray-100 bg-white">
                            {["University", "Stage", "Remarks", "Standing", "Pipeline"].map((col) => (
                              <div key={col} className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{col}</div>
                            ))}
                          </div>
                          {entriesToShow.map((entry, ei) => {
                            const globalIndex = entries.indexOf(entry);
                            return (
                              <div
                                key={entry._id || ei}
                                className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-gray-50 last:border-0 items-center bg-white ${entry.closed ? "opacity-50" : ""}`}
                              >
                                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                                  <span className="shrink-0 px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-100">{entry.country}</span>
                                  {entry.universityName && <span className="text-xs text-gray-700 font-medium truncate">{entry.universityName}</span>}
                                </div>
                                <div className="px-2 py-1.5">
                                  <select
                                    value={entry.stage || ""}
                                    disabled={entry.closed}
                                    onChange={(e) => quickUpdateAdmission(app.student._id, entries, globalIndex, "stage", e.target.value)}
                                    className="w-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-2 py-1 focus:outline-none cursor-pointer disabled:cursor-default"
                                  >
                                    <option value="">—</option>
                                    {appLeadStages.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                                  </select>
                                </div>
                                <div className="px-2 py-1.5">
                                  <select
                                    value={entry.remarks || ""}
                                    disabled={entry.closed}
                                    onChange={(e) => quickUpdateAdmission(app.student._id, entries, globalIndex, "remarks", e.target.value)}
                                    className="w-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-1 focus:outline-none cursor-pointer disabled:cursor-default"
                                  >
                                    <option value="">—</option>
                                    {appRemarkOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                </div>
                                <div className="px-2 py-1.5">
                                  <select
                                    value={entry.standing || ""}
                                    disabled={entry.closed}
                                    onChange={(e) => quickUpdateAdmission(app.student._id, entries, globalIndex, "standing", e.target.value)}
                                    className="w-full text-xs font-medium rounded-full px-2 py-1 border focus:outline-none cursor-pointer disabled:cursor-default"
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
                                </div>
                                <div className="px-2 py-1.5">
                                  <select
                                    value={entry.pipeline || ""}
                                    disabled={entry.closed}
                                    onChange={(e) => quickUpdateAdmission(app.student._id, entries, globalIndex, "pipeline", e.target.value)}
                                    className="w-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-1 focus:outline-none cursor-pointer disabled:cursor-default"
                                  >
                                    <option value="">—</option>
                                    {appLeadStageGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })()}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              Showing <span className="font-semibold text-gray-700">{filtered.length}</span> of{" "}
              <span className="font-semibold text-gray-700">{apps.length}</span> applications
            </p>
          </div>
        )}
      </div>

      {/* Add Application Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">New Application</h2>
                <p className="text-xs text-gray-500 mt-0.5">Attach an application to a student</p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className={LABEL_CLASS}>Student <span className="text-gray-400 normal-case font-normal tracking-normal">*</span></label>
                <select
                  required
                  value={form.student}
                  onChange={(e) => setForm({ ...form, student: e.target.value })}
                  className={FIELD_CLASS}
                >
                  <option value="">Select student</option>
                  {students.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>

              {[
                { label: "Country", key: "country" },
                { label: "University Name", key: "universityName" },
                { label: "Course", key: "course" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className={LABEL_CLASS}>
                    {label} <span className="text-gray-400 normal-case font-normal tracking-normal">*</span>
                  </label>
                  <input
                    required
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className={FIELD_CLASS}
                  />
                </div>
              ))}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gray-900 hover:bg-gray-700 text-white rounded-md text-sm font-medium transition-colors"
                >
                  Create Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
