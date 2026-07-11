// ============================================================================
// 🧪 ZONO OS 2.0 — STAGE 5 · Batch 5.1 · Canonical Journey · offline QA.
// No DB, no network. Run: npx tsx src/lib/journey-canonical/qa.ts
// ============================================================================
import {
  JOURNEY_TYPES, MACHINES, isValidStage, ladder, machineFor,
  stageDef, stageLabel, stageProgress,
} from "./machines";
import {
  buildTransition, isNoop, statusForKind, timestampFieldForKind, validateTransition,
} from "./transitions";
import {
  JOURNEY_DEPRECATION_REGISTRY, LEGACY_PROPERTY_STAGE_MAP, journeyRegistryCounts,
  legacyMapsAreSound, mapLegacyStage, resolveLegacyPropertyClosed,
} from "./legacy-map";
import type { JourneyType } from "./types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

// ── 1. machine integrity (every type) ───────────────────────────────────────
for (const t of JOURNEY_TYPES) {
  const mach = machineFor(t);
  check(`${t}: machine exists`, !!mach);
  check(`${t}: journeyType matches key`, mach.journeyType === t);
  check(`${t}: initial stage is a real stage`, isValidStage(t, mach.initial));
  check(`${t}: initial stage is open`, stageDef(t, mach.initial)!.kind === "open");
  check(`${t}: stage keys are unique`, new Set(mach.stages.map((s) => s.key)).size === mach.stages.length);
  check(`${t}: positions are unique`, new Set(mach.stages.map((s) => s.position)).size === mach.stages.length);
  check(`${t}: terminal flag agrees with kind`, mach.stages.every((s) => s.terminal === (s.kind !== "open")));
  check(`${t}: has at least one won stage`, mach.stages.some((s) => s.kind === "won"));
  // Every journey must be closable negatively — but not always via `lost`:
  // a PROPERTY is never "lost", it is archived. So the invariant is a negative
  // terminal of SOME kind, never specifically a `lost` key.
  check(`${t}: has a negative terminal`, mach.stages.some((s) => s.terminal && s.kind !== "won"));
  check(`${t}: at most one lost stage`, mach.stages.filter((s) => s.kind === "lost").length <= 1);
  check(`${t}: ladder is non-empty`, ladder(t).length > 0);
  check(`${t}: labels are non-empty`, mach.stages.every((s) => s.label.trim().length > 0));
}

// ── 2. exact canonical vocabularies ─────────────────────────────────────────
const keys = (t: JourneyType) => MACHINES[t].stages.map((s) => s.key).join(",");
check("buyer vocabulary", keys("buyer") === "new,qualification,financing,matching,properties_sent,viewing_scheduled,viewing_completed,negotiation,deal,won,inactive,lost");
check("seller vocabulary", keys("seller") === "new,qualification,valuation,pricing,representation,preparation,marketing,viewings,offers,negotiation,deal,won,churn_risk,inactive,lost");
check("lead vocabulary", keys("lead") === "new,contacted,qualified,nurturing,matched,meeting_scheduled,converted,lost");
check("property vocabulary", keys("property") === "draft,preparation,ready_to_publish,active,marketing,viewings,offers,negotiation,under_contract,sold,rented,paused,archived");
check("deal vocabulary", keys("deal") === "initiated,qualification,offer,negotiation,financing,legal,signing,closing,won,lost");
check("property has two won stages (sold+rented)", MACHINES.property.stages.filter((s) => s.kind === "won").length === 2);
check("property has NO lost stage (it archives instead)", !MACHINES.property.stages.some((s) => s.kind === "lost"));
check("property archived is the negative terminal", stageDef("property", "archived")!.kind === "inactive");
check("buyer/seller/lead/deal each have a lost stage", (["buyer", "seller", "lead", "deal"] as JourneyType[]).every((t) => !!stageDef(t, "lost")));
check("seller churn_risk is lateral + open", stageDef("seller", "churn_risk")!.lateral === true && stageDef("seller", "churn_risk")!.kind === "open");
check("lead converted is the won stage", stageDef("lead", "converted")!.kind === "won");
check("stageLabel returns Hebrew", stageLabel("buyer", "negotiation") === "משא ומתן");
check("stageLabel falls back to key", stageLabel("buyer", "nope") === "nope");

// ── 3. status + timestamp derivation ────────────────────────────────────────
check("won → status won", statusForKind("won") === "won");
check("lost → status lost", statusForKind("lost") === "lost");
check("open → status active", statusForKind("open") === "active");
check("paused → status paused", statusForKind("paused") === "paused");
check("inactive → status inactive", statusForKind("inactive") === "inactive");
check("won stamps completed_at", timestampFieldForKind("won") === "completed_at");
check("lost stamps lost_at", timestampFieldForKind("lost") === "lost_at");
check("paused stamps paused_at", timestampFieldForKind("paused") === "paused_at");
check("inactive stamps paused_at", timestampFieldForKind("inactive") === "paused_at");
check("open stamps nothing", timestampFieldForKind("open") === null);

// ── 4. progress ─────────────────────────────────────────────────────────────
check("won = 100%", stageProgress("buyer", "won") === 100);
check("sold = 100%", stageProgress("property", "sold") === 100);
check("rented = 100%", stageProgress("property", "rented") === 100);
check("lost = 0%", stageProgress("buyer", "lost") === 0);
check("inactive = 0%", stageProgress("buyer", "inactive") === 0);
check("first rung > 0%", stageProgress("buyer", "new") > 0);
check("progress increases along the ladder", stageProgress("buyer", "negotiation") > stageProgress("buyer", "qualification"));
check("last open rung = 100%", stageProgress("buyer", "deal") === 100);
check("unknown stage = 0%", stageProgress("buyer", "nope") === 0);

// ── 5. transitions ──────────────────────────────────────────────────────────
check("open journey (from null) is valid", validateTransition("buyer", null, "new").ok);
check("advance is detected", validateTransition("buyer", "new", "qualification").kind === "advance");
check("skipping rungs is allowed (non-linear reality)", validateTransition("buyer", "new", "negotiation").ok);
check("regress is detected", validateTransition("buyer", "negotiation", "qualification").kind === "regress");
check("close is detected", validateTransition("buyer", "deal", "won").kind === "close");
check("same stage is a noop", validateTransition("buyer", "deal", "deal").kind === "noop");
check("same stage is rejected", !validateTransition("buyer", "deal", "deal").ok);
check("unknown target rejected", !validateTransition("buyer", "new", "banana").ok);
check("unknown source rejected", !validateTransition("buyer", "banana", "new").ok);
check("a WON journey is final", !validateTransition("buyer", "won", "negotiation").ok);
check("won-is-final reason", validateTransition("buyer", "won", "negotiation").reason === "journey_won_is_final");
check("lost can reopen", validateTransition("buyer", "lost", "qualification").kind === "reopen");
check("inactive can reopen", validateTransition("buyer", "inactive", "new").kind === "reopen");
check("paused property can reopen", validateTransition("property", "paused", "marketing").kind === "reopen");
check("lost → won directly is a close", validateTransition("buyer", "lost", "won").kind === "close");
check("entering churn_risk is never an advance", validateTransition("seller", "marketing", "churn_risk").kind === "regress");
check("recovering from churn_risk advances", validateTransition("seller", "churn_risk", "offers").kind === "advance");
check("churn_risk → lost closes", validateTransition("seller", "churn_risk", "lost").kind === "close");
check("property under_contract → sold advances", validateTransition("property", "under_contract", "sold").kind === "close");
check("deal signing → won closes", validateTransition("deal", "signing", "won").kind === "close");

// ── 6. buildTransition (the row the 5.2 subscriber persists) ────────────────
const won = buildTransition("buyer", "deal", "won", { reason: "deal.won", evidence: { dealId: "D1" } });
check("buildTransition returns a row", won !== null);
check("row: toStage", won!.toStage === "won");
check("row: fromStage", won!.fromStage === "deal");
check("row: status won", won!.status === "won");
check("row: stamps completed_at", won!.timestampField === "completed_at");
check("row: keeps caller reason", won!.reason === "deal.won");
check("row: keeps evidence", (won!.evidence as { dealId: string }).dealId === "D1");
check("row: kind close", won!.kind === "close");

const opened = buildTransition("lead", null, "new");
check("opening: fromStage is null", opened!.fromStage === null);
check("opening: status active", opened!.status === "active");
check("opening: default reason", opened!.reason === "journey_opened");
check("opening: no timestamp", opened!.timestampField === null);

check("buildTransition returns null on noop", buildTransition("buyer", "deal", "deal") === null);
check("buildTransition returns null on invalid", buildTransition("buyer", "won", "new") === null);
check("buildTransition returns null on unknown stage", buildTransition("buyer", "new", "banana") === null);
check("isNoop true for same stage", isNoop("buyer", "new", "new"));
check("isNoop false for a real move", !isNoop("buyer", "new", "qualification"));

// IDEMPOTENCY (the property that makes replay safe): re-applying the SAME
// transition after it landed is a noop, so a redelivered domain event cannot
// append a second history row even before the DB unique index intervenes.
const first = buildTransition("buyer", "new", "qualification", { evidence: { eventId: "E1" } });
const replay = buildTransition("buyer", first!.toStage, "qualification", { evidence: { eventId: "E1" } });
check("replaying a landed transition is a noop", first !== null && replay === null);

// ── 7. legacy maps (Batch 5.3 backfill inputs) ──────────────────────────────
check("every legacy mapping lands on a real canonical stage", legacyMapsAreSound());
check("legacy property enum fully covered (8 values)", Object.keys(LEGACY_PROPERTY_STAGE_MAP).length === 8);
check("legacy new → draft", mapLegacyStage("property", "new")!.canonical === "draft");
check("legacy active_marketing → marketing", mapLegacyStage("property", "active_marketing")!.canonical === "marketing");
check("legacy deal_signed → under_contract (never backwards)", mapLegacyStage("property", "deal_signed")!.canonical === "under_contract");
check("legacy deal_signed is flagged as a machine extension", !!mapLegacyStage("property", "deal_signed")!.note);
check("legacy closed is flagged ambiguous", mapLegacyStage("property", "closed")!.ambiguous === true);
check("closed resolves sold", resolveLegacyPropertyClosed("sold") === "sold");
check("closed resolves rented", resolveLegacyPropertyClosed("rented") === "rented");
check("closed resolves Hebrew נמכר", resolveLegacyPropertyClosed("נמכר") === "sold");
check("closed defaults to archived", resolveLegacyPropertyClosed(null) === "archived");
check("legacy buyer completed → won", mapLegacyStage("buyer", "completed")!.canonical === "won");
check("legacy buyer dropped → lost", mapLegacyStage("buyer", "dropped")!.canonical === "lost");
check("legacy buyer budget_validation is approximate", mapLegacyStage("buyer", "budget_validation")!.approximate === true);
check("legacy seller potential → new", mapLegacyStage("seller", "potential")!.canonical === "new");
check("legacy seller exclusive_discussion → representation", mapLegacyStage("seller", "exclusive_discussion")!.canonical === "representation");
check("unknown legacy key → null (never invented)", mapLegacyStage("buyer", "banana") === null);
check("no legacy map for deal (deal_journeys is empty)", mapLegacyStage("deal", "initiated") === null);

// the live property rows only use these two stages — both must map cleanly
check("live property stage 'new' maps", mapLegacyStage("property", "new") !== null);
check("live property stage 'active_marketing' maps", mapLegacyStage("property", "active_marketing") !== null);

// ── 8. deprecation registry (one Journey system, enforced over time) ────────
check("registry is populated", JOURNEY_DEPRECATION_REGISTRY.length === 6);
check("every registry entry names a retirement batch", JOURNEY_DEPRECATION_REGISTRY.every((r) => r.retiredIn.length > 0));
check("property_journeys registered as compat input with 10 real rows", JOURNEY_DEPRECATION_REGISTRY.some((r) => r.id === "property_journeys" && r.liveRows === 10 && r.status === "compat_input"));
check("journey_stages registered with 31 real rows", JOURNEY_DEPRECATION_REGISTRY.some((r) => r.id === "journey_stages" && r.liveRows === 31));
check("deal_journeys registered as empty", JOURNEY_DEPRECATION_REGISTRY.some((r) => r.id === "deal_journeys" && r.liveRows === 0));
check("the legacy advanceStage service is registered for migration", JOURNEY_DEPRECATION_REGISTRY.some((r) => r.kind === "service" && r.status === "active_pending_migration"));
const counts = journeyRegistryCounts();
check("registry counts sum to the registry size", counts.superseded + counts.compat_input + counts.active_pending_migration === JOURNEY_DEPRECATION_REGISTRY.length);

// ── result ──────────────────────────────────────────────────────────────────
console.log(`\njourney-canonical QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
