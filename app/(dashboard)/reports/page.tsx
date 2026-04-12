"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";
import {
  BarChart3,
  Users,
  GraduationCap,
  FileText,
  TrendingUp,
  Percent,
  LayoutDashboard,
  ChevronRight,
  Table2,
  Activity,
  Phone,
  Clock,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useFdStatusOptions } from "@/lib/useFdStatusOptions";
import { resolveFdStatusPresentation } from "@/lib/fdStatusOptions";

const GRAY_PALETTE = ["#111827", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#e5e7eb", "#f3f4f6", "#f9fafb"];
const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  fontSize: "13px",
  padding: "8px 12px",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.07)",
};

interface AnalyticsSummary {
  totalLeads: number;
  totalStudents: number;
  totalApplications: number;
  convertedLeads: number;
  conversionRate: number;
  leadsCounselled: number;
  conditionalOffers: number;
  unconditionalOffers: number;
  coeReceived: number;
  gsApplied: number;
  visaLodged: number;
  granted: number;
  rejected: number;
}

interface CountRow {
  _id: string;
  count: number;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  leadsBySource: CountRow[];
  leadsByStatus: CountRow[];
  studentsByStage: CountRow[];
  applicationsByStatus: CountRow[];
  applicationsByCountry: CountRow[];
  counsellorPerformance: Array<{
    _id: string;
    name: string;
    target: number;
    currentCount: number;
    branch?: { name: string };
  }>;
  recentLeads?: Array<{
    _id: string;
    name: string;
    source: string;
    status: string;
    standing: string;
    interestedCountry: string;
    createdAt: string;
    branch?: { name: string };
    assignedTo?: { name: string };
  }>;
  recentActivity?: Array<{
    _id: string;
    userName: string;
    action: string;
    module: string;
    targetName: string;
    createdAt: string;
  }>;
}

function toISORange(fromYmd: string, toYmd: string): { from?: string; to?: string } {
  if (!fromYmd && !toYmd) return {};
  return {
    from: fromYmd ? new Date(fromYmd + "T00:00:00").toISOString() : undefined,
    to: toYmd ? new Date(toYmd + "T23:59:59").toISOString() : undefined,
  };
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PRESETS: { id: string; label: string; getRange: () => { from: string; to: string } }[] = [
  { id: "all", label: "All time", getRange: () => ({ from: "", to: "" }) },
  {
    id: "today",
    label: "Today",
    getRange: () => {
      const t = ymd(new Date());
      return { from: t, to: t };
    },
  },
  {
    id: "week",
    label: "Last 7 days",
    getRange: () => {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: ymd(start), to: ymd(now) };
    },
  },
  {
    id: "3m",
    label: "Last 3 months",
    getRange: () => {
      const now = new Date();
      const start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      return { from: ymd(start), to: ymd(now) };
    },
  },
  {
    id: "year",
    label: "This year",
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: ymd(start), to: ymd(now) };
    },
  },
];

function humanizeKey(s: string) {
  return String(s || "-").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortByCountDesc(rows: CountRow[]): CountRow[] {
  return [...rows].sort((a, b) => b.count - a.count);
}

function totalCount(rows: CountRow[]): number {
  return rows.reduce((s, r) => s + r.count, 0) || 1;
}

/** Full-width data table: every row visible with scroll if long */
function BreakdownSection({
  title,
  description,
  rows,
  rawKeyLabel = "Category",
  chartFill = "#374151",
}: {
  title: string;
  description: string;
  rows: CountRow[];
  rawKeyLabel?: string;
  chartFill?: string;
}) {
  const sorted = useMemo(() => sortByCountDesc(rows), [rows]);
  const total = totalCount(sorted);
  const chartData = sorted.map((r) => ({
    label: humanizeKey(String(r._id)),
    count: r.count,
    pct: Math.round((r.count / total) * 1000) / 10,
  }));
  const chartHeight = Math.min(Math.max(sorted.length * 40, 200), 560);

  if (sorted.length === 0) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <header className="px-5 py-4 border-b border-gray-200 bg-gray-50/90">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </header>
        <p className="px-5 py-12 text-center text-sm text-gray-400">No records for this period.</p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <header className="px-5 py-4 border-b border-gray-200 bg-gray-50/90 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
        <p className="text-sm text-gray-600 tabular-nums">
          Total: <span className="font-semibold text-gray-900">{total}</span> records
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-0 xl:divide-x divide-gray-200">
        <div className="p-5 max-h-[min(70vh,520px)] overflow-y-auto">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <Table2 size={14} />
            Detail table
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-2.5 pr-3 text-xs font-semibold text-gray-500 w-10">#</th>
                <th className="py-2.5 pr-3 text-xs font-semibold text-gray-500">{rawKeyLabel}</th>
                <th className="py-2.5 pr-3 text-xs font-semibold text-gray-500 text-right w-24">Count</th>
                <th className="py-2.5 text-xs font-semibold text-gray-500 text-right w-20">%</th>
                <th className="py-2.5 pl-3 text-xs font-semibold text-gray-500 min-w-[120px] hidden md:table-cell">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((r, i) => {
                const pct = (r.count / total) * 100;
                return (
                  <tr key={`${String(r._id)}-${i}`} className="hover:bg-gray-50/80">
                    <td className="py-2.5 pr-3 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="py-2.5 pr-3 font-medium text-gray-900 break-words max-w-[200px]">
                      {humanizeKey(String(r._id))}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-gray-900">{r.count}</td>
                    <td className="py-2.5 text-right tabular-nums text-gray-600">
                      {pct >= 0.1 ? pct.toFixed(1) : "<0.1"}%
                    </td>
                    <td className="py-2 pl-3 hidden md:table-cell">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-800 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-5 bg-gray-50/40 min-h-[200px]">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <BarChart3 size={14} />
            Bar chart (same data)
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                tick={{ fontSize: 11, fill: "#374151" }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value, _n, item) => {
                  const v = typeof value === "number" ? value : 0;
                  const pct = (item?.payload as { pct?: number } | undefined)?.pct ?? 0;
                  return [`${v} (${pct}%)`, "Count"];
                }}
              />
              <Bar dataKey="count" fill={chartFill} radius={[0, 4, 4, 0]} maxBarSize={28}>
                <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const fdStatusOptions = useFdStatusOptions();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: "", to: "" });
  const [activePreset, setActivePreset] = useState<string>("all");

  const loadAnalytics = useCallback(async (fromYmd: string, toYmd: string) => {
    setLoading(true);
    const { from, to } = toISORange(fromYmd, toYmd);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    try {
      const res = await fetch(`/api/analytics${qs ? `?${qs}` : ""}`);
      const d = await res.json();
      if (d?.error) setData(null);
      else setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics("", "");
  }, [loadAnalytics]);

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    const { from, to } = preset.getRange();
    setFilters({ from, to });
    loadAnalytics(from, to);
  };

  const applyManualFilters = () => {
    setActivePreset("");
    loadAnalytics(filters.from, filters.to);
  };

  const clearFilters = () => {
    setFilters({ from: "", to: "" });
    setActivePreset("all");
    loadAnalytics("", "");
  };

  const periodDescription = useMemo(() => {
    if (filters.from && filters.to) return `${filters.from} → ${filters.to}`;
    if (filters.from) return `From ${filters.from}`;
    if (filters.to) return `Until ${filters.to}`;
    const p = PRESETS.find((x) => x.id === activePreset);
    return p?.label ?? "All time";
  }, [filters.from, filters.to, activePreset]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-flex flex-col items-center gap-2 text-gray-400">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          <span className="text-sm">Loading analytics…</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
          <LayoutDashboard size={14} />
          Back to dashboard
        </Link>
        <div className="flex flex-col items-center justify-center h-48 gap-2 rounded-lg border border-gray-200 bg-white text-gray-400">
          <BarChart3 size={28} className="text-gray-300" />
          <span className="text-sm">Analytics could not be loaded. You may not have permission.</span>
        </div>
      </div>
    );
  }

  const s = data.summary;
  const sourceRows = data.leadsBySource ?? [];
  const sourceSorted = sortByCountDesc(sourceRows);
  const sourceTotal = totalCount(sourceRows);
  const sourceData = sourceSorted.map((x) => ({
    name: humanizeKey(String(x._id)),
    value: x.count,
    pct: Math.round((x.count / sourceTotal) * 1000) / 10,
  }));

  const SUMMARY_PRIMARY = [
    { label: "Total leads", value: s.totalLeads, hint: "In period", icon: Users },
    { label: "Students", value: s.totalStudents, hint: "Student records", icon: GraduationCap },
    { label: "Applications", value: s.totalApplications, hint: "Application rows", icon: FileText },
    { label: "Converted leads", value: s.convertedLeads, hint: "Became students", icon: TrendingUp },
    { label: "Conversion rate", value: `${s.conversionRate}%`, hint: "Leads → students", icon: Percent },
    {
      label: "Counselled",
      value: s.leadsCounselled ?? 0,
      hint: "Leads marked Counselled or Phone counselling (by status date in range)",
      icon: Clock,
    },
  ];

  const SUMMARY_PIPELINE = [
    { label: "Conditional offers", value: s.conditionalOffers },
    { label: "Unconditional offers", value: s.unconditionalOffers },
    { label: "COE received", value: s.coeReceived },
    { label: "GS applied", value: s.gsApplied },
    { label: "Visa lodged", value: s.visaLodged },
    { label: "Visa granted", value: s.granted },
    { label: "Rejected / closed", value: s.rejected },
  ];

  const recentLeads = data.recentLeads ?? [];
  const recentActivity = data.recentActivity ?? [];

  return (
    <div className={`space-y-8 max-w-7xl mx-auto pb-10 ${loading ? "opacity-60 pointer-events-none" : ""}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
            <BarChart3 size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">
              Full breakdown for <span className="font-medium text-gray-800">{periodDescription}</span>
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 transition-colors shrink-0"
        >
          <LayoutDashboard size={16} className="text-gray-500" />
          Dashboard
          <ChevronRight size={14} className="text-gray-400" />
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick range</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  activePreset === p.id
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-gray-100 pt-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Custom range</p>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">From</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => {
                  setActivePreset("");
                  setFilters({ ...filters, from: e.target.value });
                }}
                className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">To</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => {
                  setActivePreset("");
                  setFilters({ ...filters, to: e.target.value });
                }}
                className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyManualFilters}
                className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Apply range
              </button>
              {(filters.from || filters.to) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-4 py-2.5 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-lg text-sm font-medium bg-white"
                >
                  Reset to all time
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPIs */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Core metrics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {SUMMARY_PRIMARY.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 leading-tight">{card.label}</p>
                  <div className="p-1.5 bg-gray-50 border border-gray-200 rounded-md">
                    <Icon size={14} className="text-gray-600" />
                  </div>
                </div>
                <p className="text-2xl font-semibold text-gray-900 tabular-nums tracking-tight">{card.value}</p>
                <p className="text-[11px] text-gray-400 mt-1">{card.hint}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pipeline KPIs */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Admissions &amp; visa (from student pipeline)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {SUMMARY_PIPELINE.map((row) => (
            <div key={row.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-500 leading-snug">{row.label}</p>
              <p className="text-xl font-semibold text-gray-900 tabular-nums mt-1">{row.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Leads by source: pie + table */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <header className="px-5 py-4 border-b border-gray-200 bg-gray-50/90">
          <h2 className="text-base font-semibold text-gray-900">Leads by source</h2>
          <p className="text-sm text-gray-500 mt-0.5">Where enquiries originated - table lists every source with count and share</p>
        </header>
        {sourceData.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-gray-400">No lead data for this period.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-gray-200">
            <div className="p-5 flex flex-col items-center justify-center min-h-[280px]">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={48}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={GRAY_PALETTE[i % GRAY_PALETTE.length]} stroke="#fff" strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value, _k, props) => {
                      const v = typeof value === "number" ? value : 0;
                      const pct = (props?.payload as { pct?: number } | undefined)?.pct ?? 0;
                      return [`${v} (${pct}% of leads)`, "Count"];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="p-5 max-h-[min(70vh,400px)] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 text-xs font-semibold text-gray-500">Source</th>
                    <th className="py-2 text-xs font-semibold text-gray-500 text-right">Count</th>
                    <th className="py-2 text-xs font-semibold text-gray-500 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sourceData.map((row) => (
                    <tr key={row.name} className="hover:bg-gray-50/80">
                      <td className="py-2.5 font-medium text-gray-900">{row.name}</td>
                      <td className="py-2.5 text-right tabular-nums font-semibold">{row.value}</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-600">{row.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <BreakdownSection
        title="Leads by standing"
        description="Engagement temperature (hot, warm, cold, etc.) - full list with percentages"
        rows={data.leadsByStatus ?? []}
        rawKeyLabel="Standing"
        chartFill="#111827"
      />

      <BreakdownSection
        title="Students by stage"
        description="Current student pipeline stage for the selected period"
        rows={data.studentsByStage ?? []}
        rawKeyLabel="Stage"
        chartFill="#1f2937"
      />

      <BreakdownSection
        title="Applications by country"
        description="Student destination countries (each country on a student record) plus standalone application records - merged and sorted by count"
        rows={data.applicationsByCountry ?? []}
        rawKeyLabel="Country"
        chartFill="#4b5563"
      />

      <BreakdownSection
        title="Applications by status"
        description="Per-country application status from students (applicationStatus when set, otherwise pipeline status) plus standalone Application document statuses"
        rows={data.applicationsByStatus ?? []}
        rawKeyLabel="Status"
        chartFill="#6b7280"
      />

      {/* Counsellors - table */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <header className="px-5 py-4 border-b border-gray-200 bg-gray-50/90">
          <h2 className="text-base font-semibold text-gray-900">Counsellor performance</h2>
          <p className="text-sm text-gray-500 mt-0.5">Targets vs current student count (all active counsellors)</p>
        </header>
        {(data.counsellorPerformance ?? []).length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-gray-400">No counsellor records.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Counsellor</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Branch</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 text-right">Current</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 text-right">Target</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 text-right">%</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 min-w-[180px]">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data.counsellorPerformance ?? []).map((c) => {
                  const pct = c.target > 0 ? Math.min(100, Math.round((c.currentCount / c.target) * 100)) : 0;
                  return (
                    <tr key={c._id} className="hover:bg-gray-50/80">
                      <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-5 py-3 text-gray-600">{c.branch?.name ?? "-"}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">{c.currentCount}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">{c.target}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-700">{pct}%</td>
                      <td className="px-5 py-3">
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden max-w-xs">
                          <div
                            className={`h-full rounded-full ${pct >= 100 ? "bg-gray-900" : pct >= 60 ? "bg-gray-600" : "bg-gray-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent leads */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <header className="px-5 py-4 border-b border-gray-200 bg-gray-50/90 flex items-center gap-2">
          <Phone size={18} className="text-gray-500" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">Latest leads</h2>
            <p className="text-sm text-gray-500 mt-0.5">Five most recent leads matching the date filter</p>
          </div>
        </header>
        {recentLeads.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">No recent leads.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-200 text-left bg-gray-50/50">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Source</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Standing</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Country</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Branch</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Assigned</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentLeads.map((lead) => (
                  <tr key={lead._id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-2.5">
                      <Link href={`/leads/${lead._id}`} className="font-medium text-gray-900 hover:underline">
                        {lead.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{lead.source || "-"}</td>
                    <td className="px-4 py-2.5 max-w-[140px] truncate">
                      {lead.status ? (() => {
                        const { label, colorClass } = resolveFdStatusPresentation(fdStatusOptions, lead.status);
                        return (
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colorClass}`} title={label}>
                            {label}
                          </span>
                        );
                      })() : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{humanizeKey(lead.standing)}</td>
                    <td className="px-4 py-2.5 text-gray-700">{lead.interestedCountry || "-"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{lead.branch?.name ?? "-"}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {(lead.assignedTo as { name?: string } | undefined)?.name ?? "-"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 tabular-nums text-xs whitespace-nowrap">
                      {formatDateTime(lead.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Activity */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <header className="px-5 py-4 border-b border-gray-200 bg-gray-50/90 flex items-center gap-2">
          <Activity size={18} className="text-gray-500" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">Recent activity</h2>
            <p className="text-sm text-gray-500 mt-0.5">Latest ten system events in the selected period</p>
          </div>
        </header>
        {recentActivity.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">No activity logged.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-200 text-left bg-gray-50/50">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Time</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">User</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Action</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Target</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">Module</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentActivity.map((log) => (
                  <tr key={log._id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-2.5 text-gray-500 tabular-nums text-xs whitespace-nowrap align-top">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-900 align-top">{log.userName}</td>
                    <td className="px-4 py-2.5 text-gray-700 capitalize align-top">{log.action.toLowerCase()}</td>
                    <td className="px-4 py-2.5 text-gray-800 align-top break-words max-w-xs">{log.targetName}</td>
                    <td className="px-4 py-2.5 text-gray-500 align-top">{log.module}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
