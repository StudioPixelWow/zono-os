// ============================================================================
// ZONO PUBLIC SITES 7.1 — code-closure regression tests (pure + source guards).
// Proves the objective closures that do not require authenticated visual access:
//  1. Agent StatStrip composes intentionally at 0/1/2/3/4 real stats.
//  2. The canonical Hebrew type resolver never leaks a raw enum publicly.
//  3. The legacy /ai-agent/* routes 308-redirect to the canonical /agent/* (one
//     indexable agent URL) — no second independently-rendered public agent page.
//  4. The public property ListingAgent DTO carries NO agent email and NO UUID.
//  5. The office lead path has a honeypot + windowed duplicate-submit guard.
//  6. The property <title> metadata resolves the type (no duplicate raw-enum map).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/public-sites-7-1.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { statStripGridClass, statStripVisible } from "../../src/lib/agent-website/stat-strip-layout.ts";
import { resolvePropertyType, resolvePropertyTypeLabel } from "../../src/lib/property-marketing/presentation.ts";

const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");

// ── 1. StatStrip responsive composition ─────────────────────────────────────
test("StatStrip: 0 stats hides the band", () => {
  assert.equal(statStripVisible(0), false);
});
test("StatStrip: 1..4 stats are all visible", () => {
  for (const n of [1, 2, 3, 4]) assert.equal(statStripVisible(n), true, `count ${n}`);
});
test("StatStrip: each count 1/2/3/4 gets a distinct, intentional layout", () => {
  const one = statStripGridClass(1), two = statStripGridClass(2), three = statStripGridClass(3), four = statStripGridClass(4);
  // 1 = centered single (capped width, single column); never a stretched flex row.
  assert.match(one, /grid-cols-1/);
  assert.match(one, /max-w-\[240px\]/);
  // 2 = balanced two-column.
  assert.match(two, /grid-cols-2/);
  // 3 = three-column.
  assert.match(three, /grid-cols-3/);
  // 4 = clean 2×2 on mobile, 4-across on sm+ (no stray wrap dividers).
  assert.match(four, /grid-cols-2/);
  assert.match(four, /sm:grid-cols-4/);
  // all distinct
  assert.equal(new Set([one, two, three, four]).size, 4);
});
test("StatStrip: 4+ collapses onto the 4-up composition (no runaway columns)", () => {
  assert.equal(statStripGridClass(5), statStripGridClass(4));
});

// ── 2. Hebrew-only type resolver (public UI contract) ────────────────────────
test("type resolver: known English enums map to Hebrew", () => {
  assert.equal(resolvePropertyType("apartment"), "דירה");
  assert.equal(resolvePropertyType("garden_apartment"), "דירת גן");
  assert.equal(resolvePropertyType("warehouse"), "מחסן / לוגיסטיקה");
  assert.equal(resolvePropertyType("triplex"), "טריפלקס");
});
test("type resolver: unknown internal/English token never leaks (null)", () => {
  assert.equal(resolvePropertyType("some_unmapped_enum"), null);
  assert.equal(resolvePropertyType("FooBarType"), null);
});
test("type resolver: already-Hebrew value passes through", () => {
  assert.equal(resolvePropertyType("דירת גג"), "דירת גג");
});
test("type label: unknown token falls back to a safe Hebrew word, never the raw enum", () => {
  const label = resolvePropertyTypeLabel("totally_unknown_enum");
  assert.equal(label, "נכס");
  assert.ok(!/[a-zA-Z_]/.test(label), "label must not contain latin/underscore enum text");
});

// ── 3. Canonical agent route (SEO de-duplication) ────────────────────────────
test("legacy /ai-agent home 308-redirects to canonical /agent", () => {
  const s = src("app/ai-agent/[slug]/page.tsx");
  assert.match(s, /permanentRedirect\(`\/agent\/\$\{slug\}`\)/);
  // The legacy page must NOT still render a full duplicate site.
  assert.ok(!/AgentWebsiteTemplate|getAgentHomeAi/.test(s), "legacy home must not render a second agent page");
});
test("legacy /ai-agent/properties redirects to canonical /agent/[slug]/properties", () => {
  assert.match(src("app/ai-agent/[slug]/properties/page.tsx"), /permanentRedirect\(`\/agent\/\$\{slug\}\/properties`\)/);
});
test("legacy /ai-agent/property/[id] redirects to the canonical /p/[id] microsite", () => {
  assert.match(src("app/ai-agent/[slug]/property/[id]/page.tsx"), /permanentRedirect\(`\/p\/\$\{id\}`\)/);
});
test("agent's own public URL points at the canonical /agent route", () => {
  assert.match(src("lib/my-profile/service.ts"), /`\/agent\/\$\{slug\}`/);
});

// ── 4. Public property DTO privacy ───────────────────────────────────────────
test("ListingAgent DTO carries no agent email and no internal id", () => {
  const s = src("lib/property-marketing/data.ts");
  const start = s.indexOf("export interface ListingAgent");
  const iface = s.slice(start, s.indexOf("}", start) + 1); // this interface body only
  assert.ok(!/\bemail\b/.test(iface), "ListingAgent must not expose email");
  assert.ok(!/\bid:\s*string/.test(iface), "ListingAgent must not expose a UUID id");
  // contact CTAs are preserved
  assert.match(iface, /whatsapp/);
  assert.match(iface, /tel/);
});

// ── 5. Office lead hardening (honeypot + dedupe) ─────────────────────────────
test("office lead service has a honeypot short-circuit and a windowed dedupe", () => {
  const s = src("lib/office-website/service.ts");
  assert.match(s, /input\.company/, "honeypot field checked");
  assert.match(s, /DEDUPE_WINDOW_MS/, "dedupe window present");
  assert.match(s, /office_website_leads/, "dedupe reuses the existing lead surface");
  // attribution/source_section still preserved
  assert.match(s, /source_section: input\.sourceSection/);
});
test("office lead form renders an aria-hidden, non-focusable honeypot", () => {
  const s = src("app/site/[slug]/SiteLeadForm.tsx");
  assert.match(s, /name="company"/);
  assert.match(s, /tabIndex=\{-1\}/);
  assert.match(s, /aria-hidden/);
});

// ── 6. Property metadata resolves the type (no duplicate raw-enum map) ────────
test("property page metadata uses the canonical resolver, not a raw ?? enum map", () => {
  const s = src("app/p/[id]/page.tsx");
  assert.match(s, /resolvePropertyTypeLabel\(d\.type\)/);
  assert.ok(!/TYPE_LABEL\[d\.type\]\s*\?\?\s*d\.type/.test(s), "raw enum fallback must be gone");
});
