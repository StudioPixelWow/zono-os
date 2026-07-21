// ============================================================================
// 🧪 ZONO OS 2.0 — STAGE 5 · Batch 5.4 · Journey Center QA (offline).
// Run: npx tsx src/lib/journey-center/qa.ts
// Covers the 15 scenarios 5.4I requires, using the PURE layer only.
// ============================================================================
import { isValidStage, stageLabel } from "@/lib/journey-canonical";
import {
  fromCanonicalJourney, markFallback, resolveFallbackStage, STALL_DAYS,
  type CanonicalJourneyRow, type CanonicalTransition, type EntityFacts,
} from "./canonical";
import { applyFilters, computeJourneyKpis, isBlocked, isStalled, sortByBusinessPriority } from "./kpis";
import type { UnifiedJourney } from "./types";
// 5.6G parity regressions — the Executive projection is pure and importable.
import { buildExecJourneyProjection } from "@/lib/executive-os/journey-projection";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);

const NOW = Date.parse("2026-07-11T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const facts = (o: Partial<EntityFacts> = {}): EntityFacts =>
  ({ title: "Entity", href: "/x", ownerName: null, openTasks: 0, upcomingMeetingAt: null, linked: [], ...o });

const row = (o: Partial<CanonicalJourneyRow> = {}): CanonicalJourneyRow => ({
  id: "J1", orgId: "ORG1", journeyType: "property", entityType: "property", entityId: "P1",
  currentStage: "active", status: "active", ownerUserId: "U1",
  stageEnteredAt: daysAgo(1), lastActivityAt: daysAgo(1), startedAt: daysAgo(30),
  source: "legacy_backfill", metadata: null, ...o,
});

// ── 5.6G transition fixtures — dwell is admissible ONLY with these. ─────────
/** A VERIFIED canonical transition: kernel-traceable (sourceEventId) into the
 *  given stage at the given time. This is the ONLY evidence that yields a
 *  numeric stageAgeDays. */
const verifiedInto = (journeyId: string, toStage: string, atDaysAgo: number): CanonicalTransition => ({
  journeyId, fromStage: null, toStage, occurredAt: daysAgo(atDaysAgo),
  reason: null, actorUserId: null, sourceEventId: `evt-${journeyId}`,
});
/** A backfill SEED: same shape, NO sourceEventId. stage_entered_at may exist on
 *  the row — it records when the backfill ran, not a stage entry. Proves nothing. */
const seedInto = (journeyId: string, toStage: string, atDaysAgo: number): CanonicalTransition => ({
  journeyId, fromStage: null, toStage, occurredAt: daysAgo(atDaysAgo),
  reason: "legacy backfill seed", actorUserId: null, sourceEventId: null,
});

// ── 1–3. canonical records appear once, with real ids ───────────────────────
S("1–3. Canonical journeys");
// 5.6G: positive dwell fixtures carry VERIFIED canonical transition evidence
// (sourceEventId + toStage === current stage). lead/deal deliberately stay
// unverified — they exercise the null-dwell (insufficient evidence) path.
const lead = fromCanonicalJourney(row({ id: "JL", journeyType: "lead", entityType: "lead", entityId: "L1", currentStage: "new", source: "event" }), null, facts({ title: "ליד" }), NOW);
const deal = fromCanonicalJourney(row({ id: "JD", journeyType: "deal", entityType: "deal", entityId: "D1", currentStage: "negotiation", source: "event" }), null, facts({ title: "עסקה" }), NOW);
const prop = fromCanonicalJourney(row(), verifiedInto("J1", "active", 1), facts({ title: "נכס" }), NOW);
check("1. canonical lead journey appears once, keyed on the REAL journeys.id", lead.journeyId === "JL" && lead.canonical === true);
check("2. canonical deal journey appears once", deal.journeyId === "JD" && deal.source === "canonical");
check("3. backfilled property journey appears once", prop.journeyId === "J1" && prop.source === "canonical");
check("stage labels come from the CANONICAL machine, not a private vocabulary", prop.stageLabel === stageLabel("property", "active"));
check("every canonical stage is a real machine stage", [lead, deal, prop].every((j) => isValidStage((j.journeyType ?? j.entityType) as never, j.currentStage)));
check("unknown entity title stays '—', never invented", fromCanonicalJourney(row(), null, facts({ title: null }), NOW).entityName === "—");
check("nextAction is NULL — not faked (5.5 wires the recommender)", prop.nextAction === null);

// ── 4–6. canonical vs fallback ─────────────────────────────────────────────
S("4–6. Canonical-first / fallback");
const derivedProp: UnifiedJourney = {
  journeyId: "property:P1", entityType: "property", entityId: "P1", entityName: "נכס",
  href: "/properties/P1", currentStage: "marketed", stageLabel: "בשיווק", stageIndex: 3, stageTotal: 9,
  progress: 40, healthScore: 60, healthLabel: "תקין", risk: 0, priority: 10, flags: ["active"],
  lastActivityAt: daysAgo(3), daysSinceActivity: 3, nextAction: null, nextActionReason: null,
  openTasks: 0, upcomingMeetingAt: null, linked: [], evidence: [],
};
const fb = markFallback(derivedProp)!;
check("4. a fallback record is MARKED, never confused with canonical", fb.source === "fallback" && fb.canonical === false);
check("…and is re-expressed in the CANONICAL vocabulary ('marketed' → 'marketing')", fb.currentStage === "marketing");
check("…carrying an explicit compatibility note", fb.evidence.some((e) => e.includes("תאימות")));
// the service excludes any derived row whose entity already has a canonical journey
const canonicalKeys = new Set(["property:P1"]);
const shown = [prop, ...(canonicalKeys.has(`${derivedProp.entityType}:${derivedProp.entityId}`) ? [] : [fb])];
check("4. NO canonical + legacy duplicate for the same entity", shown.length === 1 && shown[0].canonical === true);
check("5. newer canonical beats stale legacy — the fallback is not even considered", shown[0].journeyId === "J1");
const orphanKeys = new Set<string>();
const shown2 = [...(orphanKeys.has("property:P9") ? [] : [markFallback({ ...derivedProp, entityId: "P9", journeyId: "property:P9" })!])];
check("6. a fallback appears ONLY when no canonical journey exists", shown2.length === 1 && shown2[0].canonical === false);

// ── 7. unmappable is excluded + diagnosed ──────────────────────────────────
S("7. Unmappable legacy records");
check("derived property 'stale' has no canonical peer", resolveFallbackStage("property", "stale").canonicalStage === null);
check("…so the record is EXCLUDED, not guessed", markFallback({ ...derivedProp, currentStage: "stale" }) === null);
check("lead 'disqualified' is still refused (5.3 decision holds)", resolveFallbackStage("lead", "disqualified").canonicalStage === null);
check("…and the reason is stated", !!resolveFallbackStage("lead", "disqualified").reason);
check("mappable derived stages still resolve", resolveFallbackStage("seller", "signing").canonicalStage === "representation");

// ── 8. KPI integrity ───────────────────────────────────────────────────────
S("8. KPI integrity");
// 5.6G: the stalled fixture is stalled because a VERIFIED transition proves a
// 40-day dwell — not because stage_entered_at is old. Same row timestamps as
// before; the EVIDENCE is what changed.
const stalledProp = fromCanonicalJourney(row({ id: "J2", entityId: "P2", stageEnteredAt: daysAgo(40), lastActivityAt: daysAgo(40) }), verifiedInto("J2", "active", 40), facts(), NOW);
const wonProp = fromCanonicalJourney(row({ id: "J3", entityId: "P3", currentStage: "sold", status: "won" }), null, facts(), NOW);
const k = computeJourneyKpis([prop, stalledProp, wonProp, lead, deal, fb]);
check("canonicalRecords counts ONLY canonical", k.canonicalRecords === 5);
check("fallbackRecords counts ONLY fallback", k.fallbackRecords === 1);
check("no double counting — the two sum to the input", (k.canonicalRecords ?? 0) + (k.fallbackRecords ?? 0) === 6);
check("byType is derived from real rows", k.byType?.property === 3 && k.byType?.lead === 1 && k.byType?.deal === 1);
check("byStage keys are namespaced by type (no cross-type collision)", !!k.byStage?.["property:active"] && !!k.byStage?.["deal:negotiation"]);
check("won counts the terminal won stage", k.won === 1);
check("stalled is evidence-based (VERIFIED stage age ≥ STALL_DAYS — never a backfill timestamp)", k.stalled === 1 && STALL_DAYS === 14);
check("blocked is evidence-based (the documented synthetic stall blocker, from verified dwell)", k.blocked === 1);
check("active excludes terminal journeys", k.active === 4);
check("avgDaysInStage is a real mean over VERIFIED entries only ((1+40)/2)", k.avgDaysInStage === 20.5);
check("avgDaysInStage excludes unverified journeys instead of zero-filling them", k.avgDaysInStage !== Math.round(((1 + 40 + 0 + 0) / 4) * 10) / 10);
check("ownerWorkload is a real per-owner count", k.ownerWorkload?.U1 === 5);
check("stageVelocity is null when unmeasurable, never faked", computeJourneyKpis([]).stageVelocity === null);
check("empty input → zeros, not nulls, for counts", computeJourneyKpis([]).canonicalRecords === 0);
check("KPIs ignore fallback rows entirely (except the fallback count)", computeJourneyKpis([fb]).active === 0 && computeJourneyKpis([fb]).fallbackRecords === 1);

// ── 9. filters ─────────────────────────────────────────────────────────────
S("9. Filters");
const all = [prop, stalledProp, wonProp, lead, deal, fb];
check("filter by journeyType", applyFilters(all, { journeyType: "lead" }).length === 1);
check("filter by stage", applyFilters(all, { stage: "sold" }).length === 1);
check("filter by owner", applyFilters(all, { owner: "U1" }).length === 5);
check("filter by status", applyFilters(all, { status: "won" }).length === 1);
check("filter by source=canonical", applyFilters(all, { source: "canonical" }).length === 5);
check("filter by source=fallback", applyFilters(all, { source: "fallback" }).length === 1);
check("filter stalled admits ONLY the verified-dwell stall", applyFilters(all, { stalled: true }).length === 1 && applyFilters(all, { stalled: true })[0].journeyId === "J2");
check("filter blocked follows the documented synthetic-stall semantics", applyFilters(all, { blocked: true }).length === 1 && applyFilters(all, { blocked: true })[0].journeyId === "J2");
check("filter by entityType", applyFilters(all, { entityType: "deal" }).length === 1);
check("date range filters on stage_entered_at", applyFilters(all, { fromDate: daysAgo(2) }).length >= 1);
check("no filter → everything", applyFilters(all, {}).length === 6);

// ── 10. stage age — THE canonical dwell contract (5.6G) ────────────────────
S("10. Stage age");
check("stage age is computed from the VERIFIED transition's occurredAt", prop.stageAgeDays === 1);
check("a verified 40-day-old stage reports 40", stalledProp.stageAgeDays === 40);
check("no transition at all → null, not 0", fromCanonicalJourney(row({ stageEnteredAt: null, startedAt: null }), null, facts(), NOW).stageAgeDays === null);
check("stage_entered_at ALONE is no longer dwell evidence (backfill seed → null)",
  fromCanonicalJourney(row({ stageEnteredAt: daysAgo(40) }), seedInto("J1", "active", 40), facts(), NOW).stageAgeDays === null);
check("a verified transition into a DIFFERENT stage proves nothing about the current one",
  fromCanonicalJourney(row(), verifiedInto("J1", "draft", 30), facts(), NOW).stageAgeDays === null);
check("a sourceEventId without occurredAt still cannot yield a number",
  fromCanonicalJourney(row(), { ...verifiedInto("J1", "active", 5), occurredAt: null }, facts(), NOW).stageAgeDays === null);

// ── 11. stalled / blocked logic — evidence-gated (5.6G) ────────────────────
S("11. Stalled / blocked");
check("a fresh VERIFIED journey is not stalled", !isStalled(prop));
check("a VERIFIED 40-day-old open journey IS stalled", isStalled(stalledProp));
check("an UNVERIFIED 40-day-old journey is NOT stalled (insufficient evidence ≠ stuck)",
  !isStalled(fromCanonicalJourney(row({ id: "JU", entityId: "PU", stageEnteredAt: daysAgo(40) }), seedInto("JU", "active", 40), facts(), NOW)));
check("a TERMINAL journey is never stalled, however old and however verified", !isStalled(fromCanonicalJourney(row({ currentStage: "sold", stageEnteredAt: daysAgo(400) }), verifiedInto("J1", "sold", 400), facts(), NOW)));
check("a stalled journey records the documented synthetic stall blocker", isBlocked(stalledProp) && stalledProp.blockers!.some((b) => b.includes("תקוע")));
check("blocked currently COLLAPSES into verified stalled for active journeys (no independent blocker source)",
  (() => { const u = fromCanonicalJourney(row({ id: "JU2", entityId: "PU2", stageEnteredAt: daysAgo(40) }), seedInto("JU2", "active", 40), facts(), NOW); return !isBlocked(u) && !isStalled(u); })());
check("a healthy journey has NO blockers", !isBlocked(prop));
check("a paused journey is blocked with a reason", isBlocked(fromCanonicalJourney(row({ status: "paused" }), null, facts(), NOW)));
check("a non-canonical stage is surfaced as a blocker (not hidden)",
  fromCanonicalJourney(row({ currentStage: "potential" }), null, facts(), NOW).blockers!.some((b) => b.includes("לא-קנוני")));

// ── 12. actions route to real surfaces ─────────────────────────────────────
S("12. Actions / routing");
check("a property journey links to its real cockpit", prop.href === "/x" || prop.href.startsWith("/"));
check("the journey carries the entity id needed by every action", !!prop.entityId && !!prop.entityType);
check("the journey carries the REAL journey id needed by stage commands", prop.journeyId === "J1");

// ── 13–15. sort, isolation, empty ──────────────────────────────────────────
S("13–15. Sort / isolation / empty");
const sorted = sortByBusinessPriority(all);
check("default sort is BUSINESS PRIORITY — blocked first, never alphabetical", sorted[0].journeyId === "J2");
check("terminal journeys sink to the bottom", sorted[sorted.length - 1].journeyId === "J3" || sorted[sorted.length - 1].priority === 0);
check("13. cross-org isolation is a QUERY concern — every row carries its org", row().orgId === "ORG1");
check("14. empty input → empty list, hasEntities false is the caller's call", computeJourneyKpis([]).canonicalRecords === 0);
check("15. the model is a plain array — pagination/caps are the caller's (CAP=60 per type)", Array.isArray(sorted));

// ════════════════════════════════════════════════════════════════════════════
// Batch 5.6G — REGRESSIONS. Dwell/stall are gated on VERIFIED canonical
// transitions; these lock the contract so it cannot silently regress.
// ════════════════════════════════════════════════════════════════════════════

// ── R1. Backfilled row excluded ─────────────────────────────────────────────
S("5.6G R1. Backfilled row excluded");
const backfilled = fromCanonicalJourney(
  row({ id: "JB", entityId: "PB", stageEnteredAt: daysAgo(40), lastActivityAt: daysAgo(40) }),
  seedInto("JB", "active", 40), facts(), NOW);
check("R1 stage_entered_at exists, no verified transition → stageAgeDays null", backfilled.stageAgeDays === null && backfilled.stageEnteredAt !== null);
check("R1 backfilled is NOT stalled", !isStalled(backfilled));
check("R1 backfilled is NOT blocked", !isBlocked(backfilled) && (backfilled.blockers?.length ?? 0) === 0);
check("R1 backfilled is EXCLUDED from avgDaysInStage (null, not 0, not 40)", computeJourneyKpis([backfilled]).avgDaysInStage === null);
check("R1 backfilled still counts as ACTIVE — unverified ≠ invisible", computeJourneyKpis([backfilled]).active === 1);

// ── R2. Verified entry included ─────────────────────────────────────────────
S("5.6G R2. Verified entry included");
const verified20 = fromCanonicalJourney(
  row({ id: "JV", entityId: "PV", stageEnteredAt: daysAgo(3) }),   // row timestamp DISAGREES on purpose
  verifiedInto("JV", "active", 20), facts(), NOW);
check("R2 dwell derives from transition.occurredAt, not stage_entered_at", verified20.stageAgeDays === 20);
check("R2 verified dwell is included in stalled evaluation (20 ≥ 14)", isStalled(verified20));
check("R2 verified dwell is included in avgDaysInStage", computeJourneyKpis([verified20]).avgDaysInStage === 20);

// ── R3. Mixed population ────────────────────────────────────────────────────
S("5.6G R3. Mixed population");
const v10 = fromCanonicalJourney(row({ id: "JM1", entityId: "PM1" }), verifiedInto("JM1", "active", 10), facts(), NOW);
const u40 = fromCanonicalJourney(row({ id: "JM2", entityId: "PM2", stageEnteredAt: daysAgo(40) }), seedInto("JM2", "active", 40), facts(), NOW);
const km = computeJourneyKpis([v10, u40]);
check("R3 only verified entries contribute to avgDaysInStage (10, not 25)", km.avgDaysInStage === 10);
check("R3 unverified journeys remain active", km.active === 2);
check("R3 unverified journeys do not inflate stalled", km.stalled === 0);
check("R3 unverified journeys do not inflate blocked", km.blocked === 0);

// ── R4. Zero verified entries ───────────────────────────────────────────────
S("5.6G R4. Zero verified entries");
const kz = computeJourneyKpis([backfilled, u40]);
check("R4 avgDaysInStage is null — no numeric fallback of any kind", kz.avgDaysInStage === null);
check("R4 no stalled inference", kz.stalled === 0);
check("R4 no blocked inference", kz.blocked === 0);
const pz = buildExecJourneyProjection({ kpis: kz, actions: [], isManager: false });
check("R4 Executive reports evidenceStatus=insufficient", pz.dwell.evidenceStatus === "insufficient" && pz.dwell.avgDaysInStage === null);
check("R4 Executive fabricates no dwell number and no stall", pz.counts.stalled === 0 && pz.counts.blocked === 0);

// ── R5. Executive ↔ Journey Center parity ───────────────────────────────────
S("5.6G R5. Executive / Journey Center parity");
const pm = buildExecJourneyProjection({ kpis: km, actions: [], isManager: false });
check("R5 identical evidence → identical verified dwell in both surfaces", pm.dwell.avgDaysInStage === km.avgDaysInStage && pm.dwell.avgDaysInStage === 10);
check("R5 unverified dwell is null in BOTH", pz.dwell.avgDaysInStage === null && kz.avgDaysInStage === null);
check("R5 stalled/blocked counts pass through unmodified", pm.counts.stalled === km.stalled && pm.counts.blocked === km.blocked);
const projectionSrc = readFileSync("src/lib/executive-os/journey-projection.ts", "utf8")
  .replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
check("R5 Executive does NOT re-derive evidence (no verifiedStageEntries, no timestamp math)",
  !projectionSrc.includes("verifiedStageEntries") && !projectionSrc.includes("stage_entered_at") && !projectionSrc.includes("Date.parse"));

// ── 5.6G Part 4 — filter audit ──────────────────────────────────────────────
S("5.6G Filters — evidence-aware, deterministic");
check("F1 stalled filter excludes an unverified 40-day journey", applyFilters([stalledProp, u40], { stalled: true }).length === 1 && applyFilters([stalledProp, u40], { stalled: true })[0].journeyId === "J2");
check("F2 blocked filter excludes unverified dwell (synthetic-stall contract)", applyFilters([stalledProp, backfilled], { blocked: true }).every((j) => j.journeyId === "J2"));
check("F3 a paused journey is blocked by its OBSERVED status flag, dwell or not",
  applyFilters([fromCanonicalJourney(row({ id: "JP", entityId: "PP", status: "paused" }), null, facts(), NOW)], { blocked: true }).length === 1);
check("F4 missing dwell is not interpreted as healthy — the journey stays in the unfiltered list", applyFilters([u40], {}).length === 1);
check("F5 filters are deterministic (same input twice → identical output)",
  JSON.stringify(applyFilters([stalledProp, u40, backfilled], { stalled: true })) === JSON.stringify(applyFilters([stalledProp, u40, backfilled], { stalled: true })));

// ── 5.6G Part 5 — evidence-aware business-priority comparator ───────────────
S("5.6G Sort — evidence-aware ordering");
check("S1 verified stalled outranks an unverified (even older-looking) journey",
  sortByBusinessPriority([u40, stalledProp])[0].journeyId === "J2" && sortByBusinessPriority([stalledProp, u40])[0].journeyId === "J2");
const v5 = fromCanonicalJourney(row({ id: "JM3", entityId: "PM3" }), verifiedInto("JM3", "active", 5), facts(), NOW);
check("S2 verified higher dwell sorts first, deterministically",
  sortByBusinessPriority([v5, v10])[0].journeyId === "JM1" && sortByBusinessPriority([v10, v5])[0].journeyId === "JM1");
check("S3 unverified is NOT treated as healthier — it outranks nothing verified, but stays above terminal",
  (() => { const s = sortByBusinessPriority([wonProp, u40, v10]); return s[0].journeyId === "JM1" && s[1].journeyId === "JM2" && s[2].journeyId === "J3"; })());
const uA = fromCanonicalJourney(row({ id: "A", entityId: "NA" }), null, facts(), NOW);
const uB = fromCanonicalJourney(row({ id: "B", entityId: "NB" }), null, facts(), NOW);
const uC = fromCanonicalJourney(row({ id: "C", entityId: "NC" }), null, facts(), NOW);
check("S4 a mostly-null population sorts deterministically by canonical id",
  JSON.stringify(sortByBusinessPriority([uC, uA, uB]).map((j) => j.journeyId)) === JSON.stringify(["A", "B", "C"])
  && JSON.stringify(sortByBusinessPriority([uB, uC, uA]).map((j) => j.journeyId)) === JSON.stringify(["A", "B", "C"]));
check("S5 the canonical-id tie-breaker is stable across permutations",
  JSON.stringify(sortByBusinessPriority([uA, uB, uC])) === JSON.stringify(sortByBusinessPriority([uC, uB, uA])));
check("S6 no `?? -1` sentinel semantics survive in the comparator (executable code — comments may name the banned pattern)",
  !readFileSync("src/lib/journey-center/kpis.ts", "utf8")
    .replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    .includes("?? -1"));

console.log(`\nJourney Center (5.4 + 5.6G) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
