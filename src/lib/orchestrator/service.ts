// ============================================================================
// ZONO Automation Orchestrator™ — the central pipeline.
// Connects: external sync → transactions → bridge(external→market sources) →
// market snapshots → decision brain → events → alerts → revalidation.
// Additive, best-effort, locked, typed. Reuses existing services (no dupes,
// no fake data). Session-scoped recompute (snapshots/brain) only runs when a
// session is present; cron marks them skipped with an honest reason.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { syncExternalListingsForOrganization } from "@/lib/external-listings/service";
import { refreshRecentTransactionsForOrganization } from "@/lib/transactions/service";
import { generateMarketSnapshotsForOrganization, generateMarketSnapshotsForOrg } from "@/lib/market/service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";
import { runWithServiceRoleOrg } from "@/lib/supabase/server-context";
import { acquireOrchestratorLock, releaseOrchestratorLock } from "./locks";
import { createRunRow, finalizeRunRow, msSinceLastSuccessfulRun } from "./repository";
import { syncExternalListingsToMarketSources, emitMarketEventsAndAlerts, type BridgeResult } from "./events";
import { revalidateZonoRoutes } from "./revalidation";
import { runStep, skippedStep } from "./logger";
import {
  ORCHESTRATOR_STALE_MS, type OrchestratorResult, type OrchestratorRunStatus,
  type OrchestratorStepResult, type RunZonoOrchestratorInput,
} from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

function computeStatus(steps: OrchestratorStepResult[]): OrchestratorRunStatus {
  if (steps.some((s) => s.critical && s.status === "failed")) return "failed";
  if (steps.some((s) => !s.critical && s.status === "failed")) return "partial";
  return "success";
}

/**
 * Run the full ZONO orchestration for one organization. Never throws — always
 * returns a typed result; persists the run; releases the lock in finally.
 */
export async function runZonoOrchestrator(input: RunZonoOrchestratorInput): Promise<OrchestratorResult> {
  const { organizationId, trigger, source = null } = input;
  const userId = input.userId ?? null;
  const force = input.force ?? false;
  const t0 = Date.now();
  const base = (extra: Partial<OrchestratorResult>): OrchestratorResult => ({
    status: "skipped", runId: null, trigger, organizationId, durationMs: Date.now() - t0, steps: [], ...extra,
  });

  // Session-scoped recompute (snapshots/brain/revalidation) only on non-cron triggers.
  const sessionScoped = trigger !== "scheduled_cron";

  // 1) Staleness gate (only for passive triggers, unless force).
  if (!force && (trigger === "login" || trigger === "dashboard_load")) {
    const sinceMs = await msSinceLastSuccessfulRun(organizationId);
    if (sinceMs != null && sinceMs < ORCHESTRATOR_STALE_MS) {
      return base({ skipped: true, skippedReason: `נתונים טריים (לפני ${Math.round(sinceMs / 60000)} דק׳)` });
    }
  }

  // 2) Lock (only one run per org).
  const lock = await acquireOrchestratorLock(organizationId, trigger, userId, force);
  if (!lock) return base({ skipped: true, skippedReason: "אורקסטרציה כבר רצה לארגון זה" });

  let runId: string | null = null;
  const steps: OrchestratorStepResult[] = [];
  try {
    // 3) Critical: organization load.
    const orgStep = await runStep("organization_load", true, async () => {
      const db = createServiceRoleClient() as Db;
      const { data, error } = await db.from("organizations").select("id").eq("id", organizationId).single();
      if (error || !data) throw new Error("organization not found");
      return { summary: "ארגון נטען" };
    });
    steps.push(orgStep);
    if (orgStep.status === "failed") {
      runId = await createRunRow({ organizationId, userId, trigger, source });
      const durationMs = Date.now() - t0;
      if (runId) await finalizeRunRow(runId, { status: "failed", durationMs, steps, error: orgStep.error ?? "org load failed" });
      return base({ status: "failed", runId, durationMs, steps, error: orgStep.error });
    }

    runId = await createRunRow({ organizationId, userId, trigger, source });

    // STEP 1 — External Listings Sync (Yad2/Madlan) — scrape only on cron.
    if (input.skipExternalSync) {
      steps.push(skippedStep("external_sync", "בוצע בסנכרון הצ'אנקים (דפדפן)"));
    } else if (trigger === "scheduled_cron") {
      steps.push(await runStep("external_sync", false, async () => {
        const s = await syncExternalListingsForOrganization(organizationId);
        return { status: s.success ? "success" : "partial", summary: `יד2/מדלן: ${s.inserted} חדשים · ${s.updated} עודכנו` };
      }));
    } else {
      steps.push(skippedStep("external_sync", "סריקה מתבצעת ידנית או ב-cron"));
    }

    // STEP 2 — Government Transactions Sync (best-effort) — cron + manual only.
    if (trigger === "scheduled_cron" || trigger === "manual_sync" || trigger === "transactions_sync_completed") {
      steps.push(await runStep("transactions_sync", false, async () => {
        const r = await refreshRecentTransactionsForOrganization(organizationId);
        return { summary: `עסקאות ממשלתיות: ${r.imported} נוספו` };
      }));
    } else {
      steps.push(skippedStep("transactions_sync", "מדלג בטריגר זה"));
    }

    // STEP 3 — CRITICAL bridge: external_listings → market_property_sources.
    let bridge: BridgeResult = { upserted: 0, newSources: [], priceDrops: [] };
    const bridgeStep = await runStep("market_sources_bridge", true, async () => {
      bridge = await syncExternalListingsToMarketSources(organizationId);
      return { summary: `גשר מקורות שוק: ${bridge.upserted} עודכנו · ${bridge.newSources.length} חדשים · ${bridge.priceDrops.length} ירידות מחיר` };
    });
    steps.push(bridgeStep);

    // STEP 4 — Market Snapshots. Session path uses the session-scoped function;
    // cron path uses the explicit-orgId, service-role variant.
    steps.push(await runStep("market_snapshots", false, async () => {
      const r = sessionScoped
        ? await generateMarketSnapshotsForOrganization()
        : await generateMarketSnapshotsForOrg(organizationId);
      return { summary: `תמונות שוק: ${r.snapshots} אזורים` };
    }));

    // STEP 5 — Decision Brain. Session path runs directly; cron path runs inside
    // the service-role org context so the (now explicitly org-scoped) reads +
    // writes resolve to THIS org only — RLS is bypassed but every query is filtered.
    steps.push(await runStep("decision_brain", false, async () => {
      if (sessionScoped) await initializeOrganizationDecisionBrain();
      else await runWithServiceRoleOrg(organizationId, () => initializeOrganizationDecisionBrain());
      return { summary: "מוח החלטות עודכן" };
    }));

    // STEP 6/7 — Events + Alerts (popups) from the bridged sources.
    if (bridgeStep.status !== "failed") {
      steps.push(await runStep("events_and_alerts", false, async () => {
        const e = await emitMarketEventsAndAlerts(organizationId, bridge);
        return { summary: `אירועים: ${e.newProperties} נכסים חדשים · ${e.priceDrops} ירידות מחיר · ${e.alertsCreated} התראות` };
      }));
    } else {
      steps.push(skippedStep("events_and_alerts", "מדלג — גשר המקורות נכשל"));
    }

    // STEP 8 — Buyer matching / recommendations (not wired into the orchestrator).
    steps.push(skippedStep("buyer_matching", "Service not wired into orchestrator yet"));

    // STEP 9 — Route revalidation (server-action / route-handler contexts only).
    if (!input.skipRevalidation && sessionScoped) {
      steps.push(await runStep("revalidation", false, async () => {
        const n = revalidateZonoRoutes();
        return { summary: `רועננו ${n} מסכים` };
      }));
    } else {
      steps.push(skippedStep("revalidation", input.skipRevalidation ? "מדלג (הקשר לא תומך)" : "cron — אין הקשר בקשה"));
    }

    // STEP 10 — Persist + return.
    const status = computeStatus(steps);
    const durationMs = Date.now() - t0;
    if (runId) await finalizeRunRow(runId, { status, durationMs, steps, error: null });
    return { status, runId, trigger, organizationId, durationMs, steps };
  } catch (e) {
    const durationMs = Date.now() - t0;
    const error = e instanceof Error ? e.message : String(e);
    if (runId) await finalizeRunRow(runId, { status: "failed", durationMs, steps, error });
    return base({ status: "failed", runId, durationMs, steps, error });
  } finally {
    await releaseOrchestratorLock(organizationId, lock.token);
  }
}
