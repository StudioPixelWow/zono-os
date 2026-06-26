// ============================================================================
// ZONO — PHASE 26.13: API mappers (PURE, client-safe). Turn the typed objects
// returned by the low-level repositories into the unified DTOs, and build the
// source_summary traceability. No IO. Null-not-fake-zero throughout: absent
// values stay null and are disclosed in missingData; a real 0 is preserved.
// ============================================================================
import type {
  ApiSourceSummary, ThreatBand, AgencyIntelligenceCardDTO, AgencyCompetitiveProfileDTO,
  AgencyTerritoryRowDTO, AgencySignalDTO, AgencyReportDTO, AgencyRecommendationDTO,
} from "./agencyIntelligenceApiTypes";

// ── Minimal structural inputs (decoupled from server types) ──────────────────
export interface ScoreInput {
  overall: number | null; competitionThreat?: number | null; momentum: number | null; growth: number | null;
  marketStrength: number | null; coverage: number | null; inventory: number | null; luxury: number | null;
  digital: number | null; reputation: number | null; projects: number | null;
  dataConfidence?: number | null; periodStart?: string | null; periodEnd?: string | null;
  calculatedAt?: string | null; updatedAt?: string | null;
}
export interface TerritoryInput {
  territoryType: string; city: string | null; neighborhood: string | null; street: string | null;
  dominanceScore: number | null; inventoryShare: number | null; momentumScore: number | null;
  trend: string | null; confidence: number | null; calculatedAt?: string | null;
}
export interface SignalInput {
  id: string; signalType: string; severity: string | null; title: string; description: string | null;
  city?: string | null; neighborhood?: string | null; street?: string | null; territoryLabel?: string | null;
  importance: number | null; confidence: number | null; detectedAt: string;
}
export interface ReportInput {
  reportType: string; periodStart: string; periodEnd: string; executiveSummary: string;
  strengths: { label: string; detail: string }[]; weaknesses: { label: string; detail: string }[];
  opportunities: { label: string; detail: string }[]; threats: { label: string; detail: string }[];
  recommendations: { title: string; reason: string; priority: "low" | "medium" | "high"; relatedTerritory?: string | null; confidence: number }[];
  dataConfidence: number | null;
}

const str = (s: string | null | undefined): string | null => (s && s.trim() ? s : null);
export function territoryLabel(city: string | null, neighborhood: string | null, street: string | null): string {
  return street || neighborhood || city || "—";
}

export function buildSourceSummary(categories: string[], lastCalculated: string | null, confidence: number | null, missingData: string[]): ApiSourceSummary {
  return { categories, lastCalculated, confidence, missingData };
}

/** Newest non-null ISO date across inputs (null when none). */
export function latestDate(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => !!d).sort();
  return valid.length ? valid[valid.length - 1] : null;
}

export function threatBand(threat: number | null): ThreatBand {
  if (threat == null) return null;
  if (threat >= 80) return "critical";
  if (threat >= 60) return "high";
  if (threat >= 40) return "moderate";
  return "low";
}

// ── DTO mappers ──────────────────────────────────────────────────────────────
export function toCardDTO(input: {
  agencyId: string; name: string; displayName: string | null; city: string | null;
  score: ScoreInput | null; topSignalTitle: string | null; summarySnippet: string | null;
}): AgencyIntelligenceCardDTO {
  const s = input.score;
  const missing: string[] = [];
  if (!s) missing.push("אין עדיין ציון מחושב למשרד");
  else {
    if (s.competitionThreat == null) missing.push("ציון איום חסר");
    if (s.momentum == null) missing.push("ציון מומנטום חסר");
  }
  return {
    agencyId: input.agencyId, name: input.name, displayName: input.displayName, city: input.city,
    overall: s?.overall ?? null, threat: s?.competitionThreat ?? null, momentum: s?.momentum ?? null, growth: s?.growth ?? null,
    dataConfidence: s?.dataConfidence ?? null, topSignalTitle: input.topSignalTitle, summarySnippet: input.summarySnippet,
    sourceSummary: buildSourceSummary(["agency_scores", "agency_signals", "agency_intelligence_reports"], s?.calculatedAt ?? s?.updatedAt ?? null, s?.dataConfidence ?? null, missing),
  };
}

export function toCompetitiveDTO(agencyId: string, name: string, s: ScoreInput | null): AgencyCompetitiveProfileDTO {
  const missing: string[] = [];
  if (!s) missing.push("אין עדיין ציונים למשרד זה");
  return {
    agencyId, name,
    scores: {
      overall: s?.overall ?? null, threat: s?.competitionThreat ?? null, momentum: s?.momentum ?? null, growth: s?.growth ?? null,
      marketStrength: s?.marketStrength ?? null, coverage: s?.coverage ?? null, inventory: s?.inventory ?? null,
      luxury: s?.luxury ?? null, digital: s?.digital ?? null, reputation: s?.reputation ?? null, projects: s?.projects ?? null,
    },
    dataConfidence: s?.dataConfidence ?? null,
    period: { start: s?.periodStart ?? null, end: s?.periodEnd ?? null },
    sourceSummary: buildSourceSummary(["agency_scores"], s?.calculatedAt ?? s?.updatedAt ?? null, s?.dataConfidence ?? null, missing),
  };
}

export function toTerritoryRowDTO(t: TerritoryInput): AgencyTerritoryRowDTO {
  return {
    territoryType: t.territoryType, label: territoryLabel(t.city, t.neighborhood, t.street),
    city: str(t.city), neighborhood: str(t.neighborhood), street: str(t.street),
    dominance: t.dominanceScore, inventoryShare: t.inventoryShare, momentum: t.momentumScore,
    trend: str(t.trend), confidence: t.confidence,
  };
}

export function toSignalDTO(s: SignalInput): AgencySignalDTO {
  return {
    id: s.id, signalType: s.signalType, severity: str(s.severity), title: s.title, description: str(s.description),
    territoryLabel: s.territoryLabel ?? str(s.street) ?? str(s.neighborhood) ?? str(s.city) ?? null,
    importance: s.importance, confidence: s.confidence, detectedAt: s.detectedAt,
  };
}

export function toRecommendationDTO(r: ReportInput["recommendations"][number]): AgencyRecommendationDTO {
  return { title: r.title, reason: r.reason, priority: r.priority, relatedTerritory: r.relatedTerritory ?? null, confidence: r.confidence };
}

export function toReportDTO(r: ReportInput | null): AgencyReportDTO | null {
  if (!r) return null;
  return {
    reportType: r.reportType, periodStart: str(r.periodStart), periodEnd: str(r.periodEnd),
    executiveSummary: str(r.executiveSummary), strengths: r.strengths, weaknesses: r.weaknesses,
    opportunities: r.opportunities, threats: r.threats, recommendations: r.recommendations.map(toRecommendationDTO),
    dataConfidence: r.dataConfidence,
  };
}

/** Threat drivers from a score: the components that push threat up (non-null). */
export function threatDrivers(s: ScoreInput | null): { label: string; value: number | null }[] {
  if (!s) return [];
  const items: { label: string; value: number | null }[] = [
    { label: "עוצמת שוק", value: s.marketStrength }, { label: "מומנטום", value: s.momentum },
    { label: "צמיחה", value: s.growth }, { label: "כיסוי", value: s.coverage }, { label: "מלאי", value: s.inventory },
  ];
  return items.filter((i) => i.value != null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 4);
}

/** Competition level for a territory from the number of active agencies. */
export function competitionLevel(agencyCount: number): "none" | "low" | "moderate" | "high" {
  if (agencyCount <= 0) return "none";
  if (agencyCount === 1) return "low";
  if (agencyCount <= 3) return "moderate";
  return "high";
}

// ── Organization-access decision (PURE; the server guard wraps this) ─────────
export interface OrgAccess { allowed: boolean; orgId: string | null }
export function resolveOrgAccess(sessionOrgId: string | null, requestedOrgId: string): OrgAccess {
  if (!sessionOrgId) return { allowed: false, orgId: null };
  if (!requestedOrgId || requestedOrgId !== sessionOrgId) return { allowed: false, orgId: sessionOrgId };
  return { allowed: true, orgId: sessionOrgId };
}
