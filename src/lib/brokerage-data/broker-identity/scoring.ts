// ============================================================================
// 📊 Broker Identity — deterministic evidence scoring (Phase 26.12, STEP 4).
// Pure. Source-weight table + office selection + status thresholds + the exact
// missing-evidence list. No AI, no DB, no I/O.
// ============================================================================
import { normalizeHebrewName } from "../normalize";
import type {
  EvidenceSource, IdentityEvidence, OfficeCandidateScore, BrokerResolution, BrokerResolutionStatus,
} from "./types";

// Deterministic trust weight per evidence source (STEP 4).
export const SOURCE_WEIGHTS: Record<EvidenceSource, number> = {
  google_business: 98,
  official_website: 97,
  google_maps: 95,
  facebook: 90,
  linkedin: 88,
  yad2: 87,
  madlan: 85,
  observed_listing: 80,
  shared_phone: 75,
  shared_domain: 70,
  ai_reasoning: 60,
};

export const AUTO_THRESHOLD = 95;     // ≥ → resolved automatically
export const REVIEW_THRESHOLD = 80;   // 80–94 → needs review · <80 → unresolved

// High-value sources whose absence is worth reporting as "missing evidence".
const KEY_SOURCES: { source: EvidenceSource; label: string }[] = [
  { source: "google_business", label: "פרופיל Google Business" },
  { source: "official_website", label: "אתר משרד רשמי" },
  { source: "facebook", label: "עמוד עסקי בפייסבוק" },
  { source: "linkedin", label: "פרופיל LinkedIn" },
  { source: "yad2", label: "פרופיל יד2" },
  { source: "madlan", label: "פרופיל מדלן" },
];

const norm = (s: string) => normalizeHebrewName(s);

/** Group evidence into office candidates and compute each one's combined score.
 *  Combined = strongest single source + a small corroboration bonus (capped at
 *  98 unless a ≥95 source is present). Deterministic. */
export function scoreCandidates(evidence: IdentityEvidence[]): OfficeCandidateScore[] {
  const byOffice = new Map<string, OfficeCandidateScore>();
  for (const ev of evidence) {
    if (!ev.officeName) continue;
    const normalizedName = norm(ev.officeName);
    if (!normalizedName) continue;
    let c = byOffice.get(normalizedName);
    if (!c) { c = { officeName: ev.officeName, normalizedName, officeId: null, score: 0, topSource: ev.source, sources: [], evidence: [] }; byOffice.set(normalizedName, c); }
    c.evidence.push(ev);
    if (!c.sources.includes(ev.source)) c.sources.push(ev.source);
  }
  for (const c of byOffice.values()) {
    const top = c.evidence.reduce((m, e) => (e.weight > m.weight ? e : m), c.evidence[0]);
    c.topSource = top.source;
    const corroboration = Math.min(8, (c.sources.length - 1) * 4);
    const ceiling = top.weight >= 95 ? 100 : 98;
    c.score = Math.min(ceiling, Math.round(top.weight + corroboration));
  }
  return [...byOffice.values()].sort((a, b) => b.score - a.score);
}

/** Compute the exact evidence still missing (for unresolved/needs-review brokers). */
export function computeMissingEvidence(evidence: IdentityEvidence[]): string[] {
  const have = new Set(evidence.map((e) => e.source));
  const missing = KEY_SOURCES.filter((k) => !have.has(k.source)).map((k) => k.label);
  if (!evidence.some((e) => e.source === "observed_listing" && e.officeName)) missing.push("שם משרד שנצפה במודעות");
  if (!have.has("shared_phone")) missing.push("קו טלפון משותף למספר מתווכים");
  return missing;
}

/** Pick the winning office and assign a status (STEP 4 + STEP 8). */
export function resolveFromCandidates(
  agentId: string, fullName: string, candidates: OfficeCandidateScore[], evidence: IdentityEvidence[],
  aiReasoning: string | null, existingOfficeId: (normName: string) => string | null,
): BrokerResolution {
  const missingEvidence = computeMissingEvidence(evidence);
  const base: BrokerResolution = {
    agentId, fullName, status: "insufficient_evidence", resolvedOfficeId: null, resolvedOfficeName: null,
    confidence: 0, why: "אין ראיות מספיקות לשיוך משרד.", aiReasoning, evidence,
    providers: [], alternatives: [], missingEvidence,
  };
  if (!candidates.length) return base;

  const top = candidates[0];
  const second = candidates[1];
  top.officeId = existingOfficeId(top.normalizedName);

  // Conflicting: two distinct offices both above review threshold and within 5 pts.
  if (second && second.score >= REVIEW_THRESHOLD && top.score - second.score <= 5) {
    return {
      ...base, status: "conflicting_evidence", confidence: top.score,
      why: `ראיות סותרות: "${top.officeName}" (${top.score}) מול "${second.officeName}" (${second.score}).`,
      alternatives: candidates.slice(0, 4).map((c) => ({ officeName: c.officeName, score: c.score, rejectedReason: "ראיות סותרות — נדרשת הכרעה ידנית" })),
    };
  }

  const status: BrokerResolutionStatus =
    top.score >= AUTO_THRESHOLD ? "resolved" : top.score >= REVIEW_THRESHOLD ? "needs_review" : "insufficient_evidence";
  const alternatives = candidates.slice(1, 5).map((c) => ({ officeName: c.officeName, score: c.score, rejectedReason: `ציון נמוך מהמוביל (${c.score} < ${top.score})` }));
  const why = status === "insufficient_evidence"
    ? `הראיה החזקה ביותר ("${top.officeName}", ${top.score}) מתחת לסף (${REVIEW_THRESHOLD}).`
    : `נבחר "${top.officeName}" — מקור מוביל ${top.topSource} (${SOURCE_WEIGHTS[top.topSource]}), ${top.sources.length} מקורות, ציון משולב ${top.score}.`;

  return {
    ...base,
    status,
    resolvedOfficeId: status === "resolved" || status === "needs_review" ? top.officeId : null,
    resolvedOfficeName: status === "insufficient_evidence" ? null : top.officeName,
    confidence: top.score, why, alternatives,
    missingEvidence: status === "resolved" ? [] : missingEvidence,
  };
}
