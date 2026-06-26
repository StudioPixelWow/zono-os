// ============================================================================
// ZONO — PHASE 26.10: AI Copilot for Competition Intelligence™.
// CLIENT-SAFE DTO types for the agency-intelligence query layer. No server-only
// deps, no IO — shared between the pure parser/router/answer-builder and the
// server service, and unit-tested directly. Answers are GROUNDED in stored data
// only; nothing here fabricates agencies, scores or territories.
// ============================================================================
import type {
  RadarAgencySummary, RadarTerritoryRow, RadarSignalRow, RadarTimelineRow,
} from "@/lib/agencies/ui/competitionRadarFormat";

export type AgencyCopilotIntent =
  | "top_agencies_in_area"
  | "strongest_competitor"
  | "recent_growth"
  | "territory_opportunity"
  | "dominance_by_area"
  | "agency_summary"
  | "agency_comparison"
  | "signals_summary"
  | "weak_user_area"
  | "high_threat_competitors"
  | "unknown";

/** Extracted entities from a free-text Hebrew question. Nulls when not present. */
export interface ParsedAgencyQuery {
  raw: string;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  agencyName: string | null;
  agencyNames: string[];     // for comparison ("X מול Y")
  periodDays: number | null;
  periodLabel: string | null;
}

export interface CopilotEntity { type: "city" | "neighborhood" | "street" | "agency" | "period"; value: string }

/** An opportunity area surfaced from real territory stats (low competition). */
export interface CopilotOpportunity {
  label: string;
  city: string | null;
  neighborhood: string | null;
  agencyCount: number;
  topDominance: number | null;
  reason: string;
}

/** A resolved single-agency detail slice used by summary/comparison answers. */
export interface CopilotAgencyDetail {
  agencyId: string;
  agencyName: string;
  city: string | null;
  overall: number | null;
  threat: number | null;
  momentum: number | null;
  dataConfidence: number | null;
  executiveSummary: string | null;
  topTerritories: RadarTerritoryRow[];
  topSignals: RadarSignalRow[];
}

/** Grounded context assembled per question. Only relevant slices are populated. */
export interface AgencyCopilotContext {
  intent: AgencyCopilotIntent;
  parsed: ParsedAgencyQuery;
  organizationId: string;
  hasData: boolean;
  confidence: number;             // 0..1
  missingData: string[];
  sources: { table: string; records: number }[];
  resolvedArea: { city: string | null; neighborhood: string | null } | null;
  userArea: { city: string | null; neighborhood: string | null } | null;
  agencies: RadarAgencySummary[];
  territories: RadarTerritoryRow[];
  signals: RadarSignalRow[];
  timeline: RadarTimelineRow[];
  opportunities: CopilotOpportunity[];
  agencyDetail: CopilotAgencyDetail | null;
  comparison: { a: CopilotAgencyDetail; b: CopilotAgencyDetail } | null;
}

/** Structured Copilot response (the contract for any future chat UI). */
export interface AgencyCopilotAnswer {
  answer: string;
  confidence: number;             // 0..1
  intent: AgencyCopilotIntent;
  entities: CopilotEntity[];
  highlights: string[];
  recommendations: string[];
  missing_data: string[];
  source_summary: string[];
}

export interface SuggestedQuestion { question: string; intent: AgencyCopilotIntent }

export interface AnswerAgencyQuestionOptions { maxAgencies?: number }

export interface GuardrailResult { allowed: boolean; reason?: string; message?: string }
