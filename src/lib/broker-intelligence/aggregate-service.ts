// ============================================================================
// 🧮 ZONO — BROKER INTELLIGENCE · Aggregate queue service (server-only).
// The single entry point every surface uses (Home V3 / Daily OS / Today /
// Attention Center / Executive OS / ⌘K). Gathers recommendations from ALL
// intelligence-area services, feeds them into the ONE shared prioritizer
// (dedup + evidence merge + ranking), and returns the top items. Best-effort per
// engine — one failing engine never blanks the whole queue. Never throws.
// ============================================================================
import "server-only";
import { buildPriorityQueue, type PrioritizedRecommendation } from "./priority";
import type { Recommendation } from "./types";
import { getAcquisitionIntelligence } from "./acquisition-service";
import { getBuyerIntelligence } from "./buyer-service";
import { getSellerIntelligence } from "./seller-service";
import { getDealIntelligence } from "./deal-service";

export interface BrokerIntelligenceQueue {
  items: PrioritizedRecommendation[];
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
  ]);

  let recs: Recommendation[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") recs = recs.concat(r.value.recommendations);
  }

  let queue = buildPriorityQueue(recs);
  if (opts.areas?.length) queue = queue.filter((q) => opts.areas!.includes(q.area));
  if (opts.minPriority != null) queue = queue.filter((q) => q.priority >= opts.minPriority!);

  const total = queue.length;
  const items = opts.limit != null ? queue.slice(0, opts.limit) : queue;
  return { items, total, generatedAt: new Date().toISOString() };
}
