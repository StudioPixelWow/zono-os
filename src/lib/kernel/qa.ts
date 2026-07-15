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

// seller.linked_to_property → owns edge (upsert)
const g1 = projectEventToGraphEdges({ ...base, event_type: "seller.linked_to_property", entity_type: "seller", entity_id: "S1", payload: { propertyId: "P1" } });
check("seller link → 1 owns upsert edge", g1.length === 1 && g1[0].relationship_type === "owns" && g1[0].target_entity_id === "P1" && g1[0].op === "upsert");
check("edge carries source event provenance", g1[0].metadata?.sourceEventId === "EVT1");

// seller.unlinked_from_property → retire the owns edge (history kept)
const gUnlink = projectEventToGraphEdges({ ...base, event_type: "seller.unlinked_from_property", entity_type: "seller", entity_id: "S1", payload: { propertyId: "P1" } });
check("seller unlink → retire owns edge", gUnlink.length === 1 && gUnlink[0].op === "retire" && gUnlink[0].relationship_type === "owns");

// deal.created → deal-property(relates_to) + deal-buyer/seller(involves) + agent-deal(assigned_to)
const g2 = projectEventToGraphEdges({ ...base, event_type: "deal.created", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1", sellerId: "S1", propertyId: "P1", agentId: "A1" } });
check("deal.created fan-out = 4 edges", g2.length === 4);
check("deal→property relates_to", g2.some(e => e.target_entity_type === "property" && e.relationship_type === "relates_to"));
check("deal→buyer + deal→seller involves", g2.filter(e => e.relationship_type === "involves").length === 2);
check("agent→deal assigned_to", g2.some(e => e.source_entity_type === "agent" && e.target_entity_type === "deal" && e.relationship_type === "assigned_to"));

// deal.won → deal-property becomes closed_on
check("deal.won → closed_on edge", projectEventToGraphEdges({ ...base, event_type: "deal.won", entity_type: "deal", entity_id: "D1", payload: { propertyId: "P1" } }).some(e => e.relationship_type === "closed_on"));

// deal.lost → RETIRE relations (keep history), never delete
const gLost = projectEventToGraphEdges({ ...base, event_type: "deal.lost", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1", propertyId: "P1" } });
check("deal.lost retires (keeps history)", gLost.length === 2 && gLost.every(e => e.op === "retire"));

// external_listing.promoted → source→property promoted_to
const gPromo = projectEventToGraphEdges({ ...base, event_type: "external_listing.promoted", entity_type: "external_listing", entity_id: "X1", payload: { propertyId: "P1" } });
check("external listing promoted → promoted_to edge", gPromo.length === 1 && gPromo[0].source_entity_type === "external_listing" && gPromo[0].relationship_type === "promoted_to");

// meeting.completed → involves linked entities (fan-out)
const gMeet = projectEventToGraphEdges({ ...base, event_type: "meeting.completed", entity_type: "meeting", entity_id: "M1", payload: { buyerId: "B1", propertyId: "P1" } });
check("meeting → involves fan-out", gMeet.length === 2 && gMeet.every(e => e.source_entity_type === "meeting" && e.relationship_type === "involves"));

// document.signed → relates_to deal/property/parties
const gDoc = projectEventToGraphEdges({ ...base, event_type: "document.signed", entity_type: "document", entity_id: "DOC1", payload: { dealId: "D1", buyerId: "B1" } });
check("document → relates_to fan-out", gDoc.length === 2 && gDoc.every(e => e.source_entity_type === "document" && e.relationship_type === "relates_to"));

// property.sold with buyer → purchased edge (buyer→property)
const g3 = projectEventToGraphEdges({ ...base, event_type: "property.sold", entity_type: "property", entity_id: "P1", payload: { buyerId: "B1" } });
check("property.sold → purchased edge", g3.length === 1 && g3[0].source_entity_type === "buyer" && g3[0].target_entity_id === "P1");

// lead.converted_to_buyer → converted_to edge
const g4 = projectEventToGraphEdges({ ...base, event_type: "lead.converted_to_buyer", entity_type: "lead", entity_id: "L1", payload: { buyerId: "B1" } });
check("lead→buyer converted_to edge", g4.length === 1 && g4[0].relationship_type === "converted_to");

// missing payload ids → no edges (never fabricate) + honest skip
check("deal.created with no parties → 0 edges", projectEventToGraphEdges({ ...base, event_type: "deal.created", entity_type: "deal", entity_id: "D1", payload: {} }).length === 0);
check("agent.profile_updated → 0 edges (no relation)", projectEventToGraphEdges({ ...base, event_type: "agent.profile_updated", entity_type: "agent", entity_id: "A1" }).length === 0);
check("organization.updated → 0 edges", projectEventToGraphEdges({ ...base, event_type: "organization.updated", entity_type: "organization", entity_id: "O1" }).length === 0);
check("buyer.updated → 0 edges", projectEventToGraphEdges({ ...base, event_type: "buyer.updated", entity_type: "buyer" }).length === 0);

// org carried onto every edge (cross-org isolation) + snake_case tolerated
check("edges carry event org (no cross-org)", g2.every(e => e.org_id === "ORG1"));
check("snake_case payload works", projectEventToGraphEdges({ ...base, event_type: "seller.linked_to_property", entity_type: "seller", entity_id: "S1", payload: { property_id: "P9" } })[0]?.target_entity_id === "P9");
check("graph deterministic", JSON.stringify(projectEventToGraphEdges({ ...base, event_type: "deal.created", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1" } })) === JSON.stringify(projectEventToGraphEdges({ ...base, event_type: "deal.created", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1" } })));

// ── Batch 5.6C · Journey → HAS_JOURNEY graph edge ───────────────────────────
const jGraphEvt = (over: Partial<DomainEventLike> = {}) => ({
  ...base, event_type: "journey.stage_changed", entity_type: "journey", entity_id: "J1",
  payload: { journeyType: "property", subjectType: "property", subjectId: "P1", toStage: "marketing" }, ...over,
});
const gjCreate = projectEventToGraphEdges(jGraphEvt({ event_type: "journey.created" }));
check("journey.created → one HAS_JOURNEY edge", gjCreate.length === 1 && gjCreate[0].relationship_type === "has_journey");
check("HAS_JOURNEY source = subject", gjCreate[0].source_entity_type === "property" && gjCreate[0].source_entity_id === "P1");
check("HAS_JOURNEY target = journey node (journeys.id)", gjCreate[0].target_entity_type === "journey" && gjCreate[0].target_entity_id === "J1");
check("HAS_JOURNEY is an upsert", gjCreate[0].op === "upsert");
check("edge metadata carries journeyType/currentStage/label", (() => { const m = gjCreate[0].metadata as Record<string, unknown>; return m.journeyType === "property" && m.currentStage === "marketing" && m.canonicalStageLabel === "שיווק"; })());
check("edge target_name is readable (no raw UUID)", (() => { const m = gjCreate[0].metadata as Record<string, unknown>; return m.target_name === "מסע נכס · שיווק"; })());
check("stage_changed → same single upsert edge (no dup per stage)", (() => { const g = projectEventToGraphEdges(jGraphEvt({ payload: { journeyType: "property", subjectType: "property", subjectId: "P1", toStage: "viewings" } })); return g.length === 1 && g[0].op === "upsert" && (g[0].metadata as Record<string, unknown>).canonicalStageLabel === "צפיות"; })());
check("journey.completed → upsert(terminal) + retire (preserved/inactive)", (() => { const g = projectEventToGraphEdges(jGraphEvt({ event_type: "journey.completed", payload: { journeyType: "property", subjectType: "property", subjectId: "P1", toStage: "sold" } })); return g.length === 2 && g[0].op === "upsert" && g[1].op === "retire" && (g[0].metadata as Record<string, unknown>).terminal === true && (g[0].metadata as Record<string, unknown>).status === "won"; })());
check("journey.blocked → upsert with blocked metadata (edge stays)", (() => { const g = projectEventToGraphEdges(jGraphEvt({ event_type: "journey.blocked" })); return g.length === 1 && g[0].op === "upsert" && (g[0].metadata as Record<string, unknown>).blocked === true; })());
check("journey.reopened → upsert (reactivates same edge)", (() => { const g = projectEventToGraphEdges(jGraphEvt({ event_type: "journey.reopened" })); return g.length === 1 && g[0].op === "upsert"; })());
check("journey with missing subject → 0 edges (skipped honestly)", projectEventToGraphEdges(jGraphEvt({ payload: { journeyType: "property", toStage: "marketing" } })).length === 0);
check("journey with unsupported type → 0 edges", projectEventToGraphEdges(jGraphEvt({ payload: { journeyType: "widget", subjectType: "widget", subjectId: "W1" } })).length === 0);
check("non-lifecycle journey.* → 0 edges (no churn)", projectEventToGraphEdges(jGraphEvt({ event_type: "journey.score_updated" })).length === 0);
check("journey edge carries event org (no cross-org)", gjCreate[0].org_id === "ORG1");
check("buyer journey → has_journey (buyer subject)", (() => { const g = projectEventToGraphEdges(jGraphEvt({ payload: { journeyType: "buyer", subjectType: "buyer", subjectId: "B1", toStage: "new" } })); return g[0]?.source_entity_type === "buyer" && (g[0].metadata as Record<string, unknown>).target_name === "מסע קונה · קונה חדש"; })());
check("journey graph deterministic", JSON.stringify(projectEventToGraphEdges(jGraphEvt())) === JSON.stringify(projectEventToGraphEdges(jGraphEvt())));

// ── Stage 4B · memory subscriber (pure) ─────────────────────────────────────
import { projectEventToMemory } from "./memory-subscriber";

const m1 = projectEventToMemory({ ...base, event_type: "deal.won", entity_type: "deal", entity_id: "D1" });
check("deal.won → memory milestone", m1 !== null && m1.impact === "positive" && m1.source_module === "kernel");
check("deal.lost → negative memory", projectEventToMemory({ ...base, event_type: "deal.lost", entity_type: "deal" })?.impact === "negative");
check("property.sold → memory", projectEventToMemory({ ...base, event_type: "property.sold", entity_type: "property" })?.title === "נכס נמכר");
check("routine buyer.updated → no memory", projectEventToMemory({ ...base, event_type: "buyer.updated", entity_type: "buyer" }) === null);
check("memory carries entity + occurred", m1?.entity_id === "D1" && m1?.occurred_at === base.occurred_at);

// ── Batch 5.2 · journey subscriber (pure, canonical stages) ─────────────────
// Smoke-level only — the full 66-check journey suite is src/lib/kernel/journey-qa.ts.
import { projectEventToJourney, isJourneyEvent } from "./journey-subscriber";

const jIntents = (e: DomainEventLike) => { const p = projectEventToJourney(e); return p.kind === "intents" ? p.intents : []; };
const jSkip = (e: DomainEventLike) => { const p = projectEventToJourney(e); return p.kind === "skip" ? p.reason : null; };

check("journey: lead.created → lead journey at canonical `new`", (() => { const i = jIntents(base)[0]; return i?.journeyType === "lead" && i.targetStage === "new" && i.createOnly; })());
check("journey: deal.created fans out to the buyer at `deal`", jIntents({ ...base, event_type: "deal.created", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1" } }).some((i) => i.journeyType === "buyer" && i.targetStage === "deal"));
check("journey: deal.won → canonical `won`", jIntents({ ...base, event_type: "deal.won", entity_type: "deal", entity_id: "D1", payload: {} }).some((i) => i.journeyType === "deal" && i.targetStage === "won"));
check("journey: deal.lost does NOT lose the buyer", jIntents({ ...base, event_type: "deal.lost", entity_type: "deal", entity_id: "D1", payload: { buyerId: "B1" } }).every((i) => i.journeyType === "deal"));
check("journey: RECURSION — journey.* is skipped", jSkip({ ...base, event_type: "journey.stage_changed", entity_type: "journey", entity_id: "J1" }) === "journey_event_no_recurse");
check("journey: isJourneyEvent guard", isJourneyEvent("journey.created") && !isJourneyEvent("lead.created"));
check("journey: no stage evidence → honest skip", jSkip({ ...base, event_type: "buyer.updated", entity_type: "buyer", entity_id: "B1", payload: {} }) === "no_stage_evidence");
check("journey: unsupported event → honest skip", jSkip({ ...base, event_type: "property.price_changed", entity_type: "property" }) === "unsupported_event");

// ── Batch 5.6A · THE JOURNEY TIMELINE FACT (anchor + echo suppression) ──────
// Every check below is a rule the live database broke before 5.6A: the lifecycle
// fact was anchored on the journey (invisible to brokers) AND duplicated by the
// stage command that caused it.
{
  const jEvt = (over: Partial<DomainEventLike> = {}): DomainEventLike => ({
    ...base,
    event_type: "journey.stage_changed",
    entity_type: "journey",
    entity_id: "J1",
    payload: { journeyType: "buyer", subjectType: "buyer", subjectId: "B1", fromStage: "new", toStage: "qualification", reason: "x" },
    metadata: { sourceEventType: "property.published" },
    ...over,
  });

  // 1. The fact lands on the SUBJECT's timeline — the one a broker actually opens.
  const rows = projectEventToTimeline(jEvt());
  check("5.6A: journey fact is anchored on the SUBJECT, not the journey",
    rows.length === 1 && rows[0].entity_type === "buyer" && rows[0].entity_id === "B1");

  // 2. …and still points at the spine it came from.
  check("5.6A: the row links back to the journey",
    rows[0]?.related_entity_type === "journey" && rows[0]?.related_entity_id === "J1");

  // 3. No journey-anchored row is written any more (that was the invisible one).
  check("5.6A: no journey-anchored timeline row",
    !projectEventToTimeline(jEvt()).some((r) => r.entity_type === "journey"));

  // 4. THE DUPLICATE: a transition caused by a stage COMMAND is suppressed — the
  //    command already wrote that exact fact on that exact timeline.
  check("5.6A: echo of buyer.stage_changed is suppressed",
    projectEventToTimeline(jEvt({ metadata: { sourceEventType: "buyer.stage_changed" } })).length === 0);
  check("5.6A: echo of property.stage_changed is suppressed",
    projectEventToTimeline(jEvt({ metadata: { sourceEventType: "property.stage_changed" } })).length === 0);

  // 5. …but a transition driven by EVIDENCE is a real, separate fact and is kept.
  //    "the listing was published" and "the journey moved to active" are two sentences.
  check("5.6A: evidence-driven transition (property.published) is KEPT",
    projectEventToTimeline(jEvt({ metadata: { sourceEventType: "property.published" } })).length === 1);
  check("5.6A: meeting-driven transition is KEPT",
    projectEventToTimeline(jEvt({ metadata: { sourceEventType: "meeting.completed" } })).length === 1);

  // 6. journey.created is never an echo — a journey opening has no command twin.
  check("5.6A: journey.created is always kept",
    projectEventToTimeline(jEvt({ event_type: "journey.created", metadata: { sourceEventType: "buyer.stage_changed" } })).length === 1);

  // 7. NEVER LOSE A FACT: no subject in the payload ⇒ keep the old anchor rather
  //    than drop the row. An ugly row beats a lost one.
  const noSubject = projectEventToTimeline(jEvt({ payload: { fromStage: "new", toStage: "qualification" } }));
  check("5.6A: missing subject ⇒ fact kept on the journey anchor (never dropped)",
    noSubject.length === 1 && noSubject[0].entity_type === "journey");

  // 8. Non-journey events are untouched by all of this.
  const plain = projectEventToTimeline({ ...base, event_type: "buyer.stage_changed", entity_type: "buyer", entity_id: "B1", payload: { stage: "qualification" } });
  check("5.6A: entity events keep their own anchor and are not suppressed",
    plain.length >= 1 && plain[0].entity_type === "buyer");
}

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
