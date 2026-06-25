/**
 * LOCAL-DEV-ONLY check for the Commercial Launch Platform™ (Phase 21). Pure
 * layers only (no DB, no network, no server-only imports). Verifies: plan
 * entitlements + gating + limits · onboarding progress + step marking ·
 * production score (weighted, deterministic) · diagnostics rollup · release
 * notes (newest-first) · beta resolution (user override wins) · feedback
 * context + validation · usage sanitization (no sensitive content leaks).
 *
 * Run: npx tsx scripts/launch-dev-check.ts
 */
import {
  ENTITLEMENTS, PLANS, PLAN_ORDER, planAllows, upgradeFor, checkLimit, defaultLimits,
  ONBOARDING_STEPS, emptyProgress, computeOnboarding, markStep,
  computeProductionScore,
  DIAGNOSTIC_CHECKS, rollupDiagnostics, buildDiagnosticsReport,
  generateReleaseNotes, currentVersion,
  resolveBetaContext, isBetaActive, betaActiveFor,
  FEEDBACK_TYPES, shortBrowser, buildFeedbackContext, validateFeedback,
  USAGE_CATEGORIES, sanitizeUsageEvent, aggregateByName,
} from "../src/lib/launch";
import type { BetaEnrollment } from "../src/lib/launch";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("ZONO Commercial Launch Platform dev-check\n");

  // 1) Plans & entitlements.
  assert(PLAN_ORDER.length === 4 && PLANS.starter && PLANS.enterprise.features.length === Object.values(ENTITLEMENTS).length, "4 plans; enterprise has every entitlement");
  assert(planAllows("starter", ENTITLEMENTS.PROPERTY_RADAR) && !planAllows("starter", ENTITLEMENTS.OFFICE_INTELLIGENCE), "starter gates office intelligence");
  assert(planAllows("office", ENTITLEMENTS.EXECUTIVE_INTELLIGENCE) && planAllows("enterprise", ENTITLEMENTS.PLATFORM_ADMIN), "office+ unlock executive; enterprise unlocks all");
  assert(upgradeFor("starter", ENTITLEMENTS.OFFICE_INTELLIGENCE) === "office", "upgrade path suggests the right tier");
  assert(upgradeFor("enterprise", ENTITLEMENTS.OFFICE_INTELLIGENCE) === null && upgradeFor("office", ENTITLEMENTS.OFFICE_INTELLIGENCE) === null, "no upgrade when already entitled");

  // 2) Limits.
  const lim = defaultLimits("professional");
  assert(lim.seats === 3 && checkLimit(lim.seats, 2).withinLimit && !checkLimit(lim.seats, 3).withinLimit, "soft limit enforced (3 seats: 2 ok, 3 blocked)");
  assert(checkLimit(-1, 99999).unlimited && checkLimit(-1, 99999).withinLimit, "unlimited (-1) always within limit");

  // 3) Onboarding.
  assert(ONBOARDING_STEPS.length === 8, "8 onboarding steps");
  let prog = emptyProgress();
  let st = computeOnboarding(prog);
  assert(st.percent === 0 && st.nextStep?.key === "org_created" && !st.complete, "empty progress: 0%, next = org_created");
  prog = markStep(prog, "org_created", "2026-06-26T00:00:00Z");
  prog = markStep(prog, "org_created", "2026-06-27T00:00:00Z"); // idempotent
  assert(prog.steps.org_created === "2026-06-26T00:00:00Z", "markStep is idempotent (keeps earliest)");
  for (const s of ONBOARDING_STEPS) prog = markStep(prog, s.key, "2026-06-26T00:00:00Z");
  st = computeOnboarding(prog);
  assert(st.complete && st.percent === 100 && st.nextStep === null && !!prog.completedAt, "all steps done ⇒ 100% complete");

  // 4) Production score.
  const perfect = computeProductionScore({ infrastructure: 1, security: 1, performance: 1, monitoring: 1, reliability: 1 });
  assert(perfect.launchReadinessPercent === 100 && perfect.band === "ready" && perfect.categories.length === 5, "perfect signals ⇒ 100% ready, 5 categories");
  const weak = computeProductionScore({ infrastructure: 0.5, security: 0.5, performance: 0.5, monitoring: 0.5, reliability: 0.5 });
  assert(weak.launchReadinessPercent === 50 && weak.band === "not_ready", "half signals ⇒ 50% not_ready");
  const mixed = computeProductionScore({ infrastructure: 1, security: 0, performance: 1, monitoring: 1, reliability: 1 });
  assert(mixed.launchReadinessPercent === 75, "security weighted (0.25): dropping it ⇒ 75%");
  assert(computeProductionScore({ infrastructure: 2, security: -1, performance: 1, monitoring: 1, reliability: 1 }).categories.every((c) => c.percent >= 0 && c.percent <= 100), "category percents clamped 0..100");

  // 5) Diagnostics.
  assert(DIAGNOSTIC_CHECKS.length === 12, "12 diagnostic checks");
  assert(rollupDiagnostics([]) === "unknown", "empty rollup = unknown");
  assert(rollupDiagnostics([{ key: "a", label: "A", status: "pass" }, { key: "b", label: "B", status: "fail" }]) === "fail", "rollup = worst check");
  assert(buildDiagnosticsReport([{ key: "a", label: "A", status: "warning" }]).overall === "warning", "diagnostics report overall");

  // 6) Release notes.
  const notes = generateReleaseNotes();
  assert(notes.length >= 1 && notes[0]!.date >= notes[notes.length - 1]!.date, "release notes newest-first");
  assert(currentVersion() === notes[0]!.version, "currentVersion = newest");

  // 7) Beta resolution (per-user override wins).
  const rows: BetaEnrollment[] = [
    { orgId: "o", userId: null, enabled: true, channel: "beta" },
    { orgId: "o", userId: "u2", enabled: false, channel: "beta" },
  ];
  assert(isBetaActive(resolveBetaContext(rows, "u1")), "org-wide beta on ⇒ active for normal user");
  assert(!betaActiveFor(rows, "u2"), "per-user opt-out overrides org-wide on");
  const optIn: BetaEnrollment[] = [{ orgId: "o", userId: "u3", enabled: true, channel: "beta" }];
  assert(betaActiveFor(optIn, "u3") && !betaActiveFor(optIn, "u4"), "per-user opt-in without org default");

  // 8) Feedback.
  assert(FEEDBACK_TYPES.length === 4, "4 feedback types");
  assert(shortBrowser("Mozilla/5.0 Chrome/120") === "Chrome" && shortBrowser("... Safari/605") === "Safari", "browser shortening");
  const fctx = buildFeedbackContext({ userAgent: "Chrome/120", appVersion: "1.0.0", roleKey: "admin", page: "/command", correlationId: "corr_1" });
  assert(fctx.browser === "Chrome" && fctx.page === "/command" && fctx.correlationId === "corr_1", "feedback context envelope");
  assert(validateFeedback({ type: "bug", title: "", body: "" }) !== null && validateFeedback({ type: "bug", title: "x", body: "" }) === null, "feedback validation");

  // 9) Usage analytics — must NOT leak sensitive content.
  assert(USAGE_CATEGORIES.length === 7, "7 usage categories");
  const ev = sanitizeUsageEvent({ category: "feature", name: "property_radar.sync", props: { count: 5, ok: true, ownerName: "ישראל", phone: "+972 50 1234567", label: "fast" } });
  assert(!!ev && ev.props.count === 5 && ev.props.ok === true && ev.props.label === "fast", "safe props kept");
  assert(!!ev && !("ownerName" in ev.props) && !("phone" in ev.props) && ev.dropped.includes("ownerName") && ev.dropped.includes("phone"), "sensitive props dropped (name/phone)");
  assert(sanitizeUsageEvent({ category: "feature" as never, name: "" }) === null, "rejects empty name");
  assert(aggregateByName([{ name: "a" }, { name: "a" }, { name: "b" }])[0]!.count === 2, "aggregateByName counts + sorts");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
