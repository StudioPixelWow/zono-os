// ============================================================================
// P9.1C — AUTOMATIC INTELLIGENCE ORCHESTRATOR QA (STATIC; no DB/network).
// Proves the launch-blocking invariants of the cron-reliable, tenant-safe
// orchestrator by analysing the ACTUAL source (not a mock):
//   1. TENANT ISOLATION — every service-role-reachable read in the broker
//      detection chain is EXPLICITLY org-scoped (.eq("org_id", …)); no read
//      relies on RLS alone. An unscoped read = launch-blocking FAIL.
//   2. CRON ENTRY POINTS — service-role, org-scoped wrappers exist for broker
//      detection + competitor snapshot and are wired into the cron path.
//   3. RELIABLE EXECUTION MODEL — cron runs the deep adaptive scan; dashboard
//      load is lightweight ("quick") only; area intelligence runs on cron.
//   4. IDEMPOTENCY — the writes that overlapping triggers race on all upsert on
//      an org-qualified conflict key (no duplicate rows across cron/entry/boot).
//   5. NO SERVICE-ROLE LEAK — the detection chain never reads the sensitive
//      tables without an org filter.
// Run: npx tsx scripts/p9-1c-orchestrator-qa.mts
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };
const section = (t: string) => console.log("\n" + t);

/** Extract a function/arrow body by brace-matching from the first `{` after a marker. */
function bodyAfter(src: string, marker: string): string {
  const i = src.indexOf(marker);
  if (i < 0) return "";
  const open = src.indexOf("{", i);
  if (open < 0) return "";
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(open, j + 1); }
  }
  return src.slice(open);
}

/**
 * For a given table, assert that EVERY `.from("<table>")…select(` read statement
 * in `body` also contains `.eq("org_id"` (or the given orgCol) before the
 * statement terminates. Insert/upsert/update statements are ignored (they carry
 * org_id in the payload / are keyed by an org-scoped id). A read statement is the
 * text from `.from("table")` up to the next `;`.
 */
function everyReadOrgScoped(body: string, table: string, orgCol = "org_id"): { total: number; unscoped: number } {
  let total = 0, unscoped = 0;
  const re = new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const start = m.index;
    const end = body.indexOf(";", start);
    const stmt = body.slice(start, end < 0 ? undefined : end);
    // Only READ statements (a .select without insert/upsert/update/delete).
    const isRead = /\.select\(/.test(stmt) && !/\.(insert|upsert|update|delete)\(/.test(stmt);
    if (!isRead) continue;
    total++;
    if (!new RegExp(`\\.eq\\(\\s*["'\`]${orgCol}["'\`]`).test(stmt)) unscoped++;
  }
  return { total, unscoped };
}

// ── 1. TENANT ISOLATION — broker detection chain ────────────────────────────
section("P9.1C · 1 — Broker detection chain is EXPLICITLY org-scoped (tenant-safe under service-role)");
const brokerSrc = read("src/lib/broker/service.ts");
for (const fn of ["ensureBrokerProfilesFromListings", "loadCandidates", "detectForOrg"]) {
  const body = bodyAfter(brokerSrc, `function ${fn}`);
  ok(body.length > 0, `${fn}: body located`);
  for (const table of ["external_listings", "broker_profiles", "broker_aliases"]) {
    const { total, unscoped } = everyReadOrgScoped(body, table);
    if (total === 0) continue;
    ok(unscoped === 0, `${fn}: all ${total} read(s) of "${table}" are org-scoped (${unscoped} unscoped)`);
  }
}

// ── 2. CRON ENTRY POINTS exist + are service-role/org-scoped ─────────────────
section("P9.1C · 2 — Service-role, org-scoped cron entry points exist");
ok(/export async function runBrokerDetectionForOrgServiceRole\(orgId: string\)/.test(brokerSrc), "broker: runBrokerDetectionForOrgServiceRole(orgId) exported");
const brokerCronBody = bodyAfter(brokerSrc, "function runBrokerDetectionForOrgServiceRole");
ok(/createServiceRoleClient/.test(brokerCronBody), "broker cron wrapper uses service-role client");
ok(/detectForOrg\(db, orgId\)[\s\S]*detectForOrg\(db, orgId\)/.test(brokerCronBody), "broker cron wrapper runs TWO converging passes");

const compSrc = read("src/lib/competitor-intelligence/engine.ts");
ok(/export async function runCompetitorIntelligenceSnapshotForOrg\(orgId: string\)/.test(compSrc), "competitor: runCompetitorIntelligenceSnapshotForOrg(orgId) exported");
const compCronBody = bodyAfter(compSrc, "function runCompetitorIntelligenceSnapshotForOrg");
ok(/createServiceRoleClient\(\)/.test(compCronBody), "competitor cron entry builds a service-role access");
ok(/fullMarketView:\s*true/.test(compCronBody), "competitor cron entry uses fullMarketView (no per-agent session scope)");
ok(/orgId,/.test(compCronBody), "competitor cron entry binds the explicit orgId");
ok(/async function snapshotWithAccess\(access: CompetitorAccess\)/.test(compSrc), "competitor: shared snapshotWithAccess(access) used by BOTH entry points");
ok(bodyAfter(compSrc, "function runCompetitorIntelligenceSnapshotJob").includes("snapshotWithAccess(access)"), "session snapshot delegates to snapshotWithAccess");

// ── 3. RELIABLE EXECUTION MODEL in the orchestrator ─────────────────────────
section("P9.1C · 3 — Orchestrator: cron is the deep/reliable path; dashboard load is lightweight");
const orch = read("src/lib/orchestrator/service.ts");
// dashboard/login passive entry runs the LIGHTWEIGHT quick top-up (not "full").
const passiveBranch = orch.slice(orch.indexOf("passiveEntry && process.env.APIFY_TOKEN"), orch.indexOf("} else {", orch.indexOf("passiveEntry && process.env.APIFY_TOKEN")));
ok(/mode:\s*"quick"/.test(passiveBranch), "passive entry (dashboard_load/login) uses quick maintenance only");
ok(!/mode\s*=\s*\(count/.test(passiveBranch), "passive entry no longer runs the heavy adaptive full scan in after()");
// cron runs the adaptive deep scan.
const cronBranch = orch.slice(orch.indexOf('trigger === "scheduled_cron"'), orch.indexOf("passiveEntry && process.env.APIFY_TOKEN"));
ok(/< 800 \? "full" : "quick"/.test(cronBranch), "cron runs the adaptive deep scan (full until populated, then quick)");
// area intelligence runs on cron too (not gated to sessions-only).
const areaStep = bodyAfter(orch, '"area_intelligence"');
ok(/runCompetitorIntelligenceSnapshotForOrg\(organizationId\)/.test(orch), "area_intelligence uses the org-scoped competitor snapshot on cron");
ok(/triggerCityLearning\(organizationId, city/.test(orch), "area_intelligence triggers city learning with explicit org");
ok(!/skippedStep\("area_intelligence"/.test(orch), "area_intelligence is NEVER skipped for cron (runs on every trigger)");
// broker detection has a cron service-role fallback.
ok(/runBrokerDetectionForOrgServiceRole\(organizationId\)/.test(orch), "broker_detection has a cron service-role fallback when external_sync didn't run");
ok(/externalSyncRan/.test(orch), "broker_detection avoids redundant scan when external_sync already detected");

// ── 4. IDEMPOTENCY — overlapping triggers never duplicate ───────────────────
section("P9.1C · 4 — Idempotency: racing triggers upsert on org-qualified conflict keys");
const extSrc = read("src/lib/external-listings/service.ts");
ok(/onConflict:\s*"org_id,source,source_id"/.test(extSrc), "external_listings upsert keyed by org_id,source,source_id");
const compRepo = read("src/lib/competitor-intelligence/repository.ts");
ok(/onConflict:\s*"org_id,normalized_name"/.test(compRepo), "competitor profiles upsert keyed by org_id,normalized_name");
ok(/onConflict:\s*"org_id,competitor_profile_id,market_property_source_id"/.test(compRepo), "competitor links upsert keyed by org+profile+source");
ok(/onConflict:\s*"org_id,competitor_profile_id,city,neighborhood,period,period_start"/.test(compRepo), "competitor area metrics upsert keyed by org+profile+area+period");
// broker profiles: detection dedups by normalized phone/name within the org before insert.
ok(/if \(normPhone && byPhone\.has\(normPhone\)\) continue;/.test(brokerSrc), "broker auto-register dedups by normalized phone within org");
ok(/if \(!normPhone && normName && byName\.has\(normName\)\) continue;/.test(brokerSrc), "broker auto-register dedups by normalized name within org");

// ── 5. CONCURRENCY / LOCK — one run per org, expiry-recoverable ──────────────
section("P9.1C · 5 — Lock: one run per org, expired locks recoverable (no permanent stale lock)");
const locks = read("src/lib/orchestrator/locks.ts");
ok(/organization_id: organizationId/.test(locks) && /lock_token: token/.test(locks), "lock keyed per organization");
ok(/expired && force/.test(locks), "only an EXPIRED lock can be taken over (valid lock never stolen)");
ok(/releaseOrchestratorLock/.test(orch) && /finally/.test(orch), "lock always released in finally");

// ── 6. COMPETITOR REPO — persistence writes carry org_id; org reads scoped ───
section("P9.1C · 6 — Competitor persistence is org-scoped; only PUBLIC market data is shared by city");
const repoBody = compRepo;
ok(/orgCities\([\s\S]*?\.eq\("organization_id", orgId\)/.test(repoBody), "orgCities scoped by organization_id");
ok(/ourActiveByCity\([\s\S]*?\.eq\("org_id", orgId\)/.test(repoBody), "ourActiveByCity scoped by org_id");
ok(/upsertProfile\(orgId[\s\S]*?org_id: orgId/.test(repoBody), "competitor profile write carries org_id");
// market data reads are by city (shared public architecture) — assert they are NOT org-filtered (by design).
ok(/marketListings\([\s\S]*?\.in\("city"/.test(repoBody), "public market listings read by city (shared architecture, by design)");
// orgCities fallback: fresh office with empty user_operating_localities still gets a scope.
const orgCitiesBody = bodyAfter(repoBody, "async orgCities(orgId: string)");
ok(/from\("external_listings"[\s\S]*?\.eq\("org_id", orgId\)/.test(orgCitiesBody), "orgCities fallback derives cities from the org's OWN listings (org-scoped) when localities empty");
ok(orgCitiesBody.includes("if (cities.length) return cities;"), "orgCities prefers explicit localities, falls back only when empty");

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — P9.1C orchestrator QA (${fail} failure${fail === 1 ? "" : "s"})`);
process.exit(fail === 0 ? 0 : 1);
