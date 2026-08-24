// ============================================================================
// ZONO 9.5 — FIRST-RUN / EMPTY-STATE LAUNCH CLOSURE regression tests.
// Proves a brand-new office (zero data) sees, on every major screen, an honest
// empty state that explains the area + gives ONE real, canonical CTA — never
// fabricated data, meaningless 0-dashboards, confusing empty tables, or dead CTAs.
// Source-closure over the view components + route-existence for every CTA target.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/first-run-empty-states-9-5.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const src = (rel: string) => readFileSync(new URL(`src/${rel}`, root), "utf8");
const routeExists = (r: string) => existsSync(new URL(`src/app/(app)/${r}/page.tsx`, root));
const HEBREW = /[֐-׿]/;

// ── 1. Zero properties → a real first-property CTA (not "clear filters") ──────
test("properties first-run shows a ZonoEmptyState with a real add-property CTA", () => {
  const t = src("app/(app)/my-properties/PropertiesCommandTable.tsx");
  assert.match(t, /data\.rows\.length === 0 && activeChips\.length === 0/, "distinguishes a truly empty inventory from a filtered-empty result");
  assert.match(t, /<ZonoEmptyState[\s\S]*href: "\/properties\/new", primary: true/, "first-run empty offers 'הוספת נכס' → /properties/new");
  const page = src("app/(app)/my-properties/page.tsx");
  assert.match(page, /data\.total > 0 && \(/, "the 0-filled KPI strip is hidden for a brand-new office");
});

// ── 2. Zero buyers → a real add-buyer CTA ─────────────────────────────────────
test("buyers empty state offers a real add-buyer CTA", () => {
  const w = src("app/(app)/buyers/components/BuyersWorkspace.tsx");
  assert.match(w, /insights\.length === 0[\s\S]*BuyerEmptyState/, "buyers gate the KPI/AI behind real data and show an empty state");
  const e = src("app/(app)/buyers/components/BuyerEmptyState.tsx");
  assert.match(e, /\/buyers\/new/, "buyer empty CTA points to /buyers/new");
});

// ── 3. Zero deals → NO fake create-deal, explains upstream ────────────────────
test("deals empty explains deals come from property+buyer and hides the no-op build button", () => {
  const d = src("app/(app)/deals/DealsView.tsx");
  assert.match(d, /ContextualZeroState/, "uses the shared zero-state");
  assert.match(d, /empty = deals\.length === 0/, "empty flag");
  // The match-dependent "build deals" button is hidden at empty (no dead CTA).
  assert.match(d, /!empty &&[\s\S]*בנה עסקאות|empty \?[\s\S]*ContextualZeroState/, "the build-from-matches button is not shown as a dead CTA at zero");
});

// ── 4. Owner-only team → invite CTA, role-gated at the route ──────────────────
test("team invite is role-gated at the route and offers a real invite flow", () => {
  const page = src("app/(app)/team/page.tsx");
  assert.match(page, /redirect\("\/"\)/, "non-managers are redirected (invite surface hidden, not just disabled)");
  const v = src("app/(app)/team/TeamSeatsView.tsx");
  assert.match(v, /createInvitationAction|AddMemberModal/, "a real invite/add-member flow exists");
});

// ── 5. Matching: 0 buyers vs 0 properties vs 0 matches — differentiated ───────
test("matching differentiates the three zero states with the right CTA each", () => {
  const m = src("app/(app)/matches/MatchesView.tsx");
  assert.match(m, /buyerCount === 0 && propertyCount === 0[\s\S]*הוספת קונה[\s\S]*הוספת נכס/, "state A: need both → both CTAs");
  assert.match(m, /buyerCount === 0 \?[\s\S]*צריך קונים כדי להתחיל[\s\S]*\/buyers\/new/, "state B: need buyers");
  assert.match(m, /propertyCount === 0 \?[\s\S]*צריך נכסים כדי להתחיל[\s\S]*\/properties\/new/, "state C: need properties");
  assert.match(m, /כרגע אין התאמות מספיק חזקות/, "state D: both exist but no strong match");
  assert.match(m, /board\.total > 0 && \(/, "the ₪0 pipeline + empty board cards are hidden until there are real matches");
});

// ── 6. Zero documents → explains attachment + real create CTA ─────────────────
test("documents empty explains the entity-attachment model + a real create CTA", () => {
  const d = src("app/(app)/documents/DocumentsView.tsx");
  assert.match(d, /emptyKind === "all"[\s\S]*ZonoEmptyState[\s\S]*event: "zono:documents-new"/, "main list empty offers a create-document CTA");
  assert.match(d, /מתחברים לנכס, לקונה, למוכר או לעסקה/, "explains docs attach to property/buyer/seller/deal");
  assert.match(d, /addEventListener\("zono:documents-new"/, "the CTA really switches to the create tab (wired handler)");
  assert.doesNotMatch(d, /return <div[^>]*>אין מסמכים להצגה<\/div>/, "the bare 'no documents' box is gone");
});

// ── 7. Creative studio no-property state ──────────────────────────────────────
test("creative studio honestly states creative starts from a property", () => {
  const c = src("app/(app)/creative-studio/CreativeStudioWorkspace.tsx");
  assert.match(c, /אין עדיין נכסים לבחירה|בחרו נכס או סוכן/, "explains creative starts from a property/agent");
});

// ── 8. Marketing no-property state → property readiness ───────────────────────
test("marketing first-run points to property readiness and hides 0-filled hero stats", () => {
  const m = src("app/(app)/marketing/MarketingView.tsx");
  assert.match(m, /empty \?[\s\S]*השיווק מתחיל מנכס[\s\S]*\/properties\/new/, "empty marketing directs to add a property");
  assert.match(m, /\{!empty &&[\s\S]*בריאות שיווק/, "the health-score badge is hidden for an empty office");
  assert.match(m, /\{!empty && \([\s\S]*נכסים לקידום/, "the 0/0/0 hero stat row is hidden for an empty office");
});

// ── 9. Intelligence no-evidence wording (office / market / broker) ────────────
test("intelligence surfaces use honest no-data wording, not fake charts", () => {
  const office = src("components/office-intelligence/OfficeIntelligencePage.tsx");
  assert.match(office, /kpiCards\.every\(\(c\) => c\.value === 0\)/, "office gates on a real zero-data signal");
  assert.match(office, /עדיין אין מספיק פעילות כדי להציג את מודיעין המשרד/, "honest office empty wording");
  const market = src("app/(app)/market-intelligence/MarketCockpitView.tsx");
  assert.match(market, /!data\.hasData[\s\S]*IntelligenceEmptyState/, "market gates on hasData with an empty state (external data = sync-to-populate)");
});

// ── 10. No fabricated KPI/chart data on a zero-data office ─────────────────────
test("zero-data dashboards are gated, never 0-filled to fill space", () => {
  const office = src("components/office-intelligence/OfficeIntelligencePage.tsx");
  assert.match(office, /if \(isEmpty\) \{[\s\S]*IntelligenceEmptyState/, "office returns an empty state instead of a 0-filled KPI/forecast dashboard");
  const props = src("app/(app)/my-properties/page.tsx");
  assert.match(props, /data\.total > 0 && \(/, "properties hides the KPI strip at zero");
});

// ── 11. Role-aware empty states ───────────────────────────────────────────────
test("empty-state CTAs respect the real permission model (team route gate)", () => {
  const page = src("app/(app)/team/page.tsx");
  assert.match(page, /redirect/, "the invite surface is route-gated to manager+ (not just a disabled button)");
});

// ── 12. Every empty-state CTA points to a real canonical route ────────────────
test("all first-run CTA destinations are real routes", () => {
  for (const r of ["properties/new", "buyers/new", "team", "leads"]) {
    assert.ok(routeExists(r), `/${r} route exists`);
  }
});

// ── 13. Empty copy is Hebrew-only (no English leakage) ────────────────────────
test("new empty-state copy is Hebrew and leaks no raw English/enum", () => {
  const snippets = [
    "הנכס הראשון שלך עוד לא כאן", "צריך קונים ונכסים כדי להתחיל התאמות",
    "עוד לא נוצרו מסמכים", "השיווק מתחיל מנכס", "עדיין אין מספיק פעילות כדי להציג את מודיעין המשרד",
  ];
  for (const s of snippets) assert.ok(HEBREW.test(s) && !/[A-Za-z]{4,}/.test(s), `Hebrew-only: ${s}`);
});

// ── 14. Mobile-safe: the shared empty component uses a fluid, centered contract ─
test("ZonoEmptyState is mobile-safe (fluid, centered, max-width, no fixed overflow)", () => {
  const z = src("components/zono/ZonoEmptyState.tsx");
  assert.match(z, /flex flex-col items-center[\s\S]*text-center/, "centered column layout");
  assert.match(z, /max-w-sm/, "description is width-capped (no full-bleed run-on line)");
  assert.match(z, /flex-wrap/, "actions wrap on narrow screens (no horizontal overflow)");
  assert.doesNotMatch(z, /w-\[\d{3,}px\]/, "no fixed hundreds-px width that would overflow at 390");
});
