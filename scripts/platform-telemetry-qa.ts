// ============================================================================
// ZONO — P6.0 Product Telemetry QA (deterministic, pure-model).
// Proves the canonical telemetry contract without touching the DB:
//   · meaningful-activity classification (auth/platform excluded)
//   · module/action derivation
//   · DAU/WAU/MAU + active-org boundaries
//   · metadata sanitization strips secrets / omits content / bounds size
// Run: npx tsx scripts/platform-telemetry-qa.ts
// ============================================================================
import {
  isMeaningfulEvent, moduleOf, actionOf, isWithinDays, computeActiveCounts,
  moduleUsage, sanitizeTelemetryMetadata, MEANINGFUL_EVENT_TYPES, WINDOW_DAYS, DAY_MS,
  type MeaningfulEvent,
} from "../src/lib/telemetry/model";

let failed = 0;
function ok(cond: boolean, label: string) {
  if (cond) { console.log("  ✓ " + label); } else { console.log("  ✗ " + label); failed++; }
}

const NOW = Date.parse("2026-08-12T12:00:00.000Z");
const ago = (days: number) => new Date(NOW - days * DAY_MS + 60_000).toISOString(); // just inside the window

console.log("P6.0 · meaningful-activity classification");
ok(isMeaningfulEvent("property.created"), "property.created counts as meaningful");
ok(isMeaningfulEvent("lead.stage_changed"), "lead.stage_changed counts as meaningful");
ok(isMeaningfulEvent("task.completed"), "task.completed counts as meaningful");
ok(!isMeaningfulEvent("auth.login"), "auth.login is EXCLUDED from meaningful usage");
ok(!isMeaningfulEvent("nonsense.event"), "unknown event name is NOT meaningful");
ok(MEANINGFUL_EVENT_TYPES.every((t) => !t.startsWith("auth.") && !t.startsWith("platform.") && !t.startsWith("system.")), "allowlist contains no auth/platform/system events");

console.log("\nP6.0 · module / action derivation");
ok(moduleOf("property.stage_changed") === "property", "moduleOf(property.stage_changed) = property");
ok(actionOf("property.stage_changed") === "stage_changed", "actionOf(property.stage_changed) = stage_changed");
ok(moduleOf("recommendation.opened") === "recommendation", "moduleOf(recommendation.opened) = recommendation");

console.log("\nP6.0 · window boundaries");
ok(isWithinDays(ago(0.5), NOW, WINDOW_DAYS.DAU), "0.5d ago is within DAU (1d)");
ok(!isWithinDays(ago(2), NOW, WINDOW_DAYS.DAU), "2d ago is NOT within DAU");
ok(isWithinDays(ago(6), NOW, WINDOW_DAYS.WAU), "6d ago is within WAU (7d)");
ok(!isWithinDays(ago(8), NOW, WINDOW_DAYS.WAU), "8d ago is NOT within WAU");
ok(isWithinDays(ago(29), NOW, WINDOW_DAYS.MAU), "29d ago is within MAU (30d)");
ok(!isWithinDays(ago(31), NOW, WINDOW_DAYS.MAU), "31d ago is NOT within MAU");
ok(!isWithinDays(new Date(NOW + DAY_MS).toISOString(), NOW, WINDOW_DAYS.MAU), "future event is NOT counted");

console.log("\nP6.0 · DAU/WAU/MAU + active-org roll-up");
const events: MeaningfulEvent[] = [
  { organization_id: "orgA", actor_user_id: "u1", event_type: "property.created", occurred_at: ago(0.2) },  // day
  { organization_id: "orgA", actor_user_id: "u1", event_type: "lead.created", occurred_at: ago(0.3) },       // day (same user)
  { organization_id: "orgA", actor_user_id: "u2", event_type: "buyer.created", occurred_at: ago(3) },        // week
  { organization_id: "orgB", actor_user_id: "u3", event_type: "task.completed", occurred_at: ago(20) },      // month
  { organization_id: "orgB", actor_user_id: "u3", event_type: "auth.login", occurred_at: ago(0.1) },         // NON-meaningful, ignored
  { organization_id: "orgB", actor_user_id: null, event_type: "property.viewed", occurred_at: ago(0.1) },    // no actor → org only
];
const cc = computeActiveCounts(events, NOW);
ok(cc.dau === 1, `DAU = 1 (distinct meaningful actors in 1d) [got ${cc.dau}]`);
ok(cc.wau === 2, `WAU = 2 (u1,u2) [got ${cc.wau}]`);
ok(cc.mau === 3, `MAU = 3 (u1,u2,u3) [got ${cc.mau}]`);
ok(cc.activeOrgsWeek === 2, `active orgs (week) = 2 (orgA via CRM; orgB via property.viewed@0.1d) [got ${cc.activeOrgsWeek}]`);
ok(cc.activeOrgsMonth === 2, `active orgs (month) = 2 (orgA,orgB) [got ${cc.activeOrgsMonth}]`);
ok(cc.events24h === 3, `events24h = 3 (2 orgA meaningful + orgB viewed; auth.login excluded) [got ${cc.events24h}]`);
const mu = moduleUsage(events, NOW, 30);
ok((mu.get("property") ?? 0) === 2, `property module events (30d) = 2 [got ${mu.get("property") ?? 0}]`);
ok(!mu.has("auth"), "auth module never appears in module usage");

console.log("\nP6.0 · metadata sanitization (privacy)");
const dirty = { priority: "high", api_key: "sk-secret", access_token: "abc", message: "hello client", body: "raw text", nested: { a: 1 }, count: 5, flag: true, note: "x".repeat(400) };
const clean = sanitizeTelemetryMetadata(dirty);
ok(clean.api_key === "[redacted]", "api_key redacted");
ok(clean.access_token === "[redacted]", "access_token redacted");
ok(clean.message === "[omitted]", "free-text 'message' omitted (no content)");
ok(clean.body === "[omitted]", "free-text 'body' omitted");
ok(clean.nested === "{…}", "nested object collapsed");
ok(clean.priority === "high" && clean.count === 5 && clean.flag === true, "safe scalar fields preserved");
ok(typeof clean.note === "string" && (clean.note as string).length <= 257, "long string truncated");
ok(sanitizeTelemetryMetadata(null) && Object.keys(sanitizeTelemetryMetadata(null)).length === 0, "null metadata → {}");

console.log("");
if (failed === 0) console.log("ALL CHECKS PASSED");
else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
