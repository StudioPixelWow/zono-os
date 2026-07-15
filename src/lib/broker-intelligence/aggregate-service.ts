// ============================================================================
// 🧮 ZONO — BROKER INTELLIGENCE · Aggregate queue service (server-only).
// The single entry point every surface uses (Home V3 / Daily OS / Today /
// Attention Center / Executive OS / ⌘K). Gathers recommendations from ALL
// intelligence-area services, feeds them into the ONE shared prioritizer
// (dedup + evidence merge + ranking), and returns the top items. Best-effort per
// engine — one failing engine never blanks the whole queue. Never throws.
// ============================================================================
import "server-only";
import { buildPriorityQueue } from "./priority";
import type { Recommendation } from "./types";
import { getAcquisitionIntelligence } from "./acquisition-service";
import { getBuyerIntelligence } from "./buyer-service";
import { getSellerIntelligence } from "./seller-service";
import { getDealIntelligence } from "./deal-service";
import { getJourneyIntelligence } from "./journey-service";
import { applyLifecycle, reduceLatestStates, type LifecycleAwareRecommendation } from "./lifecycle";
import { loadRecommendationEvents } from "./recommendation-events-repository";
import { applyLearning } from "./learning";
import { getLearningModel } from "./learning-service";

export interface BrokerIntelligenceQueue {
  /** Lifecycle-aware: dismissed/snoozed/completed items are removed; the rest
   *  carry their current lifecycle state (e.g. "accepted" = in-progress). */
  items: LifecycleAwareRecommendation[];
  /** How many actionable recommendations exist before the top-N cut. */
  total: number;
  generatedAt: string;
}

/** Options let each surface tune what it needs without duplicating the queue. */
export interface QueueOptions {
  /** Max items returned (surfaces cap differently: Home ~5, Daily ~10). */
  limit?: number;
  /** Only return items at/above this priority (Attention Center threshold). */
  minPriority?: number;
  /** Restrict to specific areas (e.g. Executive OS office view). */
  areas?: Recommendation["area"][];
  /** Per-engine scan cap (keeps the aggregate read cheap). */
  perEngine?: number;
}

/**
 * The shared Broker-Intelligence priority queue. Areas 4–6 plug in here as they
 * ship (add their service call below) — surfaces need no change.
 */
export async function getBrokerIntelligenceQueue(opts: QueueOptions = {}): Promise<BrokerIntelligenceQueue> {
  const perEngine = opts.perEngine ?? 20;
  const results = await Promise.allSettled([
    getAcquisitionIntelligence(perEngine),
    getBuyerIntelligence(perEngine),
    getSellerIntelligence(perEngine),
    getDealIntelligence(perEngine),
    // Batch 5.6E — the canonical Journey spine, feeding the SAME shared queue.
    getJourneyIntelligence(perEngine),
  ]);

  let recs: Recommendation[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") recs = recs.concat(r.value.recommendations);
  }

  const ranked = buildPriorityQueue(recs);

  // Phase 4 — re-rank with the broker's REAL historical behavior (not AI guess):
  // recommendation kinds they consistently act on rise; kinds they consistently
  // dismiss sink. Bounded so evidence still leads; neutral until enough history.
  const model = await getLearningModel();
  const learned = applyLearning(ranked, model);

  // Phase 3 — apply the broker's persisted lifecycle decisions to the live
  // queue: dismissed / completed / done-elsewhere / rejected / actively-snoozed
  // items drop out (nothing silently, the broker chose it); the rest carry their
  // state. Best-effort — a persistence hiccup never blanks the queue.
  const events = await loadRecommendationEvents();
  let queue: LifecycleAwareRecommendation[] = applyLifecycle(learned, reduceLatestStates(events));

  if (opts.areas?.length) queue = queue.filter((q) => opts.areas!.includes(q.area));
  if (opts.minPriority != null) queue = queue.filter((q) => q.priority >= opts.minPriority!);

  const total = queue.length;
  const items = opts.limit != null ? queue.slice(0, opts.limit) : queue;
  return { items, total, generatedAt: new Date().toISOString() };
}
