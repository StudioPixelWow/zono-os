// ============================================================================
// 🕘 ZONO OS 2.0 — Stage 5 · Batch 5.6F · Daily OS · "בזמן שלא היית" (PURE).
//
// WHAT HAPPENED — never what ZONO recommends. The two are different claims and
// must never be blended: a recommendation describes what SHOULD happen; an event
// records what DID. The retired implementation derived this section from
// recommendation counts and phrased them as completed work ("מצאתי…", "הכנתי…",
// "ניסחתי…") — telling the broker ZONO had done things it had only suggested.
//
// The ONLY admissible source is the persisted `domain_events` ledger — the same
// outbox the kernel fans out to every subscriber. If nothing was persisted,
// this returns an empty list and the surface says nothing. Silence is correct;
// a fabricated overnight report is not.
// ============================================================================
import type { ActivityFact } from "./types";

/** A persisted domain event, narrowed to what a factual statement needs. */
export interface ActivityEventRow {
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  occurred_at: string;
  payload?: Record<string, unknown> | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}

/**
 * Past-tense, factual labels. Every entry describes a state change that is
 * already in the ledger. Deliberately absent: anything speculative, any
 * "ZONO worked for you" framing, any recommendation phrasing.
 */
function labelFor(e: ActivityEventRow): string | null {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case "property.price_changed": {
      const to = str(p.newPrice) ?? str(p.price) ?? str(p.to);
      return to ? `מחיר נכס עודכן ל-${to}` : "מחיר נכס עודכן";
    }
    case "property.status_changed": {
      const to = str(p.toStatus) ?? str(p.status) ?? str(p.to);
      return to ? `סטטוס נכס השתנה ל-${to}` : "סטטוס נכס השתנה";
    }
    case "journey.stage_changed": return "מסע התקדם לשלב חדש";
    case "journey.completed": return "מסע הושלם";
    case "journey.created": return "מסע חדש נפתח";
    case "journey.blocked": return "מסע נחסם";
    case "deal.won": return "עסקה נסגרה בהצלחה";
    case "deal.lost": return "עסקה אבדה";
    case "deal.stage_changed": return "עסקה עברה שלב";
    case "meeting.completed": return "פגישה הושלמה";
    case "meeting.scheduled": return "פגישה נקבעה";
    case "document.signed": return "מסמך נחתם";
    case "document.completed": return "מסמך הושלם";
    case "lead.created": return "ליד חדש נכנס";
    case "lead.converted_to_buyer": return "ליד הומר לקונה";
    case "lead.converted_to_seller": return "ליד הומר למוכר";
    case "buyer.created": return "קונה חדש נוסף";
    case "seller.created": return "מוכר חדש נוסף";
    case "external_listing.discovered": return "מודעה חיצונית חדשה אותרה";
    case "automation.run_completed": return "אוטומציה הושלמה";
    case "whatsapp.message_received": return "הודעת WhatsApp נכנסה";
    // Unknown / low-value event types are NOT narrated. Inventing a sentence for
    // an event we don't understand is exactly the failure mode this file exists
    // to prevent.
    default: return null;
  }
}

/**
 * Build "בזמן שלא היית" from persisted events only. Deterministic: newest
 * first, one line per event type (the newest of each), bounded. An empty
 * result is a valid, honest state.
 */
export function buildSinceYouWereAway(rows: ActivityEventRow[], limit = 6): ActivityFact[] {
  const out: ActivityFact[] = [];
  const seenType = new Set<string>();
  const sorted = [...rows].sort((a, b) => {
    const d = Date.parse(b.occurred_at) - Date.parse(a.occurred_at);
    // Stable tiebreak so identical timestamps never reorder between renders.
    return d !== 0 ? d : `${a.event_type}${a.entity_id}`.localeCompare(`${b.event_type}${b.entity_id}`);
  });
  for (const e of sorted) {
    if (!e.event_type || !Number.isFinite(Date.parse(e.occurred_at))) continue;
    if (seenType.has(e.event_type)) continue;
    const label = labelFor(e);
    if (!label) continue;
    seenType.add(e.event_type);
    out.push({ at: e.occurred_at, eventType: e.event_type, entityType: e.entity_type, entityId: e.entity_id ?? null, label });
    if (out.length >= limit) break;
  }
  return out;
}
