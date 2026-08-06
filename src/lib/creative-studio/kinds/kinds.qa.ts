/**
 * Contract tests for the new creative kinds.
 *   npx tsx src/lib/creative-studio/kinds/kinds.qa.ts
 */
import { buildKindCreative, buildAgentBrand, buildOfficeBrand, buildMarketStat, isValidIsraeliPhone, KindValidationError } from "./index";
import type { ResolvedBrand } from "../brand-asset-resolver";

let passed = 0; const failures: string[] = [];
function ok(n: string, c: boolean) { if (c) passed++; else { failures.push(n); console.error("  x " + n); } }
function throws(n: string, fn: () => unknown, field?: string) {
  try { fn(); failures.push(n + " (no throw)"); console.error("  x " + n); }
  catch (e) { if (field && (e as KindValidationError).field !== field) { failures.push(`${n} wrong field ${(e as KindValidationError).field}`); console.error("  x " + n); } else passed++; }
}

function brand(over: Partial<ResolvedBrand> = {}): ResolvedBrand {
  return {
    logo: "logo.png", logoTransparent: "logo-t.png", logoLight: null, logoDark: null,
    profileImage: "photo.jpg", primaryColor: "#101014", secondaryColor: "#1c1c22", accentColor: "#C9A24B",
    phone: "050-1234567", whatsapp: "050-1234567", email: "a@b.co", officeName: "משרד הנדל\"ן", agentName: "דנה כהן",
    website: null, footerText: "© ZONO", sources: { profileImage: "agent.profile_image" }, warnings: [], ...over,
  };
}
const now = () => Date.parse("2026-08-01T00:00:00Z");

function testPhone() {
  ok("valid 05X phone", isValidIsraeliPhone("050-1234567"));
  ok("valid +972", isValidIsraeliPhone("+972 50 1234567"));
  ok("reject short", !isValidIsraeliPhone("12345"));
  ok("reject empty", !isValidIsraeliPhone(null));
}

function testAgentBrand() {
  const spec = buildAgentBrand({ orgId: "A", agentOrgId: "A", role: "יועץ בכיר", specialization: "יוקרה", geoFocus: "הרצליה פיתוח" }, brand());
  ok("agent spec built", spec.kind === "agent_brand" && spec.headline === "דנה כהן" && spec.agentPhoto === "photo.jpg" && spec.logoUrl === "logo-t.png");
  ok("agent immutable facts", spec.immutableFacts.name === "דנה כהן" && spec.immutableFacts.phone === "050-1234567");
  throws("agent cross-org rejected", () => buildAgentBrand({ orgId: "A", agentOrgId: "B" }, brand()), "org");
  throws("agent missing photo rejected", () => buildAgentBrand({ orgId: "A", agentOrgId: "A" }, brand({ profileImage: null })), "agent_photo");
  throws("agent unapproved photo rejected", () => buildAgentBrand({ orgId: "A", agentOrgId: "A" }, brand({ sources: { profileImage: "legacy.user.avatar_url" } })), "agent_photo");
  throws("agent invalid phone rejected", () => buildAgentBrand({ orgId: "A", agentOrgId: "A" }, brand({ phone: "12" })), "phone");
  throws("agent no brand rejected", () => buildAgentBrand({ orgId: "A", agentOrgId: "A" }, brand({ primaryColor: null, logo: null, logoTransparent: null })), "brand");
}

function testOfficeBrand() {
  const spec = buildOfficeBrand({ orgId: "A", branch: "סניף מרכז", geo: "תל אביב" }, brand());
  ok("office spec built", spec.kind === "office_brand" && spec.headline === "משרד הנדל\"ן" && spec.logoUrl === "logo-t.png");
  throws("office missing logo rejected", () => buildOfficeBrand({ orgId: "A" }, brand({ logo: null, logoTransparent: null })), "logo");
  throws("office missing colors rejected", () => buildOfficeBrand({ orgId: "A" }, brand({ primaryColor: null })), "colors");
  throws("office no contact rejected", () => buildOfficeBrand({ orgId: "A" }, brand({ phone: null, email: null })), "contact");
}

function testMarketStat() {
  const goodStat = { subtype: "price_change" as const, value: "3.2%", source: "רשות המסים", sourceReference: "gov.il/tax/2026-07", geography: "תל אביב", period: "2026-07", freshnessTimestamp: "2026-07-28T00:00:00Z", comparisonBasis: "לעומת החודש הקודם", classification: "factual" as const, metricName: "שינוי מחיר", comparisonValue: "2.1%" };
  const spec = buildMarketStat({ orgId: "A", stat: goodStat }, brand(), now());
  ok("market spec built", spec.kind === "market_stat" && spec.immutableFacts.source_reference === "gov.il/tax/2026-07");
  ok("market brief states fixed source data", spec.brief.includes("נתון מקור קבוע ואסור לשנותו"));
  throws("incomplete evidence rejected", () => buildMarketStat({ orgId: "A", stat: { subtype: "price_change", value: 5 } }, brand(), now()), "evidence");
  throws("missing source reference rejected", () => buildMarketStat({ orgId: "A", stat: { ...goodStat, sourceReference: undefined } }, brand(), now()), "source_reference");
  throws("stale data rejected", () => buildMarketStat({ orgId: "A", stat: { ...goodStat, freshnessTimestamp: "2026-01-01T00:00:00Z" }, maxAgeDays: 45 }, brand(), now()), "stale");
}

function testDispatch() {
  const s = buildKindCreative({ kind: "office_brand", input: { orgId: "A" } }, brand(), now);
  ok("dispatch office_brand", s.kind === "office_brand");
}

function main() {
  console.log("Creative-Studio — New-Kind Contract Tests");
  testPhone(); testAgentBrand(); testOfficeBrand(); testMarketStat(); testDispatch();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) { console.error("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL NEW-KIND CONTRACT TESTS PASSED");
}
main();
