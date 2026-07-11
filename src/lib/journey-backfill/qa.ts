// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.3 · Backfill + compat-adapter QA (offline).
// Run: npx tsx src/lib/journey-backfill/qa.ts
//
// Covers the 13 scenarios Batch 5.3 must prove, using the PURE layer only —
// so every safety invariant is testable without a database.
// ============================================================================
import {
  LEGACY_LEAD_STAGE_MAP, LEGACY_PROPERTY_STATUS_MAP,
  compatOpenStage, isBackfillable, isValidStage, machineFor, mostAdvancedStage,
  resolveLegacyStage, stagePosition, type JourneyType, type ResolvedStage,
} from "@/lib/journey-canonical";
import { planBackfill, summarize, type BackfillCandidate, type ExistingJourney } from "./plan";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};
const section = (t: string) => console.log(`\n── ${t} ──`);

const cand = (o: Partial<BackfillCandidate> = {}): BackfillCandidate => ({
  orgId: "ORG1",
  journeyType: "property",
  entityType: "property",
  entityId: "P1",
  sourceTable: "property_journeys",
  sourceRowId: "PJ1",
  legacyStage: null,
  entityStage: null,
  legacyUpdatedAt: "2026-06-18T00:00:00Z",
  entityUpdatedAt: "2026-07-10T00:00:00Z",
  startedAt: "2026-06-18T00:00:00Z",
  ownerUserId: "U1",
  ...o,
});
const journey = (o: Partial<ExistingJourney> = {}): ExistingJourney =>
  ({ id: "J1", currentStage: "draft", status: "active", source: "legacy_backfill", ...o });

// ── 1. RESOLVER: every live vocabulary maps ─────────────────────────────────
section("1. Resolver — the five live vocabularies");
const propEnum = resolveLegacyStage("property", "journey_stage_enum", "active_marketing");
check("journey_stage enum 'active_marketing' → marketing (exact)", propEnum.canonical === "marketing" && propEnum.quality === "exact");
check("journey_stage enum 'new' → draft", resolveLegacyStage("property", "journey_stage_enum", "new").canonical === "draft");
const closed = resolveLegacyStage("property", "journey_stage_enum", "closed");
check("legacy property 'closed' stays AMBIGUOUS (sold vs rented vs archived) — never guessed", closed.quality === "ambiguous");
check("ambiguous is not backfillable", !isBackfillable(closed));

const st = resolveLegacyStage("property", "properties_status", "published");
check("properties.status 'published' → active (exact)", st.canonical === "active" && st.quality === "exact");
check("properties.status 'active' → active (exact)", resolveLegacyStage("property", "properties_status", "active").canonical === "active");
check("properties.status 'sold' → sold (terminal)", resolveLegacyStage("property", "properties_status", "sold").quality === "terminal");
check("every properties.status value lands on a real canonical stage",
  Object.values(LEGACY_PROPERTY_STATUS_MAP).every((m) => isValidStage("property", m.canonical)));
check("unknown properties.status → unmappable, never guessed",
  resolveLegacyStage("property", "properties_status", "banana").quality === "unmappable");

check("seller 'potential' → new (approximate) — never written raw",
  resolveLegacyStage("seller", "journey_stages_seller", "potential").canonical === "new");
check("buyer 'budget_validation' → financing", resolveLegacyStage("buyer", "journey_stages_buyer", "budget_validation").canonical === "financing");
check("deal 'contacted' → qualification (the 5.2 live vocabulary)", resolveLegacyStage("deal", "deal_stage", "contacted").canonical === "qualification");

check("leads.stage 'nurturing' → nurturing (exact)", resolveLegacyStage("lead", "leads_stage", "nurturing").canonical === "nurturing");
check("leads.stage 'disqualified' is UNMAPPABLE — not collapsed into 'lost'",
  resolveLegacyStage("lead", "leads_stage", "disqualified").quality === "unmappable");
check("LEGACY_LEAD_STAGE_MAP documents why disqualified is unmappable", !!LEGACY_LEAD_STAGE_MAP.disqualified.note);
check("an already-canonical value resolves without a map",
  resolveLegacyStage("buyer", "journey_stages_buyer", "financing").canonical === "financing");

// ── 2. NEVER BACKWARD ───────────────────────────────────────────────────────
section("2. mostAdvancedStage — never move a journey backward");
check("draft vs active → active", mostAdvancedStage("property", "draft", "active") === "active");
check("marketing vs active → marketing", mostAdvancedStage("property", "marketing", "active") === "marketing");
check("order does not matter", mostAdvancedStage("property", "active", "draft") === "active");
check("null is ignored", mostAdvancedStage("property", null, "active") === "active");
check("positions are the machine's own", stagePosition("property", "draft") < stagePosition("property", "active"));

// ── 3. COMPAT ADAPTER — the second-writer fix ───────────────────────────────
section("3. compatOpenStage — a seller can never open at 'potential' again");
const sellerOpen = compatOpenStage("seller");
check("seller with no requested stage opens at the machine's initial stage", sellerOpen.stage === machineFor("seller").initial);
check("that stage is 'new', NOT 'potential'", sellerOpen.stage === "new");
check("the raw legacy 'potential' is never returned as a stage", sellerOpen.stage !== "potential");
const sellerLegacy = compatOpenStage("seller", "potential");
check("an explicit 'potential' request is MAPPED, not written raw", sellerLegacy.stage === "new");
check("buyer default opens at 'new'", compatOpenStage("buyer").stage === "new");
check("lead default opens at 'new'", compatOpenStage("lead").stage === "new");
check("deal default opens at 'initiated'", compatOpenStage("deal").stage === "initiated");
check("property default opens at 'draft'", compatOpenStage("property").stage === "draft");
const bogus = compatOpenStage("seller", "banana");
check("an unmappable request returns NULL + a diagnostic — never a bad row", bogus.stage === null && !!bogus.resolved);
check("every journey type opens at a stage its own machine accepts",
  (["buyer", "seller", "lead", "property", "deal"] as JourneyType[]).every((t) => {
    const o = compatOpenStage(t);
    return o.stage !== null && isValidStage(t, o.stage);
  }));

// ── 4. PLANNER — create ─────────────────────────────────────────────────────
section("4. Planner — create");
const legacyNew: ResolvedStage = resolveLegacyStage("property", "journey_stage_enum", "new");
const statusPublished: ResolvedStage = resolveLegacyStage("property", "properties_status", "published");

const d1 = planBackfill(cand({ legacyStage: legacyNew, entityStage: statusPublished }), null);
check("no canonical journey → create", d1.action.kind === "create");
check("…opened at 'active', NOT the stale legacy 'draft' (two truths, took the newer)",
  d1.action.kind === "create" && d1.action.stage === "active");
check("…and both evidences are preserved verbatim",
  !!(d1.evidence.legacyStage && d1.evidence.entityStage && d1.evidence.sourceRowId));
check("…with a stated reason for the choice", typeof d1.evidence.chosenBecause === "string");

const d2 = planBackfill(cand({ legacyStage: resolveLegacyStage("property", "journey_stage_enum", "active_marketing"), entityStage: statusPublished }), null);
check("legacy 'active_marketing' (marketing) beats status 'published' (active) — more advanced wins",
  d2.action.kind === "create" && d2.action.stage === "marketing");

// ── 5. PLANNER — the kernel always wins ─────────────────────────────────────
section("5. Planner — event-driven journeys are newer truth");
const d3 = planBackfill(cand({ legacyStage: legacyNew, entityStage: statusPublished }), journey({ source: "event", currentStage: "negotiation" }));
check("a kernel journey is left UNCHANGED by the backfill", d3.action.kind === "unchanged");
check("…and the reason says so", d3.action.kind === "unchanged" && d3.action.reason.includes("event-driven"));

const d4 = planBackfill(cand({ legacyStage: legacyNew, entityStage: statusPublished }), journey({ source: "event", currentStage: "draft" }));
check("even a kernel journey BEHIND the legacy evidence is not touched", d4.action.kind === "unchanged");

// ── 6. PLANNER — no regression ──────────────────────────────────────────────
section("6. Planner — no regression, ever");
const d5 = planBackfill(cand({ legacyStage: legacyNew }), journey({ currentStage: "negotiation", source: "legacy_backfill" }));
check("legacy 'draft' cannot regress a journey at 'negotiation'", d5.action.kind === "unchanged");
const d6 = planBackfill(cand({ legacyStage: resolveLegacyStage("property", "journey_stage_enum", "negotiation") }), journey({ currentStage: "draft" }));
check("legacy 'negotiation' DOES advance a journey at 'draft'", d6.action.kind === "advance");
check("…recording from and to", d6.action.kind === "advance" && d6.action.from === "draft" && d6.action.to === "negotiation");

// ── 7. PLANNER — idempotent re-run ──────────────────────────────────────────
section("7. Planner — re-run is a no-op");
const already = planBackfill(cand({ legacyStage: legacyNew, entityStage: statusPublished }), journey({ currentStage: "active" }));
check("second run of an already-backfilled row → unchanged", already.action.kind === "unchanged");
check("…so a re-run creates zero journeys and zero events", summarize([already]).created === 0 && summarize([already]).advanced === 0);

// ── 8. PLANNER — conflicts are reported, never guessed ──────────────────────
section("8. Planner — conflicts");
const amb = planBackfill(cand({ legacyStage: resolveLegacyStage("property", "journey_stage_enum", "closed") }), null);
check("ambiguous legacy 'closed' → conflict, no journey written", amb.action.kind === "conflict");
check("…with the reason 'ambiguous_stage'", amb.action.kind === "conflict" && amb.action.reason === "ambiguous_stage");

const unm = planBackfill(cand({ journeyType: "lead", entityType: "lead", entityId: "L1", legacyStage: resolveLegacyStage("lead", "leads_stage", "disqualified") }), null);
check("unmappable 'disqualified' → conflict, never collapsed into 'lost'", unm.action.kind === "conflict");

const miss = planBackfill(cand({ anomaly: "missing_entity" }), null);
check("missing entity → conflict, never a dangling journey", miss.action.kind === "conflict" && miss.action.reason === "missing_entity");

const xorg = planBackfill(cand({ anomaly: "cross_org" }), null);
check("cross-org row → conflict, BLOCKED", xorg.action.kind === "conflict" && xorg.action.reason === "cross_org");
check("a cross-org row never produces a create/advance", xorg.action.kind !== "create" && xorg.action.kind !== "advance");

const none = planBackfill(cand({ legacyStage: null, entityStage: null }), null);
check("no evidence at all → skip (no fabricated stage)", none.action.kind === "skip");

// ── 9. DEAL IDENTITY ────────────────────────────────────────────────────────
section("9. Deal dual identity");
const dealCand = cand({
  journeyType: "deal", entityType: "deal",
  entityId: "DEAL-CANONICAL",            // resolved from deal_profiles.deal_id
  sourceTable: "deal_journeys", sourceRowId: "DJ1",
  legacyStage: resolveLegacyStage("deal", "deal_stage", "negotiation"),
});
const d7 = planBackfill(dealCand, null);
check("a deal journey is keyed on the CANONICAL deals.id", d7.candidate.entityId === "DEAL-CANONICAL");
check("…never on a deal_profiles id", !d7.candidate.entityId.startsWith("PROFILE"));
check("…and opens at the mapped canonical stage", d7.action.kind === "create" && d7.action.stage === "negotiation");

// ── 10. TOTALS ──────────────────────────────────────────────────────────────
section("10. Summary");
const all = [d1, d2, d3, d5, d6, amb, unm, miss, xorg, none];
const t = summarize(all);
check("totals add up to the candidate count", t.created + t.advanced + t.unchanged + t.skipped + t.conflicts === all.length);
check("conflicts are counted separately from skips", t.conflicts === 4 && t.skipped === 1);

console.log(`\njourney backfill (5.3) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
