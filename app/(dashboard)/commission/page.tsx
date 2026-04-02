"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, Banknote, Loader2, Plus, Search } from "lucide-react";
import { useBranding } from "@/app/branding-context";
import { hasPermission } from "@/lib/utils";
import {
  getCurrencySymbolForCountry,
  resolveCommissionPercent,
} from "@/lib/commissionMeta";

type CountryRow = { name: string; universities: string[] };

type StudentPick = {
  _id: string;
  name: string;
  admissionDetails?: Array<{
    country?: string;
    universityName?: string;
    studentId?: string;
    annualTuitionFee?: string;
    tuitionFeesPaid?: string;
    courses?: Array<{
      name?: string;
      commencementDate?: string;
      courseEndDate?: string;
      intakeQuarter?: string;
      intakeYear?: string;
    }>;
  }>;
};

const INTAKE_QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
const CLAIMABLE_INTAKE = [
  { value: "1st_sem", label: "1st sem" },
  { value: "2nd_sem", label: "2nd sem" },
  { value: "1_year", label: "1 year" },
] as const;
const B2B_CHANNEL = [
  { value: "direct", label: "Direct" },
  { value: "sub_agent", label: "Sub-agent" },
] as const;
const REMARKS_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "received", label: "Received" },
] as const;

const fieldClass =
  "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const labelClass = "block text-xs font-semibold text-gray-600 mb-1.5";

const emptyForm = {
  destinationCountry: "",
  applicantName: "",
  studentId: "",
  universityName: "",
  courseStartDate: "",
  courseEndDate: "",
  courseAnnualFee: "",
  tuitionFeePaid: "",
  amountFromPercent: "",
  intakeQuarter: "" as "" | "Q1" | "Q2" | "Q3" | "Q4",
  intakeYear: "",
  commission: "",
  claim: "",
  claimableIntake: "" as "" | "1st_sem" | "2nd_sem" | "1_year",
  b2bName: "",
  b2bChannel: "" as "" | "direct" | "sub_agent",
  commissionAmount: "",
  remarksStatus: "" as "" | "yes" | "received",
};

export default function CommissionPage() {
  const { data: session, status } = useSession();
  const branding = useBranding();
  const perms = (session?.user?.permissions ?? []) as string[];
  const role = session?.user?.role ?? "";
  const canAccess =
    status === "authenticated" &&
    (role === "super_admin" || hasPermission(perms, "commission", role));

  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [b2bNames, setB2bNames] = useState<string[]>([]);
  const [percentMap, setPercentMap] = useState<Record<string, number>>({});
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [studentQuery, setStudentQuery] = useState("");
  const [studentHits, setStudentHits] = useState<StudentPick[]>([]);
  const [studentLoading, setStudentLoading] = useState(false);

  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    fetch("/api/settings/app")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.countries)) {
          setCountries(
            d.countries.map((c: string | CountryRow) =>
              typeof c === "string" ? { name: c, universities: [] } : { name: c.name, universities: c.universities || [] }
            )
          );
        }
        if (Array.isArray(d?.b2bNames)) setB2bNames(d.b2bNames);
        if (d?.commissionPercentByCountry && typeof d.commissionPercentByCountry === "object") {
          setPercentMap(d.commissionPercentByCountry as Record<string, number>);
        }
      })
      .catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    if (!canAccess) return;
    setListLoading(true);
    fetch("/api/commissions?limit=100")
      .then((r) => r.json())
      .then((d) => setList(Array.isArray(d?.commissions) ? d.commissions : []))
      .finally(() => setListLoading(false));
  }, [canAccess]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const universitiesForCountry = useMemo(() => {
    const row = countries.find((c) => c.name === form.destinationCountry);
    return row?.universities?.length ? row.universities : [];
  }, [countries, form.destinationCountry]);

  const commissionPercent = resolveCommissionPercent(form.destinationCountry, percentMap);
  const currencySymbol = getCurrencySymbolForCountry(form.destinationCountry);

  const searchStudents = () => {
    const q = studentQuery.trim();
    if (q.length < 2) return;
    setStudentLoading(true);
    fetch(`/api/students?search=${encodeURIComponent(q)}&limit=25`)
      .then((r) => r.json())
      .then((d) => setStudentHits(Array.isArray(d?.students) ? d.students : []))
      .finally(() => setStudentLoading(false));
  };

  const applyStudent = (s: StudentPick) => {
    const country = form.destinationCountry;
    const det =
      (country && s.admissionDetails?.find((a) => a.country === country)) ||
      s.admissionDetails?.[0];
    const course = det?.courses?.[0];
    setForm((f) => ({
      ...f,
      applicantName: s.name,
      studentId: det?.studentId || s._id,
      universityName: det?.universityName || f.universityName,
      courseAnnualFee: det?.annualTuitionFee || f.courseAnnualFee,
      tuitionFeePaid: det?.tuitionFeesPaid || f.tuitionFeePaid,
      courseStartDate: course?.commencementDate || f.courseStartDate,
      courseEndDate: course?.courseEndDate || f.courseEndDate,
      intakeQuarter: (course?.intakeQuarter as typeof f.intakeQuarter) || f.intakeQuarter,
      intakeYear: course?.intakeYear || f.intakeYear,
    }));
    setStudentHits([]);
    setStudentQuery("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!form.destinationCountry || !form.applicantName.trim() || !form.universityName.trim()) {
      setMessage({ type: "err", text: "Destination, applicant name, and university are required." });
      return;
    }
    setSaving(true);
    const res = await fetch("/api/commissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        commissionPercent,
        currencySymbol,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMessage({ type: "err", text: data.error || "Could not save." });
      return;
    }
    setMessage({ type: "ok", text: "Commission record saved." });
    setForm(emptyForm);
    setShowCreateForm(false);
    loadList();
  };

  const openCreateForm = () => {
    setMessage(null);
    setForm(emptyForm);
    setStudentHits([]);
    setStudentQuery("");
    setShowCreateForm(true);
  };

  const closeCreateForm = () => {
    setShowCreateForm(false);
    setForm(emptyForm);
    setMessage(null);
    setStudentHits([]);
    setStudentQuery("");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center text-gray-500 text-sm">
        You don&apos;t have permission to access Commission.
      </div>
    );
  }

  const yearNow = new Date().getFullYear();
  const yearOptions = Array.from({ length: 12 }, (_, i) => String(yearNow - 4 + i));

  return (
    <div className={`space-y-8 ${showCreateForm ? "max-w-4xl" : "max-w-6xl"}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${branding.brandColor}18` }}>
            <Banknote className="w-7 h-7" style={{ color: branding.brandColor }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Commission</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {showCreateForm
                ? "Fill in the form to add a new commission record."
                : "View commission records or create a new entry."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showCreateForm ? (
            <button
              type="button"
              onClick={closeCreateForm}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={16} />
              Back to list
            </button>
          ) : (
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-opacity"
              style={{ backgroundColor: branding.brandColor }}
            >
              <Plus size={18} />
              Create a commission
            </button>
          )}
        </div>
      </div>

      {!showCreateForm && message && (
        <div
          className={`text-sm px-4 py-3 rounded-xl ${
            message.type === "ok" ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-800 border border-red-100"
          }`}
        >
          {message.text}
        </div>
      )}

      {showCreateForm && (
      <form onSubmit={submit} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-6">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Plus size={16} style={{ color: branding.brandColor }} />
          New commission
        </h2>

        {message && (
          <div
            className={`text-sm px-4 py-3 rounded-xl ${
              message.type === "ok" ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-800 border border-red-100"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Destination (country)</label>
            <select
              required
              value={form.destinationCountry}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  destinationCountry: e.target.value,
                  universityName: "",
                }))
              }
              className={fieldClass}
            >
              <option value="">Select country</option>
              {countries.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Applicant name</label>
            <input
              required
              value={form.applicantName}
              onChange={(e) => setForm((f) => ({ ...f, applicantName: e.target.value }))}
              className={fieldClass}
              placeholder="Full name"
            />
          </div>

          <div>
            <label className={labelClass}>Student ID</label>
            <input
              value={form.studentId}
              onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
              className={fieldClass}
              placeholder="Institution ID or internal ref."
            />
          </div>

          <div>
            <label className={labelClass}>University name</label>
            {universitiesForCountry.length > 0 ? (
              <select
                required
                value={form.universityName}
                onChange={(e) => setForm((f) => ({ ...f, universityName: e.target.value }))}
                className={fieldClass}
              >
                <option value="">Select university</option>
                {universitiesForCountry.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required
                value={form.universityName}
                onChange={(e) => setForm((f) => ({ ...f, universityName: e.target.value }))}
                className={fieldClass}
                placeholder={form.destinationCountry ? "Type university (add list in Settings → Countries)" : "Select destination first"}
              />
            )}
          </div>

          <div>
            <label className={labelClass}>Course start date</label>
            <input
              type="date"
              value={form.courseStartDate}
              onChange={(e) => setForm((f) => ({ ...f, courseStartDate: e.target.value }))}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Course end date</label>
            <input
              type="date"
              value={form.courseEndDate}
              onChange={(e) => setForm((f) => ({ ...f, courseEndDate: e.target.value }))}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Course annual fee</label>
            <input
              value={form.courseAnnualFee}
              onChange={(e) => setForm((f) => ({ ...f, courseAnnualFee: e.target.value }))}
              className={fieldClass}
              placeholder="e.g. 25000"
            />
          </div>

          <div>
            <label className={labelClass}>Tuition fee paid</label>
            <input
              value={form.tuitionFeePaid}
              onChange={(e) => setForm((f) => ({ ...f, tuitionFeePaid: e.target.value }))}
              className={fieldClass}
              placeholder="Amount paid to date"
            />
          </div>
        </div>

        {form.destinationCountry && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Commission % (this destination)</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {currencySymbol ? (
                  <>
                    {commissionPercent}% <span className="text-slate-500 font-normal">({currencySymbol})</span>
                  </>
                ) : (
                  <>{commissionPercent}%</>
                )}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Override per country in Settings (stored as commission %) if needed.</p>
            </div>
            <div>
              <label className={labelClass}>Amount (after %)</label>
              <div className="flex items-center gap-2">
                {currencySymbol && (
                  <span className="text-sm font-semibold text-gray-600 tabular-nums">{currencySymbol}</span>
                )}
                <input
                  value={form.amountFromPercent}
                  onChange={(e) => setForm((f) => ({ ...f, amountFromPercent: e.target.value }))}
                  className={fieldClass}
                  placeholder="Enter amount"
                />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Intake (quarter)</label>
            <select
              value={form.intakeQuarter}
              onChange={(e) => setForm((f) => ({ ...f, intakeQuarter: e.target.value as typeof f.intakeQuarter }))}
              className={fieldClass}
            >
              <option value="">Select</option>
              {INTAKE_QUARTERS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Year</label>
            <select
              value={form.intakeYear}
              onChange={(e) => setForm((f) => ({ ...f, intakeYear: e.target.value }))}
              className={fieldClass}
            >
              <option value="">Select year</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Commission</label>
            <input
              value={form.commission}
              onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
              className={fieldClass}
              placeholder="Notes or reference"
            />
          </div>

          <div>
            <label className={labelClass}>Claim</label>
            <input
              value={form.claim}
              onChange={(e) => setForm((f) => ({ ...f, claim: e.target.value }))}
              className={fieldClass}
              placeholder="Claim reference"
            />
          </div>

          <div>
            <label className={labelClass}>Claimable intake</label>
            <select
              value={form.claimableIntake}
              onChange={(e) => setForm((f) => ({ ...f, claimableIntake: e.target.value as typeof f.claimableIntake }))}
              className={fieldClass}
            >
              <option value="">Select</option>
              {CLAIMABLE_INTAKE.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>B2B</label>
            <select
              value={form.b2bName}
              onChange={(e) => setForm((f) => ({ ...f, b2bName: e.target.value }))}
              className={fieldClass}
            >
              <option value="">Select partner</option>
              {b2bNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>B2B type</label>
            <select
              value={form.b2bChannel}
              onChange={(e) => setForm((f) => ({ ...f, b2bChannel: e.target.value as typeof f.b2bChannel }))}
              className={fieldClass}
            >
              <option value="">Select</option>
              {B2B_CHANNEL.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Commission amount</label>
            <div className="flex items-center gap-2">
              {currencySymbol && form.destinationCountry ? (
                <span className="text-sm font-semibold text-gray-600">{currencySymbol}</span>
              ) : null}
              <input
                value={form.commissionAmount}
                onChange={(e) => setForm((f) => ({ ...f, commissionAmount: e.target.value }))}
                className={fieldClass}
                placeholder="Commission amount"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Remarks</label>
            <select
              value={form.remarksStatus}
              onChange={(e) => setForm((f) => ({ ...f, remarksStatus: e.target.value as typeof f.remarksStatus }))}
              className={fieldClass}
            >
              <option value="">Select</option>
              {REMARKS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className={labelClass}>Optional: load from student</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              className={`${fieldClass} flex-1 min-w-[200px]`}
              placeholder="Search by name, email, phone…"
            />
            <button
              type="button"
              onClick={() => searchStudents()}
              disabled={studentLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: branding.brandColor }}
            >
              {studentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
          {studentHits.length > 0 && (
            <ul className="mt-2 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-48 overflow-y-auto">
              {studentHits.map((s) => (
                <li key={s._id}>
                  <button
                    type="button"
                    onClick={() => applyStudent(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={closeCreateForm}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-2"
            style={{ backgroundColor: branding.brandColor }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save commission
          </button>
        </div>
      </form>
      )}

      {!showCreateForm && (
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800">Commission records</h3>
        </div>
        {listLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No records yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Applicant</th>
                  <th className="px-4 py-2">Destination</th>
                  <th className="px-4 py-2">University</th>
                  <th className="px-4 py-2">%</th>
                  <th className="px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {list.map((row) => (
                  <tr key={String(row._id)} className="text-gray-700">
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">
                      {row.createdAt ? new Date(String(row.createdAt)).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2">{String(row.applicantName ?? "")}</td>
                    <td className="px-4 py-2">{String(row.destinationCountry ?? "")}</td>
                    <td className="px-4 py-2 max-w-[180px] truncate">{String(row.universityName ?? "")}</td>
                    <td className="px-4 py-2 tabular-nums">{String(row.commissionPercent ?? "")}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {row.currencySymbol ? `${String(row.currencySymbol)} ` : ""}
                      {String(row.commissionAmount ?? row.amountFromPercent ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
