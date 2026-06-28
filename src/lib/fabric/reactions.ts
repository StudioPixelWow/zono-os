// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — event-driven reactions (server-only).
// ----------------------------------------------------------------------------
// Wires the automatic reaction chain WITHOUT engines calling each other and
// WITHOUT risky synchronous recompute loops. Each reaction invalidates the
// dependent contexts so they recompute LAZILY on next read — the safe form of
// "everything reacts automatically". Idempotent registration.
//
//   listing.published ─▶ (invalidate market+neighborhood+broker contexts)
//   broker.identified ─▶ (invalidate office/agent knowledge + relationships)
//   market.updated    ─▶ (invalidate market + neighborhood + opportunity)
//   knowledge.updated ─▶ (invalidate office/agent/neighborhood contexts)
//   refresh.completed ─▶ (invalidate the subject's whole context)
// ============================================================================
import "server-only";
import { on } from "./events";
import { invalidateEntity, invalidateType } from "./cache";
import type { IntelligenceEvent } from "./types";

let wired = false;

function invSubjectAndCity(e: IntelligenceEvent, types: string[]): void {
  invalidateEntity(e.subject);
  if (e.subject.city) invalidateEntity({ type: "market", id: e.subject.city });
  for (const t of types) invalidateType(t);
}

/** Register the default reaction subscriptions. Safe to call many times. */
export function ensureReactionsWired(): void {
  if (wired) return;
  wired = true;

  on("listing.published", (e) => invSubjectAndCity(e, ["listing", "market", "neighborhood"]));
  on("broker.identified", (e) => { invalidateEntity(e.subject); invalidateType("office"); invalidateType("agent"); });
  on("market.updated", (e) => invSubjectAndCity(e, ["market", "neighborhood", "opportunity"]));
  on("knowledge.updated", (e) => invSubjectAndCity(e, ["office", "agent", "neighborhood"]));
  on("opportunity.updated", (e) => { invalidateEntity(e.subject); });
  on("matching.updated", (e) => { invalidateEntity(e.subject); invalidateType("buyer"); invalidateType("property"); });
  on("refresh.completed", (e) => invSubjectAndCity(e, ["market"]));
}
