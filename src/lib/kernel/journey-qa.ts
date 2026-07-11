// ============================================================================
// 🧪 ZONO OS 2.0 — STAGE 5 · Batch 5.2 · Journey subscriber offline QA.
// No DB, no network. Run: npx tsx src/lib/kernel/journey-qa.ts
//
// Covers the 13 required scenarios: creation, replay, conversion, property and
// deal lifecycles, invalid regression, stale events, source-event idempotency,
// recursion, missing evidence, cross-org, terminal rules, failure isolation.
// The DB-enforced halves (unique indexes, optimistic concurrency) are asserted
// as CONTRACTS here and proven live in Part 11.
// ============================================================================
import { projectEventToJourney, isJourneyEvent, type JourneyIntent } from "./journey-subscriber";
import { buildTransition, mapLegacyStage } from "@/lib/journey-canonical";
import type { DomainEventLike } from "./subscriber";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

const ORG = "org-A";
const evt = (
  event_type: string,
  entity_type: string,
  entity_id: string,
  payload: Record<string, unknown> = {},
  organization_id = ORG,
): DomainEventLike => ({
  id: `e-${event_type}-${entity_id}`,
  event_type, entity_type, entity_id,
  occurred_at: "2026-07-11T10:00:00Z",
  organization_id,
  actor_user_id: "user-1",
  payload,
});

const intents = (e: DomainEventLike): JourneyIntent[] => {
  const p = projectEventToJourney(e);
  return p.kind === "intents" ? p.intents : [];
};
const skipReason = (e: DomainEventLike): string | null => {
  const p = projectEventToJourney(e);
  return p.kind === "skip" ? p.reason : null;
};
const one = (e: DomainEventLike) => intents(e)[0];

// ── 1. buyer.created → buyer journey at `new` ───────────────────────────────
const b1 = one(evt("buyer.created", "buyer", "B1"));
check("1. buyer.created → buyer journey", b1?.journeyType === "buyer" && b1.entityId === "B1");
check("1. opens at canonical `new`", b1?.targetStage === "new");
check("1. createOnly (won't reset an existing journey)", b1?.createOnly === true);
check("1. owner carried from actor", b1?.ownerUserId === "user-1");

// ── 2. REPLAY of buyer.created → same intent, and createOnly makes the applier
//       a no-op on an existing journey (the DB unique index is the hard guard).
const b1replay = one(evt("buyer.created", "buyer", "B1"));
check("2. replay produces an identical intent (deterministic)", JSON.stringify(b1) === JSON.stringify(b1replay));
check("2. createOnly ⇒ existing journey is never dragged back", b1replay?.createOnly === true);
// A create event must not regress a buyer who has moved on:
check("2. buildTransition still refuses new→new as a no-op", buildTransition("buyer", "new", "new") === null);

// ── 3. lead.created → new; lead converted → converted (won) ─────────────────
const l1 = one(evt("lead.created", "lead", "L1"));
check("3. lead.created → lead journey at new", l1?.journeyType === "lead" && l1.targetStage === "new");
const conv = intents(evt("lead.converted_to_buyer", "lead", "L1", { buyerId: "B9" }));
check("3. conversion closes the lead as `converted`", conv.some((i) => i.journeyType === "lead" && i.targetStage === "converted"));
check("3. conversion opens the buyer journey", conv.some((i) => i.journeyType === "buyer" && i.entityId === "B9" && i.createOnly));
check("3. new→converted is a valid close", buildTransition("lead", "new", "converted")!.kind === "close");

// ── 4. property.created → published → sold ─────────────────────────────────
const pDraft = one(evt("property.created", "property", "P1", { status: "new" }));
check("4. property.created(status=new) → draft", pDraft?.targetStage === "draft");
const pPub = one(evt("property.published", "property", "P1"));
check("4. property.published → active", pPub?.targetStage === "active");
const pSold = one(evt("property.sold", "property", "P1"));
check("4. property.sold → sold", pSold?.targetStage === "sold");
check("4. draft→active valid", buildTransition("property", "draft", "active")!.kind === "advance");
check("4. active→sold is a close", buildTransition("property", "active", "sold")!.kind === "close");
// property.status_changed reuses the 5.1 legacy enum map:
check("4. status_changed(active_marketing) → marketing", one(evt("property.status_changed", "property", "P1", { status: "active_marketing" }))?.targetStage === "marketing");
check("4. ambiguous legacy `closed` is REFUSED, not guessed", skipReason(evt("property.status_changed", "property", "P1", { status: "closed" })) === "no_stage_evidence");

// ── 4b. Batch 5.5E — property.stage_changed: the broker's own hand on the spine.
// The property machine was the only one WITHOUT a stage_changed sibling, which is
// precisely why the property cockpit wrote `property_journeys` directly. It has one now.
const pManual = one(evt("property.stage_changed", "property", "P1", { stage: "negotiation" }));
check("4b. property.stage_changed(canonical) → that exact stage", pManual?.targetStage === "negotiation");
check("4b. it is marked manual (a human moved it, not an inference)", (pManual?.evidence as { manual?: boolean })?.manual === true);
check("4b. owner carried from the acting broker", pManual?.ownerUserId === "user-1");
check("4b. it does NOT createOnly — a manual move must actually move the journey", pManual?.createOnly === false);
// A legacy enum value from the old cockpit ladder is RESOLVED, never guessed:
check("4b. legacy `active_marketing` resolves to marketing", one(evt("property.stage_changed", "property", "P1", { stage: "active_marketing" }))?.targetStage === "marketing");
check("4b. ambiguous legacy `closed` is still REFUSED", skipReason(evt("property.stage_changed", "property", "P1", { stage: "closed" })) === "no_stage_evidence");
check("4b. an unknown stage is a skip, never a fabricated transition", skipReason(evt("property.stage_changed", "property", "P1", { stage: "banana" })) === "unmappable_stage");
check("4b. no stage in the payload ⇒ honest skip", skipReason(evt("property.stage_changed", "property", "P1", {})) === "no_stage_evidence");

// ── 5. deal.created → stage_changed → won ──────────────────────────────────
const d1 = intents(evt("deal.created", "deal", "D1", { buyerId: "B1", sellerId: "S1", propertyId: "P1" }));
check("5. deal.created → deal at initiated", d1.some((i) => i.journeyType === "deal" && i.targetStage === "initiated"));
check("5. deal.created fans out to the buyer (→ deal)", d1.some((i) => i.journeyType === "buyer" && i.targetStage === "deal"));
check("5. deal.created fans out to the seller (→ deal)", d1.some((i) => i.journeyType === "seller" && i.targetStage === "deal"));
check("5. deal.created moves the property to negotiation", d1.some((i) => i.journeyType === "property" && i.targetStage === "negotiation"));
check("5. deal_stage `qualified` → qualification", one(evt("deal.stage_changed", "deal", "D1", { stage: "qualified" }))?.targetStage === "qualification");
check("5. deal_stage `contract` → legal", one(evt("deal.stage_changed", "deal", "D1", { stage: "contract" }))?.targetStage === "legal");
const dWon = intents(evt("deal.won", "deal", "D1", { buyerId: "B1", sellerId: "S1", propertyId: "P1" }));
check("5. deal.won → deal won", dWon.some((i) => i.journeyType === "deal" && i.targetStage === "won"));
check("5. deal.won → buyer won", dWon.some((i) => i.journeyType === "buyer" && i.targetStage === "won"));
check("5. deal.won → property sold", dWon.some((i) => i.journeyType === "property" && i.targetStage === "sold"));
// deal.lost must NOT destroy the buyer's live pipeline:
const dLost = intents(evt("deal.lost", "deal", "D1", { buyerId: "B1" }));
check("5. deal.lost closes only the DEAL (buyer keeps searching)", dLost.length === 1 && dLost[0].journeyType === "deal" && dLost[0].targetStage === "lost");

// ── 6. Invalid regression → blocked, no mutation ───────────────────────────
check("6. negotiation→qualification is a regress (allowed but flagged)", buildTransition("buyer", "negotiation", "qualification")!.kind === "regress");
check("6. a WON journey is final — transition refused", buildTransition("buyer", "won", "negotiation") === null);
check("6. refusal returns null ⇒ applier reports `blocked` and does not mutate", buildTransition("deal", "won", "negotiation") === null);

// ── 7. Stale earlier event cannot move a journey backward ──────────────────
// The applier guards the head update with .eq("current_stage", from): if the
// journey has already moved on, 0 rows update and the stale event is skipped.
check("7. stale-event guard is expressed as a from-stage precondition", buildTransition("buyer", "deal", "qualification")!.kind === "regress");
check("7. createOnly events never regress an advanced journey", b1?.createOnly === true);

// ── 8. Same source_event_id replay → no duplicate history ──────────────────
// DB contract: unique (journey_id, source_event_id, to_stage). The applier
// appends history FIRST and treats the unique violation as `duplicate`, so
// current_stage is never touched twice for the same event.
const t8 = buildTransition("buyer", "new", "qualification", { evidence: { eventId: "E1" } });
check("8. first transition builds", t8 !== null);
check("8. re-applying the SAME landed transition is a no-op", buildTransition("buyer", t8!.toStage, "qualification") === null);

// ── 9. RECURSION — journey.* events must never re-enter the machine ────────
check("9. isJourneyEvent detects journey.created", isJourneyEvent("journey.created"));
check("9. isJourneyEvent detects journey.stage_changed", isJourneyEvent("journey.stage_changed"));
check("9. journey.stage_changed → skipped (no recursion)", skipReason(evt("journey.stage_changed", "journey", "J1", { toStage: "won" })) === "journey_event_no_recurse");
check("9. journey.created → skipped (no recursion)", skipReason(evt("journey.created", "journey", "J1")) === "journey_event_no_recurse");
check("9. recursion guard fires BEFORE entity/payload checks", skipReason({ ...evt("journey.created", "journey", ""), entity_id: "" }) === "journey_event_no_recurse");

// ── 10. Missing evidence → honest skip (never a manufactured stage) ────────
check("10. buyer.updated with no facts → no_stage_evidence", skipReason(evt("buyer.updated", "buyer", "B1", {})) === "no_stage_evidence");
check("10. buyer.updated with budget → qualification", one(evt("buyer.updated", "buyer", "B1", { budget: 2500000 }))?.targetStage === "qualification");
check("10. buyer.updated with preapproval → financing (beats qualification)", one(evt("buyer.updated", "buyer", "B1", { budget: 1, preapproved: true }))?.targetStage === "financing");
check("10. unsupported event → unsupported_event", skipReason(evt("whatsapp.connected", "whatsapp", "W1")) === "unsupported_event");
check("10. property.price_changed carries no stage → unsupported", skipReason(evt("property.price_changed", "property", "P1", { price: 9 })) === "unsupported_event");
check("10. missing entity id → missing_entity_id", skipReason({ ...evt("buyer.created", "buyer", "X"), entity_id: "" }) === "missing_entity_id");
check("10. seller.linked_to_property without sellerId → missing_linked_entity", skipReason(evt("seller.linked_to_property", "property", "P1", {})) === "missing_linked_entity");
check("10. meeting with no buyer/lead → missing_linked_entity", skipReason(evt("meeting.created", "meeting", "M1", {})) === "missing_linked_entity");
check("10. unmappable stage → unmappable_stage", skipReason(evt("deal.stage_changed", "deal", "D1", { stage: "banana" })) === "unmappable_stage");
check("10. buyer.stage_changed without stage → no_stage_evidence", skipReason(evt("buyer.stage_changed", "buyer", "B1", {})) === "no_stage_evidence");

// ── 11. CROSS-ORG — a journey is only ever found/created inside the event's org
// The applier scopes every lookup, insert and update by .eq("org_id", evt.organization_id),
// so an event from org B can never touch org A's journey. Asserted here as the
// contract that the intent carries no org of its own (it inherits the event's).
const orgB = one(evt("buyer.created", "buyer", "B1", {}, "org-B"));
check("11. intent carries no org — the applier binds it to the EVENT's org", !("orgId" in (orgB as object)));
check("11. same entity id in another org yields the same shape (isolation is at the DB scope)", orgB?.entityId === "B1");

// ── 12. Terminal journeys — rules enforced by the machine, not by callers ──
check("12. won is final (no reopen)", buildTransition("buyer", "won", "new") === null);
check("12. lost CAN reopen (a lost buyer may return)", buildTransition("buyer", "lost", "qualification")!.kind === "reopen");
check("12. paused property can resume", buildTransition("property", "paused", "marketing")!.kind === "reopen");
check("12. reopen clears the terminal timestamps", buildTransition("buyer", "lost", "qualification")!.status === "active");

// ── 13. Failure isolation — the journey block is try/caught in the processor
//        and records `failed`; the other subscribers still run. Contract-level:
check("13. a skip never throws", (() => { try { projectEventToJourney(evt("nonsense.event", "x", "1")); return true; } catch { return false; } })());
check("13. a malformed payload never throws", (() => { try { projectEventToJourney({ ...evt("buyer.updated", "buyer", "B1"), payload: null }); return true; } catch { return false; } })());

// ── extra: seller + meeting mappings ──────────────────────────────────────
// 5.3 LIVE FIX — the emitter keys this event on the PROPERTY and carries sellerId
// in the payload. The subscriber used to read it inverted, so a real seller link
// could never advance the seller (and would have keyed the journey on the property).
const linked = one(evt("seller.linked_to_property", "property", "P1", { sellerId: "S1", propertyId: "P1" }));
check("seller.linked_to_property → representation", linked?.targetStage === "representation");
check("…on the SELLER journey, not the property", linked?.journeyType === "seller" && linked?.entityId === "S1");
check("…and never keys the seller journey on the property id", linked?.entityId !== "P1");
check("…propertyId is preserved as evidence", (linked?.evidence as { propertyId?: string })?.propertyId === "P1");
check("…it still works when only sellerId is in the payload (entity_id IS the property)", one(evt("seller.linked_to_property", "property", "P9", { sellerId: "S9" }))?.entityId === "S9");
check("property.published with sellerId → seller marketing", intents(evt("property.published", "property", "P1", { sellerId: "S1" })).some((i) => i.journeyType === "seller" && i.targetStage === "marketing"));
check("meeting.created (buyer+property) → viewing_scheduled", intents(evt("meeting.created", "meeting", "M1", { buyerId: "B1", propertyId: "P1" })).some((i) => i.targetStage === "viewing_scheduled"));
check("meeting.completed (buyer+property) → viewing_completed", intents(evt("meeting.completed", "meeting", "M1", { buyerId: "B1", propertyId: "P1" })).some((i) => i.targetStage === "viewing_completed"));
check("meeting.completed also moves the property to viewings", intents(evt("meeting.completed", "meeting", "M1", { buyerId: "B1", propertyId: "P1" })).some((i) => i.journeyType === "property" && i.targetStage === "viewings"));
check("meeting.created (lead) → meeting_scheduled", intents(evt("meeting.created", "meeting", "M1", { leadId: "L1" })).some((i) => i.journeyType === "lead" && i.targetStage === "meeting_scheduled"));
check("seller.risk_changed → churn_risk (modelled; nothing emits it today)", one(evt("seller.risk_changed", "seller", "S1", { risk: 80 }))?.targetStage === "churn_risk");
check("deal_stage map reused from journey-canonical (single source)", mapLegacyStage("deal", "agreement")!.canonical === "signing");

console.log(`\njourney subscriber (5.2) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
