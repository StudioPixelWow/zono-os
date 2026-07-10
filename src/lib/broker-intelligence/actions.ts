"use server";
// ============================================================================
// 🧠 ZONO — BROKER INTELLIGENCE · server actions (client entry points).
// The Command Center (⌘K) is a client component, so it can't call the server
// aggregate service directly. This action exposes the SAME shared priority
// queue as a compact, client-safe DTO — no second model, no recomputation.
// Priority ordering + dedup + evidence merge all happen upstream in the queue.
// ============================================================================
import { getBrokerIntelligenceQueue, type QueueOptions } from "./aggregate-service";
import type { Urgency } from "./types";

/** Client-safe slice of a prioritized recommendation for compact surfaces. */
export interface QueueSuggestion {
  id: string;
  title: string;
  why: string;
  suggestedAction: string;
  href: string;
  urgency: Urgency;
  priority: number;
  confidence: number;
  /** How many engines corroborated this action (≥1). */
  mergedCount: number;
  /** Count of distinct evidence sources behind it (for an honest badge). */
  sourceCount: number;
}

/**
 * Top-N recommendations from the shared queue, shaped for the ⌘K command center.
 * Best-effort: never throws, returns [] if intelligence can't be assembled.
 */
export async function brokerQueueSuggestionsAction(opts: QueueOptions = {}): Promise<QueueSuggestion[]> {
  try {
    const { items } = await getBrokerIntelligenceQueue({ limit: 4, ...opts });
    return items.map((r) => ({
      id: r.id,
      title: r.title,
      why: r.why,
      suggestedAction: r.suggestedAction,
      // Contract href is nullable; fall back to the shared-queue surface so the
      // card is always actionable (never a dead link).
      href: r.href ?? "/today",
      urgency: r.urgency,
      priority: r.priority,
      confidence: r.confidence,
      mergedCount: r.mergedCount,
      sourceCount: r.contributingSources.length,
    }));
  } catch {
    return [];
  }
}
