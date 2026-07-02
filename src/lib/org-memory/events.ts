// ============================================================================
// 🧠 Organizational Memory — event derivation (pure). 27.8. Part 1.
// Derives real memory events from already-persisted mission history (created /
// completed / cancelled) and maps them to semantic organizational events
// (broker recruited, campaign succeeded, territory won/lost, listing sold,
// property expired, …). Structural input — no engine import, no fabrication.
// ============================================================================
import type { MemoryEvent, MemoryEventType, Outcome, Impact } from "./types";

// Structural shape compatible with the Mission type (no coupling / no duplication).
export interface MissionLike {
  id: string; missionType: string;
  entityType: string; entityId: string | null; entityName: string | null;
  status: string; businessImpact: Impact; reason: string; evidence: string[];
  createdAt: string; completedAt: string | null;
  history: { at: string; event: string; detail: string | null }[];
}

const SUCCESS_MAP: Record<string, MemoryEventType> = {
  RECRUIT_BROKER: "broker_recruited", MARKETING_CAMPAIGN: "campaign_succeeded",
  EXPAND_TERRITORY: "territory_won", SELLER_OPPORTUNITY: "seller_signed",
  BUYER_OPPORTUNITY: "buyer_purchased", RECOVER_LISTINGS: "listing_sold",
  PROPERTY_FOLLOWUP: "listing_sold",
};
const FAILURE_MAP: Record<string, MemoryEventType> = {
  RECRUIT_BROKER: "broker_left", MARKETING_CAMPAIGN: "campaign_failed",
  EXPAND_TERRITORY: "territory_lost", PROPERTY_FOLLOWUP: "property_expired",
};
const CREATED_MAP: Record<string, MemoryEventType> = {
  MARKETING_CAMPAIGN: "campaign_launched", EXPAND_TERRITORY: "office_expanded",
};

const EVENT_HE: Record<string, string> = {
  mission_completed: "משימה הושלמה", mission_failed: "משימה נכשלה", mission_created: "משימה נוצרה",
  listing_sold: "מודעה נמכרה", property_expired: "נכס פג תוקף", seller_signed: "מוכר נחתם",
  buyer_purchased: "קונה רכש", broker_recruited: "מתווך גויס", broker_left: "מתווך עזב",
  campaign_launched: "קמפיין הושק", campaign_succeeded: "קמפיין הצליח", campaign_failed: "קמפיין נכשל",
  office_expanded: "משרד התרחב", territory_won: "טריטוריה נכבשה", territory_lost: "טריטוריה אבדה",
};
export const eventLabel = (t: MemoryEventType): string => EVENT_HE[t] ?? String(t);

let _e = 0;
const eid = () => `mem-${++_e}`;
const entityLabel = (m: MissionLike): string => m.entityName ?? (m.entityId ? `${m.entityType}:${m.entityId}` : m.entityType);

function makeEvent(m: MissionLike, at: string, type: MemoryEventType, outcome: Outcome, reason: string): MemoryEvent {
  return {
    id: eid(), at, type, outcome,
    entityType: m.entityType, entityId: m.entityId, entityName: m.entityName,
    reason: reason || m.reason || "", impact: m.businessImpact,
    outcomeText: eventLabel(type), evidence: m.evidence ?? [], category: m.missionType,
  };
}

/** Derive memory events from a set of missions (via their real history). */
export function deriveEventsFromMissions(missions: MissionLike[]): MemoryEvent[] {
  _e = 0;
  const out: MemoryEvent[] = [];
  for (const m of missions) {
    const hist = m.history ?? [];
    let sawCompleted = false, sawCancelled = false;
    for (const h of hist) {
      if (h.event === "created") out.push(makeEvent(m, h.at, CREATED_MAP[m.missionType] ?? "mission_created", "neutral", h.detail ?? "נוצרה מהחלטה"));
      else if (h.event === "completed") { sawCompleted = true; out.push(makeEvent(m, h.at, SUCCESS_MAP[m.missionType] ?? "mission_completed", "success", h.detail ?? "הושלמה בהצלחה")); }
      else if (h.event === "cancelled") { sawCancelled = true; out.push(makeEvent(m, h.at, FAILURE_MAP[m.missionType] ?? "mission_failed", "failure", h.detail ?? "בוטלה")); }
    }
    // Backfill from status if history didn't record the terminal event.
    if (m.status === "DONE" && !sawCompleted) out.push(makeEvent(m, m.completedAt ?? m.createdAt, SUCCESS_MAP[m.missionType] ?? "mission_completed", "success", "הושלמה"));
    if (m.status === "CANCELLED" && !sawCancelled) out.push(makeEvent(m, m.completedAt ?? m.createdAt, FAILURE_MAP[m.missionType] ?? "mission_failed", "failure", "בוטלה"));
  }
  return out;
}

export { entityLabel };
