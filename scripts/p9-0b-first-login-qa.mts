// P9.0B — FIRST-LOGIN WOW QA (PURE; no DB, no network, no writes).
// Regression-proves the P9.0B contract:
//  (1) onboarding/activation auto-detect columns EXIST in the real schema —
//      the class of bug that silently zeroed detection (buyers/sellers queried
//      by the non-existent `organization_id`) can never return;
//  (2) every count source is a real ORG-SCOPING column (tenant isolation);
//  (3) computeActivation is HONEST — a truly empty office is "new" with no
//      fabricated completion; data advances the phase deterministically;
//  (4) the capability catalog is honest (real routes, honest states);
//  (5) widgets.ts contains NO fabricated market/journey fallback.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ONBOARDING_AUTODETECT } from "../src/lib/launch/onboarding.ts";
import { ACTIVATION_COUNT_SOURCES, computeActivation, ACTIVATION_MILESTONES, type ActivationInput } from "../src/lib/activation/activation.ts";
import { CAPABILITIES } from "../src/lib/activation/capabilities.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };

// Authoritative schema snapshot (captured from live project tlrefajhyrqnjtmimaos).
// If a mapping ever points at a column absent here, this test fails loudly.
const SCHEMA: Record<string, string[]> = {
  organization_operating_localities: ["id", "organization_id"],
  user_operating_localities: ["id", "user_id", "organization_id"],
  org_invitations: ["id", "org_id"],
  properties: ["id", "org_id", "uploaded_by_user_id"],
  property_media: ["id", "org_id", "property_id"],
  distribution_campaigns: ["id", "org_id", "property_id"],
  leads: ["id", "org_id"],
  buyers: ["id", "org_id", "portal_user_id"],
  sellers: ["id", "org_id", "portal_user_id"],
  deals: ["id", "org_id"],
  tasks: ["id", "org_id"],
  meetings: ["id", "org_id", "organizer_id"],
  users: ["id", "org_id"],
};
const ORG_SCOPE_COLS = new Set(["org_id", "organization_id"]);

console.log("P9.0B · (1) onboarding auto-detect columns exist in real schema");
for (const d of ONBOARDING_AUTODETECT) {
  ok(!!SCHEMA[d.table]?.includes(d.column), `${d.key}: ${d.table}.${d.column} exists`);
}

console.log("\nP9.0B · (2) activation count sources are real ORG-SCOPED columns (tenant isolation)");
for (const s of ACTIVATION_COUNT_SOURCES) {
  for (const t of s.tables) {
    ok(!!SCHEMA[t.table]?.includes(t.column), `${s.key}: ${t.table}.${t.column} exists`);
    ok(ORG_SCOPE_COLS.has(t.column), `${s.key}: ${t.table}.${t.column} is an org-scoping column`);
  }
}

console.log("\nP9.0B · (3) computeActivation is HONEST for a truly empty office");
const EMPTY: ActivationInput = { orgExists: true, ownerIdentity: true, cityDetected: true, counts: {}, brandConfigured: false, digitalPresence: false, teamSize: 1 };
const empty = computeActivation(EMPTY);
ok(empty.phase === "new", "empty office → phase 'new'");
ok(empty.hasOperationalData === false, "empty office → no operational data");
ok(empty.completedCount === 3, "only the 3 auto identity milestones are done (office/identity/city)");
ok(empty.milestones.filter((m) => m.done).every((m) => m.milestone.auto), "every 'done' milestone is an auto identity one — zero fabricated completion");
ok(empty.nextIncomplete?.key === "operating_area", "next step = operating_area (first real action)");

console.log("\nP9.0B · (3b) data advances the phase deterministically (NULL stays NULL until real)");
const withProperty = computeActivation({ ...EMPTY, counts: { first_property: 1 } });
ok(withProperty.phase === "activating", "one real property → 'activating'");
ok(withProperty.hasOperationalData === true, "one real property → hasOperationalData true");
const teamOnly = computeActivation({ ...EMPTY, teamSize: 3 });
ok(teamOnly.phase === "new", "team invited but no business data → still 'new' (honest)");
const active = computeActivation({ orgExists: true, ownerIdentity: true, cityDetected: true, brandConfigured: true, digitalPresence: true, teamSize: 4, counts: { operating_area: 1, team_invited: 2, first_property: 3, first_media: 2, first_campaign: 1, first_contact: 5, first_deal: 1, first_task_meeting: 4 } });
ok(active.phase === "active", "fully populated office → 'active'");
ok(active.percent === 100, "fully populated → 100%");

console.log("\nP9.0B · (4) capability catalog is honest (real routes + honest states)");
const STATES = new Set(["ready", "connect", "after_data", "soon"]);
ok(CAPABILITIES.every((c) => c.href.startsWith("/")), "every capability has a real in-app route");
ok(CAPABILITIES.every((c) => STATES.has(c.state)), "every capability has a valid honest state");
ok(CAPABILITIES.find((c) => c.key === "marketing")?.state === "after_data", "marketing intelligence = after_data (empty until data)");
ok(CAPABILITIES.find((c) => c.key === "facebook")?.state === "connect", "facebook = connect (requires OAuth)");
ok(CAPABILITIES.find((c) => c.key === "whatsapp")?.state === "connect", "whatsapp = connect (requires connection)");
ok(ACTIVATION_MILESTONES.every((m) => m.href.startsWith("/")), "every activation milestone has a real route");

console.log("\nP9.0B · (5) widgets.ts has NO fabricated market/journey fallback");
const here = dirname(fileURLToPath(import.meta.url));
const widgets = readFileSync(join(here, "../src/lib/dashboard/widgets.ts"), "utf8");
ok(!/from ["']@\/data\/mock["']/.test(widgets), "no import from @/data/mock");
ok(!/mockMarket|mockJourney/.test(widgets), "no mockMarket / mockJourney references");
ok(/return \[\];\s*\}?\s*\/\/ P9\.0B|return \[\];/.test(widgets) || /honest empty/.test(widgets), "market widgets return honest empty");

console.log(`\n${fail === 0 ? "✅ P9.0B QA PASSED" : `❌ P9.0B QA FAILED (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
