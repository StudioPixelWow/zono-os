/**
 * LOCAL-DEV-ONLY check for the ZI Diagnostics Engine (Phase 24). Pure layers only
 * (no DB, no network). Verifies: deterministic checks per issue type · honest
 * status (healthy/warning/critical) · Hebrew explanation structure · redacted
 * support payload (no secrets / raw data) · route→issue inference.
 *
 * Run: npx tsx scripts/zi-diagnostics-dev-check.ts
 */
import { runZIDiagnostics, inferIssueType } from "../src/lib/zi-expert/diagnostics";
import { runChecks } from "../src/lib/zi-expert/diagnostic-checks";
import type { DiagnosticInput, DiagnosticSignals } from "../src/lib/zi-expert/diagnostic-types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const identity = { orgId: "org-1", userId: "user-1", role: "owner" as const };

/** A "healthy" baseline snapshot. */
function healthy(): DiagnosticSignals {
  return {
    role: "owner", operatingAreaCount: 3,
    hasAiProvider: true, aiDisabled: false, hasMapsBrowserKey: true, hasGeocodeKey: true,
    hasApifyToken: true, hasCronSecret: true,
    lastSync: { status: "succeeded", finishedAt: new Date().toISOString(), startedAt: new Date().toISOString(), found: 120, error: null },
    externalActiveCount: 120, externalWithCoords: 118,
    internalPropertyCount: 8, internalWithCoords: 8,
    activeBuyerCount: 14, buyersWithBudget: 12, recentNotificationCount: 5,
  };
}

function main(): void {
  console.log("ZI Diagnostics dev-check\n");

  // 1) Route → issue inference.
  console.log("Issue inference:");
  assert(inferIssueType({ currentRoute: "/property-radar", module: null }) === "property_radar_empty", "radar route → property_radar_empty");
  assert(inferIssueType({ currentRoute: "/market", module: "heatmap" }) === "map_empty", "map/heatmap → map_empty");
  assert(inferIssueType({ currentRoute: "/matches", module: null }) === "buyer_matching_zero", "matches → buyer_matching_zero");
  assert(inferIssueType({ currentRoute: "/x", module: null, issueType: "ai_unavailable" }) === "ai_unavailable", "explicit issueType wins");

  // 2) Map empty — missing browser key is critical.
  console.log("\nmap_empty checks:");
  const noKey = { ...healthy(), hasMapsBrowserKey: false };
  const m1 = runChecks("map_empty", noKey);
  assert(m1.status === "critical", "missing maps browser key → critical");
  assert(m1.findings.some((f) => f.id === "no_maps_key"), "reports no_maps_key finding");
  const noCoords = { ...healthy(), externalWithCoords: 0, internalWithCoords: 0 };
  const m2 = runChecks("map_empty", noCoords);
  assert(m2.findings.some((f) => f.id === "no_coords") && m2.likelyCause !== null, "no coordinates → warning + likely cause");

  // 3) Property radar empty — no operating area is critical.
  console.log("\nproperty_radar_empty checks:");
  const noArea = { ...healthy(), operatingAreaCount: 0, externalActiveCount: 0 };
  const r1 = runChecks("property_radar_empty", noArea);
  assert(r1.status === "critical" && r1.likelyCause !== null, "no operating area → critical with cause");
  assert(runChecks("property_radar_empty", healthy()).status === "healthy", "healthy radar → healthy");

  // 4) AI unavailable.
  console.log("\nai_unavailable checks:");
  assert(runChecks("ai_unavailable", { ...healthy(), aiDisabled: true }).findings.some((f) => f.id === "ai_disabled"), "ZONO_AI_DISABLED detected");
  assert(runChecks("ai_unavailable", { ...healthy(), hasAiProvider: false }).findings.some((f) => f.id === "ai_no_key"), "missing AI key detected");

  // 5) Sync failed surfaces the (trimmed) error.
  console.log("\nprovider_sync_failed checks:");
  const failed = { ...healthy(), lastSync: { status: "failed", finishedAt: null, startedAt: null, found: 0, error: "boom" } };
  const s1 = runChecks("provider_sync_failed", failed);
  assert(s1.status === "critical" && (s1.likelyCause ?? "").includes("boom"), "failed sync → critical, cause includes error");

  // 6) Full orchestrator output + Hebrew explanation + redacted payload.
  console.log("\nOrchestrator + explanation + redaction:");
  const input: DiagnosticInput = { currentRoute: "/property-radar", module: "רדאר נכסים" };
  const res = runZIDiagnostics(input, noArea, identity, "Mozilla/5.0 test");
  assert(res.issueType === "property_radar_empty", "orchestrator infers issue type");
  assert(res.explanation.includes("מצאתי את הבעיה") && res.explanation.includes("מה אפשר לעשות עכשיו") && res.explanation.includes("מתי לפנות לתמיכה"), "explanation has the 4 Hebrew sections");
  assert(res.userNextSteps.length > 0 && res.relatedScreens.length > 0, "has user steps + related screens");
  const sp = res.supportPayload;
  assert(sp.correlationId.startsWith("zi-dx-") && sp.orgId === "org-1", "support payload has correlation id + org");
  assert(sp.findings.every((f) => Object.keys(f).length === 3), "payload findings carry id/severity/title only (no detail)");
  // Guard against actual secret VALUES leaking (not env-var names, which are
  // intentionally shown as admin guidance like "APIFY_TOKEN חסר").
  const blob = JSON.stringify(res);
  assert(!/AIza[\w-]{12}|sk-[A-Za-z0-9]{12}|eyJ[\w-]{12}|service_role/.test(blob), "no secret VALUES (api keys / tokens) leak into the result");
  assert(!JSON.stringify(res.supportPayload).match(/חסר|GOOGLE_MAPS|APIFY|CRON_SECRET/), "support ticket payload carries no env-var detail (titles only)");

  // 7) Healthy path returns a calm, non-alarming result.
  console.log("\nHealthy path:");
  const ok = runZIDiagnostics({ currentRoute: "/property-radar", module: null }, healthy(), identity);
  assert(ok.status === "healthy" && ok.summary.includes("תקין"), "healthy → reassuring summary");

  console.log(`\n${failures === 0 ? "✅ ALL ZI DIAGNOSTICS CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
