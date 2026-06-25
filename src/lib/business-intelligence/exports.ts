// ============================================================================
// ZONO — Report exporters (pure, deterministic). Builds the canonical report
// payload + CSV / JSON / Markdown renderings. PDF/Excel are produced downstream
// from this canonical JSON (the single source of truth) without changing logic.
// ============================================================================
import type { ExecutiveDashboard, Period } from "./types";

export type ReportType = "executive_daily" | "executive_weekly" | "executive_monthly" | "board" | "investor" | "office" | "area";

const REPORT_LABEL: Record<ReportType, string> = {
  executive_daily: "דוח מנהלים יומי", executive_weekly: "דוח מנהלים שבועי", executive_monthly: "דוח מנהלים חודשי",
  board: "דוח דירקטוריון", investor: "דוח משקיעים", office: "דוח משרד", area: "דוח אזור",
};
export const reportLabel = (t: ReportType): string => REPORT_LABEL[t] ?? t;

const PERIOD_FOR: Record<ReportType, Period> = {
  executive_daily: "today", executive_weekly: "week", executive_monthly: "month",
  board: "quarter", investor: "year", office: "month", area: "month",
};

export interface ReportPayload {
  reportType: ReportType;
  title: string;
  generatedAt: string;
  kpis: { key: string; label: string; value: number; format: string; changePercent: number | null }[];
  forecast: ExecutiveDashboard["forecast"];
  pipeline: { stage: string; count: number; value: number; conversionPct: number }[];
  health: { total: number; band: string };
  revenue: { expected: number; commission: number; lost: number; atRisk: number };
  topRisks: { label: string; severity: string; score: number }[];
  summary: string[];
}

export function buildReportPayload(d: ExecutiveDashboard, reportType: ReportType): ReportPayload {
  const period = PERIOD_FOR[reportType];
  return {
    reportType,
    title: `${REPORT_LABEL[reportType]} — ${new Date(d.generatedAt).toLocaleDateString("he-IL")}`,
    generatedAt: d.generatedAt,
    kpis: d.kpis[period].map((k) => ({ key: k.key, label: k.label, value: k.value, format: k.format, changePercent: k.changePercent })),
    forecast: d.forecast,
    pipeline: d.pipeline.stages.map((s) => ({ stage: s.label, count: s.count, value: s.value, conversionPct: s.conversionPct })),
    health: { total: d.health.total, band: d.health.band },
    revenue: { expected: d.revenue.expectedRevenue, commission: d.revenue.expectedCommission, lost: d.revenue.lostRevenue, atRisk: d.revenue.revenueAtRisk },
    topRisks: d.risks.slice(0, 6).map((r) => ({ label: r.label, severity: r.severity, score: r.scorePercent })),
    summary: d.summary,
  };
}

export function toJson(p: ReportPayload): string { return JSON.stringify(p, null, 2); }

export function toCsv(p: ReportPayload): string {
  const lines: string[] = ["section,key,label,value"];
  for (const k of p.kpis) lines.push(`kpi,${k.key},"${k.label}",${k.value}`);
  for (const s of p.pipeline) lines.push(`pipeline,${s.stage},"${s.stage}",${s.count}`);
  lines.push(`revenue,expected,"הכנסה צפויה",${p.revenue.expected}`);
  lines.push(`revenue,commission,"עמלה צפויה",${p.revenue.commission}`);
  lines.push(`revenue,at_risk,"בסיכון",${p.revenue.atRisk}`);
  lines.push(`health,total,"בריאות משרד",${p.health.total}`);
  return lines.join("\n");
}

export function toMarkdown(p: ReportPayload): string {
  const fmt = (v: number, f: string) => (f === "currency" ? `₪${Math.round(v).toLocaleString("he-IL")}` : f === "percent" ? `${v}%` : v.toLocaleString("he-IL"));
  const out: string[] = [`# ${p.title}`, "", `נוצר: ${new Date(p.generatedAt).toLocaleString("he-IL")}`, "", "## מדדים"];
  for (const k of p.kpis) out.push(`- **${k.label}**: ${fmt(k.value, k.format)}${k.changePercent != null ? ` (${k.changePercent}%)` : ""}`);
  out.push("", "## בריאות משרד", `ציון: ${p.health.total}/100 (${p.health.band})`, "", "## הכנסות",
    `- צפויה: ₪${p.revenue.expected.toLocaleString("he-IL")}`, `- עמלה: ₪${p.revenue.commission.toLocaleString("he-IL")}`, `- בסיכון: ₪${p.revenue.atRisk.toLocaleString("he-IL")}`);
  if (p.topRisks.length) { out.push("", "## סיכונים מובילים"); for (const r of p.topRisks) out.push(`- ${r.label} (${r.severity}, ${r.score}%)`); }
  if (p.summary.length) { out.push("", "## תקציר"); for (const s of p.summary) out.push(`- ${s}`); }
  return out.join("\n");
}
