// ============================================================================
// 🧪 ZONO OS 2.0 — Stage 2 · Event Kernel · offline QA for the pure projector.
// No DB, no network. Run: npx tsx src/lib/kernel/qa.ts
// ============================================================================
import { projectEventToTimeline, type DomainEventLike } from "./subscriber";
import { projectEventToNotification, notificationEntityColumn } from "./notification-subscriber";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); }
}

const base: DomainEventLike = {
  event_type: "lead.created",
  entity_type: "lead",
  entity_id: "L1",
  occurred_at: "2026-07-10T09:00:00.000Z",
  organization_id: "ORG1",
  actor_user_id: "U1",
  payload: { source: "website" },
};

// 1) mapped type → Hebrew title
const p1 = projectEventToTimeline(base);
check("lead.created projects", p1 !== null);
check("lead.created title is Hebrew mapped", p1?.title === "נוצר ליד חדש");
check("carries org/entity/actor/occurred", p1?.org_id === "ORG1" && p1?.entity_id === "L1" && p1?.actor_id === "U1" && p1?.occurred_at === base.occurred_at);
check("reuses event_type verbatim", p1?.event_type === "lead.created");

// 2) deal.won + deal.lost
check("deal.won title", projectEventToTimeline({ ...base, event_type: "deal.won", entity_type: "deal" })?.title === "עסקה נסגרה בהצלחה");
check("deal.lost title", projectEventToTimeline({ ...base, event_type: "deal.lost", entity_type: "deal" })?.title === "עסקה אבדה");

// 3) explicitly-skipped noisy type → null
check("external_listing.ingested is skipped", projectEventToTimeline({ ...base, event_type: "external_listing.ingested", entity_type: "external_listing" }) === null);

// 4) unknown type → generic non-empty title (never crashes)
const pu = projectEventToTimeline({ ...base, event_type: "widget.frobnicated", entity_type: "widget" });
check("unknown type still projects with a generic title", pu !== null && !!pu.title && pu.title.length > 0);

// 5) missing required fields → null
check("missing entity_id → null", projectEventToTimeline({ ...base, entity_id: "" }) === null);
check("missing org → null", projectEventToTimeline({ ...base, organization_id: "" }) === null);

// 6) determinism
check("deterministic", JSON.stringify(projectEventToTimeline(base)) === JSON.stringify(projectEventToTimeline(base)));

// 7) null actor tolerated
check("null actor tolerated", projectEventToTimeline({ ...base, actor_user_id: null })?.actor_id === null);

// ── Stage 3 · notification subscriber ───────────────────────────────────────
// high-signal event with an actor → a notification
const n1 = projectEventToNotification({ ...base, event_type: "deal.won", entity_type: "deal", entity_id: "D1" });
check("deal.won raises a notification", n1 !== null);
check("deal.won notification is success level", n1?.level === "success");
check("deal.won notification carries actor as user", n1?.user_id === "U1");
check("deal.won maps entity → deal", n1?.entityType === "deal" && n1?.entityId === "D1");
check("deal FK column resolves", notificationEntityColumn("deal") === "deal_id");

// low-signal event → no notification (timeline only)
check("buyer.updated raises no notification", projectEventToNotification({ ...base, event_type: "buyer.updated", entity_type: "buyer" }) === null);

// high-signal but NO actor → null (notifications.user_id is NOT NULL)
check("no actor → no notification", projectEventToNotification({ ...base, event_type: "deal.won", entity_type: "deal", actor_user_id: null }) === null);

// unmapped entity column → null (processor omits the FK, still inserts)
check("unmapped entity column → null", notificationEntityColumn("widget") === null);

// lead.created notifies + links lead FK
check("lead.created notifies", projectEventToNotification(base)?.category === "new_lead");
check("lead FK column", notificationEntityColumn("lead") === "lead_id");

console.log(`\nKernel Stage 2+3 QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
