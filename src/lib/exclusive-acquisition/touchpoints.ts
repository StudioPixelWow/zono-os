// ============================================================================
// ZONO — contact-history summary + smart follow-up rules (pure, deterministic).
// Turns raw touchpoints into a summary, and signals into concrete follow-up
// tasks (no AI). The engine persists these as radar_seller_followups + tasks.
// ============================================================================
import type { ContactHistorySummary, FollowupSuggestion, Touchpoint } from "./types";

const POSITIVE_OUTCOMES = new Set(["answered", "positive", "scheduled", "interested"]);

/** Summarize a seller's touchpoints into channel counts + last contact/response. */
export function summarizeContactHistory(touchpoints: Touchpoint[]): ContactHistorySummary {
  const sorted = [...touchpoints].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  let calls = 0, whatsapps = 0, meetings = 0, notes = 0, emails = 0;
  let lastResponseAt: string | null = null;
  for (const t of sorted) {
    if (t.channel === "call") calls++;
    else if (t.channel === "whatsapp") whatsapps++;
    else if (t.channel === "meeting") meetings++;
    else if (t.channel === "note") notes++;
    else if (t.channel === "email") emails++;
    const responded = t.direction === "inbound" || (t.outcome != null && POSITIVE_OUTCOMES.has(t.outcome));
    if (responded && !lastResponseAt) lastResponseAt = t.occurredAt;
  }
  return {
    calls, whatsapps, meetings, notes, emails,
    total: sorted.length,
    lastContactAt: sorted[0]?.occurredAt ?? null,
    lastResponseAt,
    respondedBefore: lastResponseAt != null,
  };
}

export interface FollowupContext {
  contactAttempts: number;
  hasPositiveResponse: boolean;
  hoursSinceLastContact: number | null;
  priceDroppedRecently: boolean;
  newBuyerMatch: boolean;
  exclusiveProbability: number;
}

const HOUR = 3_600_000;

/** Deterministic smart follow-up suggestions for a seller opportunity. */
export function smartFollowupRules(ctx: FollowupContext, now: Date = new Date()): FollowupSuggestion[] {
  const out: FollowupSuggestion[] = [];
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();

  // Price dropped → call immediately.
  if (ctx.priceDroppedRecently && ctx.exclusiveProbability >= 50) {
    out.push({ reason: "price_drop", action: "call", title: "ירידת מחיר — להתקשר מיד לבעלים", priority: "urgent", dueAtIso: iso(0) });
  }
  // Buyer found → schedule a showing.
  if (ctx.newBuyerMatch && ctx.exclusiveProbability >= 50) {
    out.push({ reason: "buyer_found", action: "schedule_showing", title: "נמצא קונה מתאים — לתאם צפייה", priority: "high", dueAtIso: iso(0) });
  }
  // No response after 2 days → follow-up task.
  if (ctx.contactAttempts > 0 && !ctx.hasPositiveResponse && ctx.hoursSinceLastContact != null && ctx.hoursSinceLastContact >= 48) {
    out.push({ reason: "no_response", action: "followup", title: "אין מענה יומיים — לבצע מעקב", priority: "medium", dueAtIso: iso(24 * HOUR) });
  }
  return out;
}
