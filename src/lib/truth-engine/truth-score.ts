// ============================================================================
// 🛡️ Truth Engine — Universal Truth Score (pure). 27.7. Parts 1 + 7.
// Turns evidence + freshness + contradictions + completeness into ONE score for
// ANY entity. Confidence is capped by the evidence that actually supports it —
// it is never fabricated. Every score carries a full trust explanation.
// ============================================================================
import { buildEvidenceGraph } from "./evidence-graph";
import { freshnessScore, freshnessLevel, freshnessText } from "./freshness";
import { detectContradictions, contradictionPenalty } from "./contradiction";
import {
  CONTRADICTION_HE,
  type TruthInput, type TruthScore, type VerificationLevel, type TrustExplanation,
} from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const pct = (n: number, d: number): number => (d > 0 ? (n / d) * 100 : 0);

const VER_SCORE: Record<VerificationLevel, number> = {
  unverified: 10, single_source: 40, corroborated: 70, verified: 95,
};
const VER_ORDER: VerificationLevel[] = ["unverified", "single_source", "corroborated", "verified"];

function verificationLevel(supporting: number, diversity: number, hasHighContradiction: boolean): VerificationLevel {
  let v: VerificationLevel =
    supporting >= 3 && diversity >= 2 ? "verified"
    : supporting >= 2 || diversity >= 2 ? "corroborated"
    : supporting === 1 ? "single_source"
    : "unverified";
  if (hasHighContradiction) {
    const i = VER_ORDER.indexOf(v);
    v = VER_ORDER[Math.max(0, i - 1)];
  }
  return v;
}

export function computeTruthScore(input: TruthInput): TruthScore {
  const now = input.now ?? Date.now();
  const graph = buildEvidenceGraph(input.evidence);
  const lastIso = graph.latestAt ?? input.lastSeenAt ?? null;

  const freshness = freshnessScore(lastIso);
  const level = freshnessLevel(lastIso, now);

  const contradictionDetail = detectContradictions(input.contradictionSignals, {
    freshnessLevel: level, contradictingSources: graph.contradicting,
  });
  const penalty = contradictionPenalty(contradictionDetail);
  const hasHigh = contradictionDetail.some((c) => c.severity === "high");

  // Field completeness → data quality + missing info.
  const required = input.requiredFields ?? [];
  const present = new Set((input.presentFields ?? []).map((f) => f));
  const missingInfo = required.filter((f) => !present.has(f));
  const dataQuality = required.length
    ? clamp(pct(required.length - missingInfo.length, required.length))
    : clamp(Math.min(100, graph.count * 20));

  const supporting = graph.supporting;
  const diversity = graph.diversity;
  const vLevel = verificationLevel(supporting, diversity, hasHigh);

  const evidenceStrength = clamp(Math.min(100, supporting * 22));
  const diversityScore = clamp(Math.min(100, diversity * 30));
  const verScore = VER_SCORE[vLevel];

  const truthScore = graph.count === 0 && !required.length
    ? 0
    : clamp(0.28 * evidenceStrength + 0.16 * diversityScore + 0.18 * freshness + 0.22 * verScore + 0.16 * dataQuality - penalty);

  // Confidence — capped by the evidence that supports it, never fabricated.
  const rawConf = 0.4 * evidenceStrength + 0.25 * freshness + 0.2 * diversityScore + 0.15 * (input.baseConfidence ?? evidenceStrength);
  const confidence = graph.count === 0 ? 0 : clamp(Math.min(truthScore, rawConf) - penalty * 0.5);

  const explanation = buildExplanation({
    entityName: input.entityName ?? input.entityId,
    truthScore, supporting, diversity, vLevel, missingInfo,
    contradictions: contradictionDetail.map((c) => `${CONTRADICTION_HE[c.field]}: ${c.note}`),
    freshnessLabel: freshnessText(level, lastIso), sources: graph.sourceTypes,
  });

  return {
    entityType: input.entityType, entityId: input.entityId, entityName: input.entityName ?? null,
    truthScore, confidence, freshness, freshnessLevel: level, verificationLevel: vLevel,
    evidenceCount: graph.count, evidenceDiversity: diversity,
    contradictions: contradictionDetail.length, contradictionDetail,
    missingInfo, dataQuality, graph, explanation,
  };
}

function buildExplanation(a: {
  entityName: string; truthScore: number; supporting: number; diversity: number;
  vLevel: VerificationLevel; missingInfo: string[]; contradictions: string[];
  freshnessLabel: string; sources: string[];
}): TrustExplanation {
  const why = a.supporting === 0
    ? `אין ראיות תומכות ל${a.entityName} — הציון מבוסס על מטא-נתונים בלבד.`
    : `${a.supporting} ראיות תומכות מ-${a.diversity} סוגי מקורות (${a.sources.slice(0, 4).join(", ")}) → רמת אימות ${a.vLevel}.`;
  return {
    why,
    evidence: a.sources.length ? a.sources.map((s) => `מקור: ${s}`) : ["אין מקורות מתועדים"],
    missingData: a.missingInfo.length ? a.missingInfo : ["אין שדות חסרים ידועים"],
    contradictions: a.contradictions.length ? a.contradictions : ["לא נמצאו סתירות"],
    freshness: a.freshnessLabel,
  };
}
