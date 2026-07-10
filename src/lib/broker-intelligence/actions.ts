"use server";
// ============================================================================
// 🧠 ZONO — BROKER INTELLIGENCE · server actions (client entry points).
// The Command Center (⌘K) is a client component, so it can't call the server
// aggregate service directly. This action exposes the SAME shared priority
// queue as a compact, client-safe DTO — no second model, no recomputation.
// Priority ordering + dedup + evidence merge all happen upstream in the queue.
// ============================================================================
import { revalidatePath } from "next/cache";
import { getBrokerIntelligenceQueue, type QueueOptions } from "./aggregate-service";
import type { Urgency } from "./types";
import type { LifecycleAction } from "./lifecycle";
import { recordRecommendationEvent } from "./recommendation-events-repository";

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

/** Payload the RecommendationCard controls send when the broker acts. */
export interface LifecycleActionInput {
  recKey: string;
  entityType: string;
  entityId: string;
  action: LifecycleAction;
  /** ISO time for snooze resurfacing (required when action==="snoozed"). */
  snoozeUntil?: string | null;
  area?: string | null;
  actionClass?: string | null;
  title?: string | null;
  confidence?: number | null;
  priority?: number | null;
  note?: string | null;
}

/**
 * Persist a lifecycle decision (Accept / Dismiss / Snooze / Complete / Done-
 * elsewhere / Reject) and refresh every surface that reads the shared queue, so
 * the decision travels everywhere at once. Nothing disappears silently — the
 * broker chose it, and it's recorded (and feeds the Phase-4 learning loop).
 */
export async function recordRecommendationLifecycleAction(
  input: LifecycleActionInput,
): Promise<{ ok: boolean }> {
  const ok = await recordRecommendationEvent(input);
  if (ok) {
    for (const p of ["/", "/today", "/notifications", "/executive"]) {
      try { revalidatePath(p); } catch { /* best-effort */ }
    }
  }
  return { ok };
}
