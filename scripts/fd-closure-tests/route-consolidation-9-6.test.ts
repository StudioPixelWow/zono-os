// ============================================================================
// ZONO 9.6 — ROUTE CONSOLIDATION / DEAD-CODE LAUNCH CLOSURE regression tests.
// Proves ZONO exposes ONE canonical route per capability: legacy/duplicate paths
// redirect to canonical (never 404), the crawlable public sitemaps advertise the
// CANONICAL public contract (/agent, /site, /p, /my, /sign) rather than retired
// prefixes, provider/consent CALLBACK routes are preserved untouched, and the
// nav single-source-of-truth points only at canonical routes. Audit-first: nothing
// is removed on a "no imports" basis — this locks the SAFE, confirmed closures.
// Source-closure over the route/SEO/nav files + route-existence for every target.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/route-consolidation-9-6.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const src = (rel: string) => readFileSync(new URL(`src/${rel}`, root), "utf8");
const exists = (rel: string) => existsSync(new URL(`src/${rel}`, root));

// ── 1. Agent public sitemap emits the CANONICAL /agent home + /properties ─────
test("agent sitemap advertises the canonical /agent surface", () => {
  const t = src("lib/agent-site/seo.ts");
  const build = t.slice(t.indexOf("export function buildAgentSitemap"), t.indexOf("export function agentRobotsTxt"));
  assert.match(build, /`\$\{origin\}\/agent\/\$\{slug\}`/, "sitemap home = canonical /agent/{slug}");
  assert.match(build, /`\$\{cbase\}\/properties`/, "sitemap includes the canonical /agent/{slug}/properties");
});

// ── 2. Individual listings point at the canonical property microsite /p/[id] ──
test("agent sitemap points listings at canonical /p/{id}, not a per-site property path", () => {
  const t = src("lib/agent-site/seo.ts");
  const build = t.slice(t.indexOf("export function buildAgentSitemap"), t.indexOf("export function agentRobotsTxt"));
  assert.match(build, /`\$\{origin\}\/p\/\$\{id\}`/, "each property = canonical /p/{id}");
});

// ── 3. The retired /ai-agent prefix is NO LONGER advertised to crawlers ───────
test("agent sitemap + robots emit ZERO retired /ai-agent URLs", () => {
  const t = src("lib/agent-site/seo.ts");
  const served = t.slice(t.indexOf("export function buildAgentSitemap"));
  assert.doesNotMatch(served, /\/ai-agent\//, "the served sitemap/robots block never emits /ai-agent");
});

// ── 4. Agent robots.txt advertises the canonical path + the REAL sitemap URL ──
test("agent robots allows /agent and points at the real /api/agent-site sitemap endpoint", () => {
  const t = src("lib/agent-site/seo.ts");
  assert.match(t, /Allow: \/agent\/\$\{slug\}/, "robots Allow uses canonical /agent");
  assert.match(t, /\/api\/agent-site\/\$\{slug\}\/sitemap\.xml/, "robots Sitemap points at the served endpoint, not a dead /ai-agent path");
});

// ── 5. The sitemap builder caller was updated to the canonical 3-arg signature ─
test("getAgentSitemap calls the canonical builder (retired area URLs dropped)", () => {
  const t = src("lib/agent-site/service.ts");
  assert.match(t, /buildAgentSitemap\(origin, slug, input\.listings\.slice\(0, 200\)\.map\(\(l\) => l\.id\)\)/, "no legacy areas argument");
  assert.doesNotMatch(t, /buildAgentSitemap\([^)]*areas\)/, "the areas arg is gone");
});

// ── 6. Legacy /ai-agent pages are RETIRED via a permanent redirect to /agent ──
test("/ai-agent/[slug] permanently redirects to canonical /agent/[slug]", () => {
  const t = src("app/ai-agent/[slug]/page.tsx");
  assert.match(t, /permanentRedirect\(`\/agent\/\$\{slug\}`\)/, "308 → /agent/{slug}");
});

// ── 7. Legacy /ai-agent property subroute redirects to canonical /p/[id] ──────
test("/ai-agent/[slug]/property/[id] permanently redirects to canonical /p/[id]", () => {
  const t = src("app/ai-agent/[slug]/property/[id]/page.tsx");
  assert.match(t, /permanentRedirect\(`\/p\/\$\{id\}`\)/, "308 → /p/{id}");
});

// ── 8. /properties index → canonical /my-properties (bookmark-safe) ───────────
test("/properties index redirects to canonical /my-properties", () => {
  const t = src("app/(app)/properties/page.tsx");
  assert.match(t, /redirect\("\/my-properties"\)/, "legacy /properties → /my-properties");
  // …and the canonical target is a REAL page (no redirect loop back to /properties).
  assert.ok(exists("app/(app)/my-properties/page.tsx"), "/my-properties is a real canonical page");
  assert.doesNotMatch(src("app/(app)/my-properties/page.tsx"), /redirect\("\/properties"\)/, "no redirect loop");
});

// ── 9. /creative → canonical /creative-studio (single creative entry) ─────────
test("/creative redirects to canonical /creative-studio", () => {
  const t = src("app/(app)/creative/page.tsx");
  assert.match(t, /redirect\("\/creative-studio"\)/, "legacy /creative → /creative-studio");
  assert.ok(exists("app/(app)/creative-studio/page.tsx"), "/creative-studio is a real canonical page");
});

// ── 10. Canonical property microsite /p/[id] self-canonicals to /p ────────────
test("/p/[id] emits its own /p/{id} canonical (single property public URL)", () => {
  const t = src("app/p/[id]/page.tsx");
  assert.match(t, /\/p\/\$\{id\}/, "canonical/OG url is /p/{id}");
});

// ── 11. Canonical /agent/[slug] self-canonicals AND preserves 9.2B unavailable ─
test("/agent/[slug] is canonical and preserves the 9.2B suspended-agent state", () => {
  const t = src("app/agent/[slug]/page.tsx");
  assert.match(t, /`\$\{origin\}\/agent\/\$\{slug\}`/, "canonical = /agent/{slug}");
  assert.match(t, /unavailable/, "9.2B suspended-agent unavailable branch preserved (URL kept, not redirected)");
});

// ── 12. Nav single-source-of-truth points ONLY at canonical routes ────────────
test("nav-groups uses the canonical intelligence + marketing + executive routes", () => {
  const t = src("components/dashboard/nav-groups.ts");
  assert.match(t, /href: "\/office\/intelligence"/, "office intelligence nav → canonical /office/intelligence");
  assert.match(t, /href: "\/marketing"/, "marketing nav → canonical /marketing");
  assert.match(t, /href: "\/executive"/, "executive nav → canonical /executive");
  // The off-rail duplicate surfaces must NOT be wired into the primary rail.
  assert.doesNotMatch(t, /href: "\/office-intelligence"/, "the off-rail /office-intelligence is not on the primary nav");
  assert.doesNotMatch(t, /href: "\/marketing-core"/, "the off-rail /marketing-core is not on the primary nav");
});

// ── 13. Consent/unsubscribe CALLBACK /u/[token] preserved as a GET route ──────
test("/u/[token] stays a compliance callback route (never a redirect/page)", () => {
  assert.ok(exists("app/u/[token]/route.ts"), "/u/[token] is a route handler, not a page");
  const t = src("app/u/[token]/route.ts");
  assert.match(t, /export async function GET/, "unsubscribe consent GET handler intact");
});

// ── 14. Buyer public token routes /my and /r both preserved (distinct products) ─
test("persistent /my/[token] and bundle /r/[token] both remain (not collapsed)", () => {
  assert.ok(exists("app/my/[token]/page.tsx"), "persistent buyer portal /my/[token] intact");
  assert.ok(exists("app/r/[token]/page.tsx"), "bundle recommendation /r/[token] intact");
  // The canonical signing token route is likewise preserved.
  assert.ok(exists("app/sign/[token]/page.tsx"), "canonical signing /sign/[token] intact");
});

// ── 15. The 9.4 Hebrew error/404 boundary is preserved under consolidation ────
test("9.4 Hebrew error boundary + not-found surfaces survive route consolidation", () => {
  assert.ok(exists("app/error.tsx") || exists("app/global-error.tsx"), "app-level error boundary present");
  const errFile = exists("app/error.tsx") ? "app/error.tsx" : "app/global-error.tsx";
  assert.match(src(errFile), /[֐-׿]/, "error boundary renders Hebrew copy (9.4)");
});
