// ============================================================================
// 👤 ZONO OS 2.0 — STAGE 6 · Batch 6.1 · BROKER WORKSPACE — shared providers.
//
// The workspace's ONE data-access layer. It calls the FROZEN broker-scoped
// canonical providers and nothing else — no SQL, no projection, no business
// logic. Each accessor is wrapped in React `cache()` so two cards asking for
// the same provider trigger exactly ONE execution: shared providers, no
// duplicate requests, no N+1.
//
// Broker isolation is enforced by the providers themselves:
//   · getDailyOS hard-scopes to the signed-in broker (owner_id) for every field
//     the workspace reads; the office-wide slices are never surfaced raw.
//   · getJourneyCenter({owner}) filters journeys to the broker's owner id — and
//     when the broker id cannot be resolved we return null (unavailable),
//     NEVER an org-wide result.
// ============================================================================
import "server-only";
import { cache } from "react";
import { getSessionContext } from "@/lib/auth/session";
import { getDailyOS } from "@/lib/daily-os/service";
import { getJourneyCenter } from "@/lib/journey-center/service";
import type { JourneyCenter } from "@/lib/journey-center/types";

/** The signed-in broker's id (auth user id) — the owner scope for every card. */
export const getBrokerId = cache(async (): Promise<string | null> => {
  try {
    const s = await getSessionContext();
    return s.user?.id ?? null;
  } catch {
    return null;
  }
});

/** The broker-scoped Daily OS (owner_id hard-scoped). Memoized per request. */
export const loadDailyOS = cache(() => getDailyOS());

/** The broker's OWN journeys only. Fails closed: no broker id ⇒ null
 *  (unavailable), never the org-wide Journey Center. */
export const loadBrokerJourney = cache(async (): Promise<JourneyCenter | null> => {
  const brokerId = await getBrokerId();
  if (!brokerId) return null;
  return getJourneyCenter({ owner: brokerId });
});
