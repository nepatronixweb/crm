"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  FileText, Download, Trash2, Search,
  CheckCircle, Eye, Upload, Plus, X, CloudUpload,
  ArrowLeft, ChevronRight,
} from "lucide-react";
import { formatDate, COUNTRIES } from "@/lib/utils";

const DEFAULT_COUNTRIES = COUNTRIES;

interface Document {
  _id: string;
  name: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  country: string;
  isVerified: boolean;
  uploadedBy: { name: string };
  createdAt: string;
  student: {
    _id: string;
    name: string;
    phone: string;
  };
}

const VERIFY_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "true", label: "Verified" },
  { value: "false", label: "Pending" },
];

// File type icon
function FileIcon({ type }: { type: string }) {
  const isPdf = type?.includes("pdf");
  const isImg = type?.includes("image");
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
      isPdf ? "bg-red-50 border border-red-100" : isImg ? "bg-blue-50 border border-blue-100" : "bg-gray-100 border border-gray-200"
    }`}>
      <FileText size={18} className={isPdf ? "text-red-500" : isImg ? "text-blue-500" : "text-gray-400"} />
    </div>
  );
}

export default function DocumentsPage() {
  const { data: session } = useSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState("");

  // Which student folder is open (null = grid view)
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  // Upload modal state
  const [showModal, setShowModal] = useState(false);
  const [students, setStudents] = useState<{ _id: string; name: string; phone: string }[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadForm, setUploadForm] = useState({ studentId: "", country: "", name: "", file: null as File | null });
  const [appCountries, setAppCountries] = useState<string[]>(DEFAULT_COUNTRIES);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (countryFilter) params.set("country", countryFilter);
    if (verifiedFilter !== "") params.set("isVerified", verifiedFilter);
    const res = await fetch(`/api/documents?${params}`);
    const data = await res.json();
    setDocuments(data.documents || []);
    setLoading(false);
  }, [countryFilter, verifiedFilter]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchDocuments(); }, [countryFilter, verifiedFilter]);

  useEffect(() => {
    fetch("/api/settings/app").then(r => r.json()).then(d => {
      if (d?.countries?.length) {
        setAppCountries(d.countries.map((c: string | { name: string }) => typeof c === "string" ? c : c.name));
      }
    }).catch(() => {});
  }, []);

  const toggleVerify = async (docId: string, current: boolean) => {
    const res = await fetch(`/api/documents/${docId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isVerified: !current }),
    });
    if (res.ok) fetchDocuments();
  };

  const deleteDoc = async (docId: string) => {
    if (!confirm("Delete this document?")) return;
    const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
    if (res.ok) {
      fetchDocuments();
      // close folder if all docs deleted
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const filtered = documents.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.student?.name.toLowerCase().includes(search.toLowerCase()) ||
      d.originalName.toLowerCase().includes(search.toLowerCase())
  );

  const canVerify = session?.user?.role === "super_admin" || session?.user?.role === "application_team";
  const canUpload = ["super_admin", "application_team", "counsellor", "front_desk"].includes(session?.user?.role || "");

  // Group by student
  const groupedDocs = filtered.reduce<Record<string, { studentName: string; studentPhone: string; docs: typeof filtered }>>(
    (acc, doc) => {
      const key = doc.student?._id ?? "__no_student__";
      if (!acc[key]) {
        acc[key] = {
          studentName: doc.student?.name ?? "Unknown Student",
          studentPhone: doc.student?.phone ?? "",
          docs: [],
        };
      }
      acc[key].docs.push(doc);
      return acc;
    },
    {}
  );

  const openFolderGroup = openFolder ? groupedDocs[openFolder] : null;

  const openModal = async () => {
    setUploadForm({ studentId: "", country: "", name: "", file: null });
    setStudentSearch("");
    setUploadError("");
    setShowModal(true);
    if (students.length === 0) {
      const res = await fetch("/api/students");
      const data = await res.json();
      const studentsArr = Array.isArray(data) ? data : (Array.isArray(data?.students) ? data.students : []);
      setStudents(studentsArr.map((s: { _id: string; name: string; phone: string }) => ({ _id: s._id, name: s.name, phone: s.phone })));
    }
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    setUploadForm((f) => ({
      ...f,
      file,
      name: f.name || file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
    }));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file) { setUploadError("Please select a file."); return; }
    if (!uploadForm.studentId) { setUploadError("Please select a student."); return; }
    setUploading(true);
    setUploadError("");
    try {
      const { uploadFile } = await import("@/lib/upload");
      const uploadData = await uploadFile(uploadForm.file);
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: uploadForm.studentId,
          country: uploadForm.country,
          name: uploadForm.name || uploadForm.file.name,
          fileUrl: uploadData.url,
          originalName: uploadData.originalName,
          fileSize: uploadData.fileSize,
          fileType: uploadData.fileType,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowModal(false);
        fetchDocuments();
      } else {
        setUploadError(data?.error || "Failed to save document record.");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.phone.includes(studentSearch)
  );

  return (
    <>
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* â”€â”€ Page Header â”€â”€ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {openFolder && (
            <button
              onClick={() => setOpenFolder(null)}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors text-gray-500 hover:text-gray-800"
              title="Back to all folders"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-1.5 text-sm text-gray-400">
              <button
                onClick={() => setOpenFolder(null)}
                className={`hover:text-gray-700 transition-colors ${!openFolder ? "text-gray-900 font-semibold pointer-events-none" : ""}`}
              >
                Documents
              </button>
              {openFolder && openFolderGroup && (
                <>
                  <ChevronRight size={13} className="text-gray-300" />
                  <span className="text-gray-900 font-semibold">{openFolderGroup.studentName}</span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? "Loadingâ€¦" : openFolder && openFolderGroup
                ? `${openFolderGroup.docs.length} document${openFolderGroup.docs.length !== 1 ? "s" : ""}`
                : `${Object.keys(groupedDocs).length} folders Â· ${filtered.length} documents`}
            </p>
          </div>
        </div>
        {canUpload && (
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-700 text-white px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Add Document
          </button>
        )}
      </div>

      {/* â”€â”€ Filter Bar â”€â”€ */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder={openFolder ? "Search documentsâ€¦" : "Search by student or documentâ€¦"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-md text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-700 bg-white focus:outline-none focus:border-gray-400 transition-colors"
            >
              <option value="">All Countries</option>
              {appCountries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {VERIFY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setVerifiedFilter(opt.value)}
                className={`px-3 py-2 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap ${
                  verifiedFilter === opt.value
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* â”€â”€ Content â”€â”€ */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          <span className="text-sm">Loadingâ€¦</span>
        </div>
      ) : !openFolder ? (
        /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           FOLDER GRID VIEW
           â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
        Object.keys(groupedDocs).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <Upload size={32} className="text-gray-300" />
            <p className="text-sm">No documents yet</p>
            {search && (
              <button onClick={() => setSearch("")} className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-800">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
            {Object.entries(groupedDocs).map(([key, group]) => {
              const hasVerified = group.docs.some((d) => d.isVerified);
              const pendingCount = group.docs.filter((d) => !d.isVerified).length;
              return (
                <button
                  key={key}
                  type="button"
                  onDoubleClick={() => setOpenFolder(key)}
                  onClick={() => setOpenFolder(key)}
                  className="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-amber-50/60 active:bg-amber-100/80 transition-colors cursor-pointer select-none"
                  title={`${group.docs.length} files â€” double-click to open`}
                >
                  {/* Folder icon */}
                  <div className="relative">
                    {/* Folder body using divs */}
                    <div className="relative w-20 h-16">
                      {/* Tab */}
                      <div className="absolute top-0 left-0 w-8 h-3 bg-amber-400 rounded-tl-md rounded-tr-lg" />
                      {/* Body shadow */}
                      <div className="absolute top-2.5 left-0 right-0 bottom-0 bg-amber-600/20 rounded-b-xl translate-y-0.5 blur-[2px]" />
                      {/* Body */}
                      <div className="absolute top-2.5 left-0 right-0 bottom-0 bg-amber-400 rounded-b-xl rounded-tr-xl overflow-hidden">
                        {/* Shine */}
                        <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-amber-300/60 to-transparent" />
                        {/* Inner shine line */}
                        <div className="absolute top-1 left-2 right-2 h-px bg-amber-200/70 rounded" />
                      </div>
                      {/* Doc count badge */}
                      <div className="absolute -top-1 -right-1 z-10 min-w-[18px] h-[18px] flex items-center justify-center bg-gray-800 text-white text-[10px] font-bold rounded-full px-1 shadow">
                        {group.docs.length}
                      </div>
                      {/* Pending dot */}
                      {pendingCount > 0 && (
                        <div className="absolute bottom-1.5 right-2 w-2 h-2 rounded-full bg-orange-500 shadow" title={`${pendingCount} pending`} />
                      )}
                      {hasVerified && pendingCount === 0 && (
                        <div className="absolute bottom-1.5 right-2 w-2 h-2 rounded-full bg-green-500 shadow" title="All verified" />
                      )}
                    </div>
                  </div>

                  {/* Label */}
                  <div className="text-center w-full">
                    <p className="text-xs font-semibold text-gray-800 truncate w-full group-hover:text-amber-800 transition-colors leading-tight">
                      {group.studentName}
                    </p>
                    {group.studentPhone && (
                      <p className="text-[10px] text-gray-400 tabular-nums mt-0.5 truncate">
                        {group.studentPhone}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           FOLDER CONTENTS VIEW
           â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
        openFolderGroup ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Folder header */}
            <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border-b border-amber-100">
              <div className="relative w-10 h-8 shrink-0">
                <div className="absolute top-0 left-0 w-4 h-1.5 bg-amber-400 rounded-tl-sm rounded-tr-md" />
                <div className="absolute top-1.5 left-0 right-0 bottom-0 bg-amber-400 rounded-b-lg rounded-tr-lg overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-amber-300/60 to-transparent" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{openFolderGroup.studentName}</p>
                {openFolderGroup.studentPhone && (
                  <p className="text-xs text-gray-400 tabular-nums">{openFolderGroup.studentPhone}</p>
                )}
              </div>
              <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full">
                {openFolderGroup.docs.length} {openFolderGroup.docs.length === 1 ? "file" : "files"}
              </span>
            </div>

            {/* Document list */}
            <div className="divide-y divide-gray-50">
              {openFolderGroup.docs.map((doc) => (
                <div key={doc._id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                  <FileIcon type={doc.fileType} />

                  {/* Name + original */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400 truncate">{doc.originalName}</p>
                  </div>

                  {/* Country */}
                  {doc.country && (
                    <span className="hidden sm:inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap shrink-0">
                      {doc.country}
                    </span>
                  )}

                  {/* Size */}
                  <span className="hidden md:block text-xs text-gray-400 tabular-nums whitespace-nowrap shrink-0 w-16 text-right">
                    {formatBytes(doc.fileSize)}
                  </span>

                  {/* Uploaded By */}
                  <span className="hidden lg:block text-xs text-gray-500 whitespace-nowrap shrink-0 w-32 truncate">
                    {doc.uploadedBy?.name || "â€”"}
                  </span>

                  {/* Date */}
                  <span className="hidden md:block text-xs text-gray-400 tabular-nums whitespace-nowrap shrink-0">
                    {formatDate(doc.createdAt)}
                  </span>

                  {/* Status */}
                  <div className="shrink-0">
                    {doc.isVerified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                        <CheckCircle size={10} />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-600 border border-orange-200">
                        Pending
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <a
                      href={doc.filePath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      title="Preview"
                    >
                      <Eye size={14} />
                    </a>
                    <a
                      href={doc.filePath}
                      download={doc.originalName}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      title="Download"
                    >
                      <Download size={14} />
                    </a>
                    {canVerify && (
                      <button
                        onClick={() => toggleVerify(doc._id, doc.isVerified)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        title={doc.isVerified ? "Mark as Pending" : "Mark as Verified"}
                      >
                        <CheckCircle size={14} className={doc.isVerified ? "text-green-600" : ""} />
                      </button>
                    )}
                    {session?.user?.role === "super_admin" && (
                      <button
                        onClick={() => deleteDoc(doc._id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {openFolderGroup.docs.filter(d => d.isVerified).length} verified Â· {openFolderGroup.docs.filter(d => !d.isVerified).length} pending
              </p>
              <button
                onClick={() => setOpenFolder(null)}
                className="text-xs text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
              >
                <ArrowLeft size={11} />
                All folders
              </button>
            </div>
          </div>
        ) : null
      )}
    </div>

    {/* â”€â”€â”€ Upload Document Modal â”€â”€â”€ */}
    {showModal && (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 border border-gray-200 rounded-md">
                <CloudUpload size={16} className="text-gray-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Upload Document</h2>
                <p className="text-xs text-gray-500 mt-0.5">Add a document for a student record</p>
              </div>
            </div>
            <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
              <X size={16} className="text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleUpload} className="px-6 py-5 space-y-6">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Student</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Search Student</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Name or phoneâ€¦"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-colors"
                    />
                  </div>
                </div>
                {studentSearch && filteredStudents.length > 0 && (
                  <div className="border border-gray-200 rounded-md overflow-hidden divide-y divide-gray-100 max-h-40 overflow-y-auto">
                    {filteredStudents.slice(0, 8).map((s) => (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => { setUploadForm((f) => ({ ...f, studentId: s._id })); setStudentSearch(s.name); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${uploadForm.studentId === s._id ? "bg-gray-50" : ""}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-gray-600">{s.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.phone}</p>
                        </div>
                        {uploadForm.studentId === s._id && <CheckCircle size={14} className="ml-auto text-gray-700 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
                {uploadForm.studentId && (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <CheckCircle size={12} className="text-gray-600" /> Student selected
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Document Details</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Document Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Passport Copy, Bank Statementâ€¦"
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Destination Country</label>
                  <select
                    value={uploadForm.country}
                    onChange={(e) => setUploadForm((f) => ({ ...f, country: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-colors"
                  >
                    <option value="">â€” Select country â€”</option>
                    {appCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">File</p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileChange(f); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-gray-400 bg-gray-50" : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"}`}
              >
                {uploadForm.file ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="p-2 bg-gray-100 border border-gray-200 rounded-md">
                      <FileText size={16} className="text-gray-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{uploadForm.file?.name}</p>
                      <p className="text-xs text-gray-500">{((uploadForm.file?.size ?? 0) / 1024).toFixed(1)} KB â€” click to change</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload size={20} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm font-medium text-gray-700">Drop file here or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG â€” max 10 MB</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
              </div>
            </div>

            {uploadError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-2.5">{uploadError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-colors ${uploading ? "bg-gray-400 cursor-not-allowed text-white" : "bg-gray-900 hover:bg-gray-700 text-white"}`}
              >
                {uploading ? (
                  <><span className="border-2 border-white/40 border-t-white rounded-full animate-spin w-3.5 h-3.5" />Uploadingâ€¦</>
                ) : (
                  <><CloudUpload size={14} />Upload Document</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}

