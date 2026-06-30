// ============================================================================
// 🔔 Auto-Trigger City Brokerage Learning™ (Phase 26.4.10). Server-only.
// Connects product events (onboarding city, broker/property/lead creation,
// external-listing sync, manual button) to the Lazy City Learning service from
// 26.4.9. FIRE-AND-FORGET: callers do `void triggerCityLearning(...)` so the user
// action is NEVER blocked and learning errors NEVER break creation/onboarding.
// Throttled + deduped per org+city. No schema/engine/UI changes.
// ============================================================================
import "server-only";
import { getCityKnowledgeStatus, normCityKb } from "./brokerage-knowledge";
import { ensureCityBrokerageKnowledge } from "./city-lazy-learning";

export type CityLearningReason =
  | "onboarding_primary_city" | "broker_created" | "property_created"
  | "lead_created" | "seller_created" | "buyer_created"
  | "external_listing_city_detected" | "manual_city_learning";

export type CityLearningAction =
  | "BOOTSTRAP_STARTED" | "REFRESH_STARTED" | "REUSED"
  | "SKIPPED_RECENT" | "SKIPPED_IN_PROGRESS" | "SKIPPED_NO_CITY" | "ERROR";

export interface CityLearningOutcome {
  orgId: string; city: string; reason: CityLearningReason;
  recommendedAction: string | null; actionTaken: CityLearningAction;
  timestamp: string;
}

// In-memory throttle/dedup (per server instance, best-effort — no schema change).
const THROTTLE_MS = 6 * 60 * 60 * 1000;          // don't re-trigger same city within 6h
const lastRunAt = new Map<string, number>();
const inProgress = new Set<string>();

/**
 * Best-effort, non-blocking city learning. Never throws. Returns the outcome for
 * observability/logging. Callers should NOT await it: `void triggerCityLearning(...)`.
 */
export async function triggerCityLearning(
  orgId: string | null | undefined, cityRaw: string | null | undefined, reason: CityLearningReason,
): Promise<CityLearningOutcome> {
  const ts = () => new Date().toISOString();
  const city = (cityRaw ?? "").trim();
  const out = (actionTaken: CityLearningAction, recommendedAction: string | null = null): CityLearningOutcome => {
    const o: CityLearningOutcome = { orgId: orgId ?? "", city, reason, recommendedAction, actionTaken, timestamp: ts() };
    console.info("[city-learning]", o);
    return o;
  };
  if (!orgId || !city) return out("SKIPPED_NO_CITY");

  const key = `${orgId}|${normCityKb(city)}`;
  if (inProgress.has(key)) return out("SKIPPED_IN_PROGRESS");
  const last = lastRunAt.get(key);
  if (last && Date.now() - last < THROTTLE_MS) return out("SKIPPED_RECENT");

  try {
    // Cheap read first — healthy cities are reused, never re-researched.
    const status = await getCityKnowledgeStatus(orgId, city);
    if (status.recommendedAction === "REUSE_KNOWLEDGE" || status.recommendedAction === "INSUFFICIENT_DATA") {
      lastRunAt.set(key, Date.now());
      return out(status.recommendedAction === "REUSE_KNOWLEDGE" ? "REUSED" : "SKIPPED_NO_CITY", status.recommendedAction);
    }
    inProgress.add(key);
    lastRunAt.set(key, Date.now());
    const result = await ensureCityBrokerageKnowledge(orgId, city, reason);
    return out(result.decision === "bootstrapped" ? "BOOTSTRAP_STARTED" : result.decision === "refreshed" ? "REFRESH_STARTED" : "REUSED", status.recommendedAction);
  } catch (e) {
    console.error("[city-learning] failed:", reason, city, e);
    return out("ERROR");
  } finally {
    inProgress.delete(key);
  }
}
