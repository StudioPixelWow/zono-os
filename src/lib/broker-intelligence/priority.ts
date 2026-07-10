// ============================================================================
// 🧮 ZONO — BROKER INTELLIGENCE · Global priority queue (PURE).
// The ONE shared queue every intelligence area (1–6) feeds and every surface
// (Home V3, Daily OS, Today, Attention Center, Executive OS, ⌘K) consumes.
// Ranks recommendations by real evidence (confidence + urgency + corroboration)
// and DEDUPLICATES: when two engines recommend essentially the same action on
// the same entity, they merge into ONE item — union of evidence, union of data
// sources, highest confidence. No second recommendation model, no random order.
// Pure + deterministic + offline-testable.
// ============================================================================
import type { Recommendation, Urgency, DataSource, Evidence } from "./types";
import { clamp100 } from "./types";

/** A queued recommendation with its computed priority + merge provenance. */
export interface PrioritizedRecommendation extends Recommendation {
  /** 0..100 global priority (business impact blend). Drives queue order. */
  priority: number;
  /** How many engine recommendations merged into this one (≥1). */
  mergedCount: number;
  /** All data sources that contributed evidence (deduped, for transparency). */
  contributingSources: DataSource[];
}

const URGENCY_SCORE: Record<Urgency, number> = { critical: 100, high: 75, medium: 50, low: 25 };

/**
 * The STABLE identity of a recommendation across reloads: entityType:entityId:
 * actionClass. Recommendation `id`s can be regenerated each load, but this key
 * stays constant for "the same action on the same entity" — so it's what we
 * dedup on AND what we persist lifecycle state (dismiss/snooze/…) against.
 */
export function recKey(rec: Recommendation): string {
  return `${rec.entityType}:${rec.entityId}:${actionClass(rec)}`;
}

/** Coarse action class so "call seller today" from two engines dedupes. */
export function actionClass(rec: Recommendation): string {
  const t = `${rec.title} ${rec.suggestedAction}`;
  if (/התקשר|טלפונ|שיחה|שימור/.test(t)) return "call";
  if (/מחיר|תמחור|הערכת שווי/.test(t)) return "price";
  if (/שיווק|קמפיין|חשיפה|פרסם/.test(t)) return "marketing";
  if (/משכנתא|מימון|אישור עקרוני/.test(t)) return "mortgage";
  if (/שלח|נכס|התאמ/.test(t)) return "send";
  if (/פגישה|צפייה|תזמן|קבע/.test(t)) return "meeting";
  if (/מסמך|הסכם|חתימ/.test(t)) return "document";
  if (/המתן|טפח/.test(t)) return "wait";
  return rec.area; // fall back to the area so unrelated actions never merge
}

/** Blend confidence + urgency into a 0..100 business-impact priority. Corroborated
 *  (merged) items get a small, capped bump — more real evidence = higher priority. */
function priorityScore(rec: Recommendation, mergedCount: number): number {
  const base = 0.55 * rec.confidence + 0.45 * URGENCY_SCORE[rec.urgency];
  const corroboration = Math.min(8, (mergedCount - 1) * 4);
  return clamp100(base + corroboration);
}

function mergeEvidence(a: Evidence[], b: Evidence[]): Evidence[] {
  const seen = new Set(a.map((e) => e.label));
  return [...a, ...b.filter((e) => !seen.has(e.label))];
}

/**
 * Build the global priority queue from all engines' recommendations.
 * Deterministic: dedup by (entityType, entityId, actionClass), then sort by
 * priority desc, then confidence desc, then id (stable tiebreak).
 * Insufficient-evidence items are dropped from the ACTIONABLE queue — the broker
 * is never shown a fabricated or unbacked recommendation.
 */
export function buildPriorityQueue(recs: Recommendation[]): PrioritizedRecommendation[] {
  const actionable = recs.filter((r) => !r.insufficientEvidence);
  const byKey = new Map<string, PrioritizedRecommendation>();

  for (const r of actionable) {
    const key = recKey(r);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...r,
        priority: priorityScore(r, 1),
        mergedCount: 1,
        contributingSources: [...new Set(r.evidence.map((e) => e.source))],
      });
      continue;
    }
    // Merge: keep the higher-confidence base, union evidence + sources.
    const base = r.confidence > existing.confidence ? r : existing;
    const other = base === r ? existing : r;
    const mergedCount = existing.mergedCount + 1;
    const evidence = mergeEvidence(base.evidence, other.evidence);
    byKey.set(key, {
      ...base,
      evidence,
      confidence: Math.max(existing.confidence, r.confidence),
      mergedCount,
      contributingSources: [...new Set(evidence.map((e) => e.source))],
      priority: priorityScore({ ...base, confidence: Math.max(existing.confidence, r.confidence) }, mergedCount),
    });
  }

  return [...byKey.values()].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.id.localeCompare(b.id);
  });
}
