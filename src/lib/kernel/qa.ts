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
  id: "EVT1",
  event_type: "lead.created",
  entity_type: "lead",
  entity_id: "L1",
  occurred_at: "2026-07-10T09:00:00.000Z",
  organization_id: "ORG1",
  actor_user_id: "U1",
  payload: { source: "website" },
};

// 1) mapped type → Hebrew title, one projection (subject only, no related ids)
const p1 = projectEventToTimeline(base);
check("lead.created projects one row", p1.length === 1);
check("lead.created title is Hebrew mapped", p1[0]?.title === "נוצר ליד חדש");
check("carries org/entity/actor/occurred/event_id", p1[0]?.org_id === "ORG1" && p1[0]?.entity_id === "L1" && p1[0]?.actor_user_id === "U1" && p1[0]?.occurred_at === base.occurred_at && p1[0]?.event_id === "EVT1");
check("reuses event_type verbatim", p1[0]?.event_type === "lead.created");
check("kernel source + internal visibility", p1[0]?.source === "kernel" && p1[0]?.visibility === "internal");

// 2) deal.won + deal.lost
check("deal.won title", projectEventToTimeline({ ...base, event_type: "deal.won", entity_type: "deal" })[0]?.title === "עסקה נסגרה בהצלחה");
check("deal.lost title", projectEventToTimeline({ ...base, event_type: "deal.lost", entity_type: "deal" })[0]?.title === "עסקה אבדה");

// 2b) RELATED-ENTITY FAN-OUT: deal.won with buyer+seller+property → 4 timelines,
//     one canonical event_id shared, distinct dedup key per target.
const won = projectEventToTimeline({ ...base, id: "EVTW", event_type: "deal.won", entity_type: "deal", entity_id: "D1", payload: { propertyId: "P1", buyerId: "B1", sellerId: "S1" } });
check("deal.won fans onto 4 timelines", won.length === 4);
check("fan-out covers deal+property+buyer+seller", ["deal:D1", "property:P1", "buyer:B1", "seller:S1"].every((k) => won.some((r) => `${r.entity_type}:${r.entity_id}` === k)));
check("all share the same canonical event_id", won.every((r) => r.event_id === "EVTW"));
const keys = won.map((r) => `${r.event_id}:${r.entity_type}:${r.entity_id}`);
check("dedup keys are distinct per timeline", new Set(keys).size === won.length);
check("related links populated for context", won.find((r) => r.entity_type === "property")?.related_entity_type === "deal");

// 2c) price_changed carries a description from the payload
check("price_changed has description", projectEventToTimeline({ ...base, event_type: "property.price_changed", entity_type: "property", entity_id: "P1", payload: { oldPrice: 100, newPrice: 90 } })[0]?.description === "מ-100 ל-90");

// 3) explicitly-skipped noisy / channel types → []
check("external_listing.updated is skipped", projectEventToTimeline({ ...base, event_type: "external_listing.updated", entity_type: "external_listing" }).length === 0);
check("communication.received is skipped (channel)", projectEventToTimeline({ ...base, event_type: "communication.received", entity_type: "communication" }).length === 0);
check("external_listing.ingested IS projected (required)", projectEventToTimeline({ ...base, event_type: "external_listing.ingested", entity_type: "external_listing", entity_id: "X1" }).length === 1);

// 4) unknown type → generic non-empty title (never crashes)
const pu = projectEventToTimeline({ ...base, event_type: "widget.frobnicated", entity_type: "widget" });
check("unknown type still projects with a generic title", pu.length === 1 && !!pu[0].title && pu[0].title.length > 0);

// 5) missing required fields → []
check("missing entity_id → []", projectEventToTimeline({ ...base, entity_id: "" }).length === 0);
check("missing org → []", projectEventToTimeline({ ...base, organization_id: "" }).length === 0);
check("missing event id → []", projectEventToTimeline({ ...base, id: "" }).length === 0);

// 6) determinism
check("deterministic", JSON.stringify(projectEventToTimeline(base)) === JSON.stringify(projectEventToTimeline(base)));

// 7) null actor tolerated + cross-org isolation carried
check("null actor tolerated", projectEventToTimeline({ ...base, actor_user_id: null })[0]?.actor_user_id === null);
check("org carried onto every projection (no leakage)", won.every((r) => r.org_id === "ORG1"));

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

// ── Stage 4A · graph subscriber (pure) ──────────────────────────────────────
import { projectEventToGraphEdges } from "./graph-subscriber";

// seller.linked_to_property → owns edge
const g1 = projectEventToGraphEdges({ ...base, event_type: "seller.linked_to_property", entity_type: "seller", entity_id: "S1", payload: { propertyId: "P1" } });
check("seller link → 1 owns edge", g1.length === 1 && g1[0].relationship_type === "owns" && g1[0].target_entity_id === "P1");

// deal.created with buyer+property → 2 edges
const g2 = projectEventToGraphEdges({ ...base, event_type: "deal.created", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1", propertyId: "P1" } });
check("deal.created → buyer+property edges", g2.length === 2 && g2.some(e => e.relationship_type === "involves_buyer") && g2.some(e => e.relationship_type === "involves_property"));

// property.sold with buyer → purchased edge (buyer→property)
const g3 = projectEventToGraphEdges({ ...base, event_type: "property.sold", entity_type: "property", entity_id: "P1", payload: { buyerId: "B1" } });
check("property.sold → purchased edge", g3.length === 1 && g3[0].source_entity_type === "buyer" && g3[0].target_entity_id === "P1");

// lead.converted_to_buyer → became edge
const g4 = projectEventToGraphEdges({ ...base, event_type: "lead.converted_to_buyer", entity_type: "lead", entity_id: "L1", payload: { buyerId: "B1" } });
check("lead→buyer became edge", g4.length === 1 && g4[0].relationship_type === "became");

// missing payload ids → no edges (never fabricate)
check("deal.created with no parties → 0 edges", projectEventToGraphEdges({ ...base, event_type: "deal.created", entity_type: "deal", entity_id: "D1", payload: {} }).length === 0);

// non-linkage event → 0 edges
check("buyer.updated → 0 edges", projectEventToGraphEdges({ ...base, event_type: "buyer.updated", entity_type: "buyer" }).length === 0);

// snake_case payload keys tolerated
check("snake_case payload works", projectEventToGraphEdges({ ...base, event_type: "seller.linked_to_property", entity_type: "seller", entity_id: "S1", payload: { property_id: "P9" } })[0]?.target_entity_id === "P9");

// ── Stage 4B · memory subscriber (pure) ─────────────────────────────────────
import { projectEventToMemory } from "./memory-subscriber";

const m1 = projectEventToMemory({ ...base, event_type: "deal.won", entity_type: "deal", entity_id: "D1" });
check("deal.won → memory milestone", m1 !== null && m1.impact === "positive" && m1.source_module === "kernel");
check("deal.lost → negative memory", projectEventToMemory({ ...base, event_type: "deal.lost", entity_type: "deal" })?.impact === "negative");
check("property.sold → memory", projectEventToMemory({ ...base, event_type: "property.sold", entity_type: "property" })?.title === "נכס נמכר");
check("routine buyer.updated → no memory", projectEventToMemory({ ...base, event_type: "buyer.updated", entity_type: "buyer" }) === null);
check("memory carries entity + occurred", m1?.entity_id === "D1" && m1?.occurred_at === base.occurred_at);

// ── Stage 5A · journey subscriber (pure) ────────────────────────────────────
import { projectEventToJourneyTransition } from "./journey-subscriber";

check("lead.created → open lead journey (new)", (() => { const j = projectEventToJourneyTransition(base); return j?.subjectType === "lead" && j?.stage === "new" && j?.outcome === "open"; })());
check("buyer.stage_changed → buyer stage from payload", projectEventToJourneyTransition({ ...base, event_type: "buyer.stage_changed", entity_type: "buyer", entity_id: "B1", payload: { stage: "qualified" } })?.stage === "qualified");
check("buyer.stage_changed with no stage → null", projectEventToJourneyTransition({ ...base, event_type: "buyer.stage_changed", entity_type: "buyer", entity_id: "B1", payload: {} }) === null);
check("deal.created → buyer in_deal", (() => { const j = projectEventToJourneyTransition({ ...base, event_type: "deal.created", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1" } }); return j?.subjectType === "buyer" && j?.subjectId === "B1" && j?.stage === "in_deal"; })());
check("deal.won → closed_won outcome", projectEventToJourneyTransition({ ...base, event_type: "deal.won", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1" } })?.outcome === "won");
check("deal.lost → closed_lost outcome", projectEventToJourneyTransition({ ...base, event_type: "deal.lost", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1" } })?.outcome === "lost");
check("deal.won with no buyer → null", projectEventToJourneyTransition({ ...base, event_type: "deal.won", entity_type: "deal", entity_id: "D1", payload: {} }) === null);
check("non-journey event → null", projectEventToJourneyTransition({ ...base, event_type: "property.price_changed", entity_type: "property" }) === null);

// ── Stage 2 · Legacy bridge (pure) — historical milestones → canonical timeline ─
import { bridgeLegacyActivity, bridgeJourneyEvent, bridgeDocumentAudit, syntheticEventId, type LegacyActivityRow, type JourneyEventRow, type DocumentAuditRow } from "./legacy-bridge";

// synthetic id is a stable uuid shape, deterministic per seed
const sid = syntheticEventId("activities:A1:buyer:B1");
check("synthetic id is uuid-shaped", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sid));
check("synthetic id deterministic", sid === syntheticEventId("activities:A1:buyer:B1"));
check("synthetic id differs per seed", sid !== syntheticEventId("activities:A1:seller:S1"));

// legacy activity → resolves subject from entity FKs, source=backfill
const la: LegacyActivityRow = { id: "A1", org_id: "ORG1", actor_id: "U1", type: "call", subject: "שיחה עם קונה", body: "עדכון", occurred_at: "2026-06-01T10:00:00Z", buyer_id: "B1", seller_id: null, lead_id: null, property_id: null, deal_id: null };
const bla = bridgeLegacyActivity(la);
check("legacy activity bridges to buyer timeline", bla?.entity_type === "buyer" && bla?.entity_id === "B1");
check("legacy activity is source=backfill", bla?.source === "backfill" && bla?.visibility === "internal");
check("legacy activity carries actor + title", bla?.actor_user_id === "U1" && bla?.title === "שיחה עם קונה");
check("legacy activity idempotency id deterministic", bla?.event_id === syntheticEventId("activities:A1:buyer:B1"));
// unresolved link (no entity FK) → null (caller counts unresolvedLinks)
check("legacy activity with no entity → null", bridgeLegacyActivity({ ...la, buyer_id: null }) === null);
// property takes precedence in subject resolution
check("subject precedence property>buyer", bridgeLegacyActivity({ ...la, property_id: "P1" })?.entity_type === "property");

// journey_events → entity timeline + journey relation
const je: JourneyEventRow = { id: "J1", org_id: "ORG1", journey_id: "JR1", entity_type: "buyer", entity_id: "B1", event_type: "stage_changed", from_stage: "new", to_stage: "qualified", title: null, detail: null, occurred_at: "2026-06-02T10:00:00Z" };
const bje = bridgeJourneyEvent(je);
check("journey event bridges to entity timeline", bje?.entity_type === "buyer" && bje?.related_entity_type === "journey");
check("journey event stage in description", bje?.description === "new ← qualified");
check("journey event missing entity → null", bridgeJourneyEvent({ ...je, entity_id: null }) === null);

// document audit → only milestones project (raw noise skipped)
const da: DocumentAuditRow = { id: "DA1", organization_id: "ORG1", document_id: "DOC1", event: "signed", detail: null, actor_user_id: "U1", created_at: "2026-06-03T10:00:00Z" };
check("document milestone bridges", bridgeDocumentAudit(da)?.entity_type === "document" && bridgeDocumentAudit(da)?.event_type === "document.signed");
check("document non-milestone skipped", bridgeDocumentAudit({ ...da, event: "opened_settings" }) === null);
check("document audit deterministic id", bridgeDocumentAudit(da)?.event_id === syntheticEventId("document_audit_logs:DA1"));

// ── Stage 3 · Automation subscriber (classify → journey trigger + bundle) ────
import { projectEventToAutomation } from "./automation-subscriber";

const aBuyer = projectEventToAutomation({ ...base, event_type: "buyer.created", entity_type: "buyer", entity_id: "B1" });
check("buyer.created → new_buyer bundle candidate", aBuyer?.bundleEventType === "new_buyer" && aBuyer?.requiresApproval === true);
check("automation never auto-executes (requiresApproval)", aBuyer?.requiresApproval === true);
check("automation carries dedupKey = event id", aBuyer?.dedupKey === "EVT1");
const aPrice = projectEventToAutomation({ ...base, event_type: "property.price_changed", entity_type: "property", entity_id: "P1" });
check("price_changed → journey price_drop + bundle price_opportunity", aPrice?.journeyTrigger === "price_drop" && aPrice?.bundleEventType === "price_opportunity");
const aMeeting = projectEventToAutomation({ ...base, event_type: "meeting.completed", entity_type: "meeting", entity_id: "M1" });
check("meeting.completed → journey + bundle", aMeeting?.journeyTrigger === "meeting_completed" && aMeeting?.bundleEventType === "meeting_completed");
check("non-automation event → null", projectEventToAutomation({ ...base, event_type: "document.viewed", entity_type: "document", entity_id: "D1" }) === null);
check("automation missing event id → null", projectEventToAutomation({ ...base, id: "", event_type: "buyer.created" }) === null);
check("automation deterministic", JSON.stringify(projectEventToAutomation({ ...base, event_type: "buyer.created" })) === JSON.stringify(projectEventToAutomation({ ...base, event_type: "buyer.created" })));

// ── Stage 3 · Recommendation subscriber (event → areas + cache refresh) ──────
import { projectEventToRecommendationRefresh } from "./recommendation-subscriber";

const rWon = projectEventToRecommendationRefresh({ ...base, event_type: "deal.won", entity_type: "deal", entity_id: "D1" });
check("deal.won affects deal+office", !!(rWon?.affectedAreas.includes("deal") && rWon?.affectedAreas.includes("office")));
check("deal.won refreshes daily + executive", rWon?.refreshDaily === true && rWon?.refreshExecutive === true);
const rBuyer = projectEventToRecommendationRefresh({ ...base, event_type: "buyer.created", entity_type: "buyer", entity_id: "B1" });
check("buyer.created refreshes daily only (not exec)", rBuyer?.refreshDaily === true && rBuyer?.refreshExecutive === false);
const rSellerRisk = projectEventToRecommendationRefresh({ ...base, event_type: "seller.risk_changed", entity_type: "seller", entity_id: "S1" });
check("seller.risk_changed → seller area + exec", !!(rSellerRisk?.affectedAreas.includes("seller") && rSellerRisk?.refreshExecutive === true));
check("routine event → no recommendation impact", projectEventToRecommendationRefresh({ ...base, event_type: "agent.profile_updated", entity_type: "agent", entity_id: "A1" }) === null);
check("recommendation cross-org carried", projectEventToRecommendationRefresh({ ...base, organization_id: "ORG9", event_type: "buyer.created" })?.entityId === base.entity_id);
check("recommendation deterministic", JSON.stringify(projectEventToRecommendationRefresh({ ...base, event_type: "deal.won" })) === JSON.stringify(projectEventToRecommendationRefresh({ ...base, event_type: "deal.won" })));

console.log(`\nKernel Stage 2+3 (timeline+bridge+automation+notification+recommendation) QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
