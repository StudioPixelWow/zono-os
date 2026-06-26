// ============================================================================
// ZONO — Competition Radar UI (Phase 26.8). CLIENT-SAFE DTO types + PURE helpers.
// No server-only deps, no IO — shared between the server query layer and the
// client components, and unit-tested directly. Real data only: helpers format
// and arrange what they're given; they never fabricate numbers.
// ============================================================================
import type { BadgeTone } from "@/components/ui/Badge";

// ── DTOs ──────────────────────────────────────────────────────────────────────
export interface RadarOverview {
  agencies: number;        // משרדים מזוהים
  agentsLinked: number;    // מתווכים משויכים
  territories: number;     // אזורי פעילות
  activeSignals: number;   // אותות פעילים
  highThreat: number;      // מתחרים בסיכון גבוה
  opportunities: number;   // הזדמנויות אזוריות
}

export interface RadarAgencySummary {
  id: string;
  name: string;
  city: string | null;
  overall: number | null;
  threat: number | null;
  momentum: number | null;
  dataConfidence: number | null;
  topSignalTitle: string | null;
  summarySnippet: string | null;
}

export interface RadarTerritoryRow {
  agencyId: string;
  agencyName: string;
  territoryType: string;
  label: string;
  dominance: number | null;
  inventoryShare: number | null;   // 0..1
  momentum: number | null;
  trend: string | null;
  confidence: number | null;       // 0..1
}

export interface RadarSignalRow {
  id: string;
  signalType: string;
  severity: string | null;
  title: string;
  description: string | null;
  territoryLabel: string | null;
  importance: number | null;
  confidence: number | null;       // 0..1
  detectedAt: string;
}

export interface RadarTimelineRow {
  id: string;
  eventType: string;
  title: string;
  importance: number | null;
  territoryLabel: string | null;
  eventDate: string;
}

export interface RadarSwot {
  strengths: { label: string; detail: string }[];
  weaknesses: { label: string; detail: string }[];
  opportunities: { label: string; detail: string }[];
  threats: { label: string; detail: string }[];
}

export interface RadarRecommendation {
  title: string;
  reason: string;
  priority: "low" | "medium" | "high";
  relatedTerritory?: string | null;
  confidence: number;              // 0..1
}

export interface RadarAgencyDetails {
  agencyId: string;
  agencyName: string;
  city: string | null;
  overall: number | null;
  threat: number | null;
  momentum: number | null;
  dataConfidence: number | null;
  executiveSummary: string | null;
  territories: RadarTerritoryRow[];
  signals: RadarSignalRow[];
  timeline: RadarTimelineRow[];
  swot: RadarSwot;
  recommendations: RadarRecommendation[];
}

export type RadarSort = "threat" | "overall" | "momentum" | "confidence";
export type RadarSeverity = "all" | "low" | "medium" | "high" | "critical";

// ── Pure helpers ──────────────────────────────────────────────────────────────
const v = (n: number | null | undefined) => (typeof n === "number" ? n : -1);

/** Sort agencies by the chosen metric (desc), nulls last. Stable + non-mutating. */
export function sortAgencies(list: RadarAgencySummary[], sort: RadarSort): RadarAgencySummary[] {
  const key: Record<RadarSort, (a: RadarAgencySummary) => number> = {
    threat: (a) => v(a.threat), overall: (a) => v(a.overall),
    momentum: (a) => v(a.momentum), confidence: (a) => v(a.dataConfidence),
  };
  return [...list].sort((a, b) => key[sort](b) - key[sort](a) || a.name.localeCompare(b.name, "he"));
}

/** Filter agencies by city (null/empty → no filter). */
export function filterAgenciesByCity(list: RadarAgencySummary[], city: string | null): RadarAgencySummary[] {
  if (!city) return list;
  return list.filter((a) => (a.city ?? "") === city);
}

/** Distinct cities present in the agency list (for the city filter dropdown). */
export function radarCities(list: RadarAgencySummary[]): string[] {
  return [...new Set(list.map((a) => a.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "he"));
}

/** Filter signals by severity ("all" → no filter). */
export function filterSignalsBySeverity(list: RadarSignalRow[], severity: RadarSeverity): RadarSignalRow[] {
  if (severity === "all") return list;
  return list.filter((s) => (s.severity ?? "") === severity);
}

/** Confidence (0..100) → badge tone + Hebrew label. */
export function confidenceBadge(dc: number | null): { tone: BadgeTone; label: string } {
  if (dc == null) return { tone: "neutral", label: "ללא נתונים" };
  if (dc >= 65) return { tone: "success", label: `ביטחון גבוה · ${Math.round(dc)}%` };
  if (dc >= 35) return { tone: "warning", label: `ביטחון בינוני · ${Math.round(dc)}%` };
  return { tone: "danger", label: `ביטחון נמוך · ${Math.round(dc)}%` };
}

/** Severity → badge tone. */
export function severityTone(sev: string | null): BadgeTone {
  switch (sev) {
    case "critical": return "danger";
    case "high": return "danger";
    case "medium": return "warning";
    case "low": return "neutral";
    default: return "neutral";
  }
}

export const SEVERITY_LABEL: Record<string, string> = {
  critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך",
};
export const PRIORITY_LABEL: Record<RadarRecommendation["priority"], string> = {
  high: "עדיפות גבוהה", medium: "עדיפות בינונית", low: "עדיפות נמוכה",
};
export const PRIORITY_TONE: Record<RadarRecommendation["priority"], BadgeTone> = {
  high: "danger", medium: "warning", low: "neutral",
};

/** Format a 0..100 score, or em-dash when absent (never a fake 0). */
export function fmtScore(n: number | null | undefined): string {
  return typeof n === "number" ? String(Math.round(n)) : "—";
}
/** Format a 0..1 share as a percentage, or em-dash when absent. */
export function fmtShare(n: number | null | undefined): string {
  return typeof n === "number" ? `${Math.round(n * 100)}%` : "—";
}
/** Format a 0..1 confidence as a percentage, or em-dash when absent. */
export function fmtConfidence(n: number | null | undefined): string {
  return typeof n === "number" ? `${Math.round(n * 100)}%` : "—";
}

export type RadarEmptyState = "none" | "no_agencies" | "no_scores" | "ready";

/**
 * Which top-level empty state to show. No agencies → onboarding message; agencies
 * but no scores → "identified, not enough activity"; otherwise the radar renders.
 */
export function pickEmptyState(overview: RadarOverview, scoredCount: number): RadarEmptyState {
  if (overview.agencies === 0) return "no_agencies";
  if (scoredCount === 0) return "no_scores";
  return "none";
}

export const RADAR_EMPTY_TEXT: Record<"no_agencies" | "no_scores" | "no_signals", string> = {
  no_agencies: "עדיין אין מספיק נתונים כדי לבנות רדאר מתחרים. לאחר סריקת נכסים ומתווכים, ZONO יתחיל לזהות משרדים ולבנות מודיעין אזורי.",
  no_scores: "המשרדים זוהו, אבל עדיין אין מספיק נתוני פעילות לחישוב ציונים.",
  no_signals: "אין אותות משמעותיים כרגע.",
};
