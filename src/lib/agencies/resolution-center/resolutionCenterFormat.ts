// ============================================================================
// ZONO — PHASE 26.12: AI Resolution Center™ — CLIENT-SAFE DTOs + PURE helpers.
// No server-only deps, no IO. Shared between the server service and the RTL UI,
// and unit-tested directly. Real data only: helpers format/arrange/aggregate
// what they're given; they never fabricate candidates, scores or learning.
// ============================================================================
import type { BadgeTone } from "@/components/ui/Badge";

export type ResolutionStatus =
  | "pending" | "accepted" | "rejected" | "ignored" | "needs_review" | "auto_created" | "enriched";
export type ResolutionAction = "approve" | "reject" | "merge" | "split" | "edit" | "ignore";

export interface ResolutionCandidate {
  id: string;
  detectedName: string;
  normalizedName: string;
  suggestedAgencyId: string | null;
  suggestedAgencyName: string | null;
  confidence: number | null;       // 0..1
  source: string | null;
  detectionMethod: string | null;
  status: ResolutionStatus;
  city: string | null;
  createdAt: string;
}

export interface EvidenceItem { source: string; weight: number | null; reason: string; confidence: number | null }

export interface AgencyLite {
  id: string; name: string; displayName: string | null; city: string | null;
  website: string | null; phone: string | null; email: string | null;
  propertyCount: number | null; agentCount: number | null; aliases: string[];
}

export interface CandidateDetail extends ResolutionCandidate {
  detectedText: string;
  normalizedText: string;
  matchedAgency: AgencyLite | null;
  evidence: EvidenceItem[];
  timeline: { title: string; date: string }[];
  confidenceBreakdown: { label: string; value: number }[];
}

export interface FeedbackRecord {
  id: string;
  action: ResolutionAction;
  previousConfidence: number | null;
  finalResult: string | null;
  reason: string | null;
  reviewedAt: string;
  detectedText: string | null;
  agencyName: string | null;
  alias: string | null;
}

export interface LearningStats {
  totalDecisions: number;
  approvals: number; rejections: number; merges: number; splits: number; edits: number; ignores: number;
  topApprovedAgencies: { name: string; count: number }[];
  topRejectedNames: { name: string; count: number }[];
  topCorrectedAliases: { alias: string; agency: string; count: number }[];
  aiAccuracy: number | null;          // approvals / (approvals+rejections)
  avgConfidenceBefore: number | null;
  improvementPct: number | null;      // accuracy expressed as % (null when no signal)
}

export interface ResolutionKpis {
  pending: number; approved: number; rejected: number; merged: number;
  avgConfidence: number | null; aiAccuracy: number | null;
}

export interface ResolutionFilters {
  status?: ResolutionStatus | "all" | "low_confidence" | "high_confidence";
  city?: string | null;
  agency?: string | null;
  query?: string | null;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
export function confidenceBadge(c: number | null): { tone: BadgeTone; label: string; pct: string } {
  if (c == null) return { tone: "neutral", label: "ללא ביטחון", pct: "—" };
  const pct = `${Math.round(c * 100)}%`;
  if (c >= 0.7) return { tone: "success", label: `ביטחון גבוה · ${pct}`, pct };
  if (c >= 0.4) return { tone: "warning", label: `ביטחון בינוני · ${pct}`, pct };
  return { tone: "danger", label: `ביטחון נמוך · ${pct}`, pct };
}

export const STATUS_LABEL: Record<ResolutionStatus, string> = {
  pending: "ממתין", accepted: "אושר", rejected: "נדחה", ignored: "התעלמות",
  needs_review: "דורש בדיקה", auto_created: "נוצר אוטומטית", enriched: "הועשר",
};
export const STATUS_TONE: Record<ResolutionStatus, BadgeTone> = {
  pending: "warning", accepted: "success", rejected: "danger", ignored: "neutral",
  needs_review: "warning", auto_created: "brand", enriched: "accent",
};
export const ACTION_LABEL: Record<ResolutionAction, string> = {
  approve: "אישור", reject: "דחייה", merge: "מיזוג", split: "פיצול", edit: "עריכה", ignore: "התעלמות",
};

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

/** Filter + search the candidate queue (pure). */
export function filterCandidates(list: ResolutionCandidate[], f: ResolutionFilters): ResolutionCandidate[] {
  const q = norm(f.query);
  return list.filter((c) => {
    if (f.status && f.status !== "all") {
      if (f.status === "low_confidence") { if (c.confidence == null || c.confidence >= 0.4) return false; }
      else if (f.status === "high_confidence") { if (c.confidence == null || c.confidence < 0.7) return false; }
      else if (c.status !== f.status) return false;
    }
    if (f.city && norm(c.city) !== norm(f.city)) return false;
    if (f.agency && norm(c.suggestedAgencyName) !== norm(f.agency)) return false;
    if (q) {
      const hay = `${c.detectedName} ${c.normalizedName} ${c.suggestedAgencyName ?? ""} ${c.city ?? ""} ${c.source ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct cities present in the queue (for the city filter). */
export function queueCities(list: ResolutionCandidate[]): string[] {
  return [...new Set(list.map((c) => c.city).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "he"));
}

function topCounts<T extends string>(items: T[], limit = 5): { key: T; count: number }[] {
  const m = new Map<T, number>();
  for (const i of items) if (i) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Aggregate human decisions into learning statistics (pure, deterministic). */
export function aggregateLearning(feedback: FeedbackRecord[]): LearningStats {
  const by = (a: ResolutionAction) => feedback.filter((f) => f.action === a);
  const approvals = by("approve").length + by("merge").length;
  const rejections = by("reject").length;
  const confBefore = feedback.map((f) => f.previousConfidence).filter((x): x is number => x != null);
  const aiAccuracy = approvals + rejections > 0 ? approvals / (approvals + rejections) : null;

  const approvedNames = [...by("approve"), ...by("merge")].map((f) => f.agencyName ?? "").filter(Boolean);
  const rejectedNames = by("reject").map((f) => f.detectedText ?? "").filter(Boolean);
  const aliasPairs = feedback.filter((f) => f.alias && f.agencyName).map((f) => `${f.alias}→${f.agencyName}`);

  return {
    totalDecisions: feedback.length,
    approvals: by("approve").length, rejections, merges: by("merge").length,
    splits: by("split").length, edits: by("edit").length, ignores: by("ignore").length,
    topApprovedAgencies: topCounts(approvedNames).map((x) => ({ name: x.key, count: x.count })),
    topRejectedNames: topCounts(rejectedNames).map((x) => ({ name: x.key, count: x.count })),
    topCorrectedAliases: topCounts(aliasPairs).map((x) => {
      const [alias, agency] = x.key.split("→");
      return { alias, agency, count: x.count };
    }),
    aiAccuracy,
    avgConfidenceBefore: confBefore.length ? confBefore.reduce((a, b) => a + b, 0) / confBefore.length : null,
    improvementPct: aiAccuracy == null ? null : Math.round(aiAccuracy * 100),
  };
}

/** Headline KPIs from the queue + learning stats (pure). */
export function computeKpis(candidates: ResolutionCandidate[], learning: LearningStats): ResolutionKpis {
  const pending = candidates.filter((c) => c.status === "pending" || c.status === "needs_review").length;
  const conf = candidates.map((c) => c.confidence).filter((x): x is number => x != null);
  return {
    pending,
    approved: learning.approvals,
    rejected: learning.rejections,
    merged: learning.merges,
    avgConfidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null,
    aiAccuracy: learning.aiAccuracy,
  };
}
