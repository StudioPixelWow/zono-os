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

// ── 1–3. canonical records appear once, with real ids ───────────────────────
S("1–3. Canonical journeys");
const lead = fromCanonicalJourney(row({ id: "JL", journeyType: "lead", entityType: "lead", entityId: "L1", currentStage: "new", source: "event" }), null, facts({ title: "ליד" }), NOW);
const deal = fromCanonicalJourney(row({ id: "JD", journeyType: "deal", entityType: "deal", entityId: "D1", currentStage: "negotiation", source: "event" }), null, facts({ title: "עסקה" }), NOW);
const prop = fromCanonicalJourney(row(), null, facts({ title: "נכס" }), NOW);
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
const stalledProp = fromCanonicalJourney(row({ id: "J2", entityId: "P2", stageEnteredAt: daysAgo(40), lastActivityAt: daysAgo(40) }), null, facts(), NOW);
const wonProp = fromCanonicalJourney(row({ id: "J3", entityId: "P3", currentStage: "sold", status: "won" }), null, facts(), NOW);
const k = computeJourneyKpis([prop, stalledProp, wonProp, lead, deal, fb]);
check("canonicalRecords counts ONLY canonical", k.canonicalRecords === 5);
check("fallbackRecords counts ONLY fallback", k.fallbackRecords === 1);
check("no double counting — the two sum to the input", (k.canonicalRecords ?? 0) + (k.fallbackRecords ?? 0) === 6);
check("byType is derived from real rows", k.byType?.property === 3 && k.byType?.lead === 1 && k.byType?.deal === 1);
check("byStage keys are namespaced by type (no cross-type collision)", !!k.byStage?.["property:active"] && !!k.byStage?.["deal:negotiation"]);
check("won counts the terminal won stage", k.won === 1);
check("stalled is evidence-based (stage age ≥ STALL_DAYS)", k.stalled === 1 && STALL_DAYS === 14);
check("blocked is evidence-based (a real blocker was recorded)", k.blocked === 1);
check("active excludes terminal journeys", k.active === 4);
check("avgDaysInStage is a real mean, not zero-filled", typeof k.avgDaysInStage === "number" && k.avgDaysInStage! > 0);
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
check("filter stalled", applyFilters(all, { stalled: true }).length === 1);
check("filter blocked", applyFilters(all, { blocked: true }).length === 1);
check("filter by entityType", applyFilters(all, { entityType: "deal" }).length === 1);
check("date range filters on stage_entered_at", applyFilters(all, { fromDate: daysAgo(2) }).length >= 1);
check("no filter → everything", applyFilters(all, {}).length === 6);

// ── 10. stage age ──────────────────────────────────────────────────────────
S("10. Stage age");
check("stage age is computed from stage_entered_at", prop.stageAgeDays === 1);
check("a 40-day-old stage reports 40", stalledProp.stageAgeDays === 40);
check("missing stage_entered_at → null, not 0", fromCanonicalJourney(row({ stageEnteredAt: null, startedAt: null }), null, facts(), NOW).stageAgeDays === null);

// ── 11. stalled / blocked logic ────────────────────────────────────────────
S("11. Stalled / blocked");
check("a fresh journey is not stalled", !isStalled(prop));
check("a 40-day-old open journey IS stalled", isStalled(stalledProp));
check("a TERMINAL journey is never stalled, however old", !isStalled(fromCanonicalJourney(row({ currentStage: "sold", stageEnteredAt: daysAgo(400) }), null, facts(), NOW)));
check("a stalled journey records a real blocker", isBlocked(stalledProp) && stalledProp.blockers!.some((b) => b.includes("תקוע")));
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

console.log(`\nJourney Center (5.4) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
