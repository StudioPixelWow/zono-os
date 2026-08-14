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

    // STEP 1 — External Listings Sync (Yad2/Madlan).
    // P9.0D: refresh listings on ENTRY too (login/dashboard_load), not just cron,
    // so the office's data updates every time they come in. Cost stays bounded:
    // gated on APIFY_TOKEN, BOUNDED quick mode on passive triggers, and the whole
    // orchestrator is already staleness-gated (ORCHESTRATOR_STALE_MS) for these
    // triggers — so it scrapes at most once per stale-window per org, not on every
    // render. Cron keeps the full nightly refresh.
    // P9.1C — RELIABLE EXECUTION MODEL:
    //  • scheduled_cron  → the DEEP, adaptive catch-up scan (reaches ~1000 where
    //    providers return it). This is the reliable, session-independent path.
    //  • dashboard_load/login → LIGHTWEIGHT "quick" maintenance top-up ONLY. The
    //    heavy scan NO LONGER runs inside the dashboard `after()` (that best-effort
    //    post-response work was being dropped/killed on Vercel and blew the
    //    function budget). Business-critical depth lives on cron; on-entry is a
    //    small freshness check that is fine to miss because cron guarantees it.
    const passiveEntry = trigger === "login" || trigger === "dashboard_load";
    let externalSyncRan = false; // did syncOrg (which runs broker detection) execute?
    if (input.skipExternalSync) {
      steps.push(skippedStep("external_sync", "בוצע בסנכרון הצ'אנקים (דפדפן)"));
    } else if (trigger === "scheduled_cron") {
      steps.push(await runStep("external_sync", false, async () => {
        // Adaptive depth: while the office is still below a useful market picture
        // it gets a FULL catch-up scan (≤500/city/source ≈ ~1000 for a single-city
        // office); once populated it drops to "quick" nightly maintenance. Bounded
        // (per-city + per-run city caps) and self-checkpointing under its wall-clock
        // budget, so cost stays predictable. Honest: never guaranteed 1000 — that
        // depends on how many listings the providers actually return.
        const db = createServiceRoleClient() as Db;
        const { count } = await db.from("external_listings").select("id", { count: "exact", head: true }).eq("org_id", organizationId);
        const mode = (count ?? 0) < 800 ? "full" : "quick";
        const s = await syncExternalListingsForOrganization(organizationId, { mode });
        externalSyncRan = true;
        return { status: s.success ? "success" : "partial", summary: `יד2/מדלן (${mode}): ${s.inserted} חדשים · ${s.updated} עודכנו` };
      }));
    } else if (passiveEntry && process.env.APIFY_TOKEN) {
      steps.push(await runStep("external_sync", false, async () => {
        // Lightweight maintenance only — bounded "quick" top-up. Depth is cron's job.
        const s = await syncExternalListingsForOrganization(organizationId, { mode: "quick" });
        externalSyncRan = true;
        return { status: s.success ? "success" : "partial", summary: `יד2/מדלן (רענון קל): ${s.inserted} חדשים · ${s.updated} עודכנו` };
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

    // STEP 3.5 — Broker detection. Auto-identifies brokers among the freshly
    // scanned listings (registers broker/agency publishers, matches private
    // listings that share a broker's phone/name, badges each listing) so
    // "מודיעין מתווכים" is populated WITHOUT a manual "זהה מתווכים" click.
    // Session-only + RLS-safe: runBrokerDetectionForOrg resolves the org from the
    // session and runs under RLS (its queries are org-scoped by policy, NOT by an
    // explicit filter) — so it must NEVER be called with a service-role client.
    // Cron detection is handled separately; here we skip it honestly.
    // Session path uses the RLS wrapper. Cron path: detection ALREADY ran inside
    // the external_sync (syncOrg → detectForOrg, now explicitly org-scoped and
    // therefore tenant-safe under service-role), so we skip the redundant scan.
    // If cron ran WITHOUT external_sync (skipped/failed), we still detect via the
    // service-role, org-scoped wrapper so brokers are never left stale on cron.
    if (sessionScoped) {
      steps.push(await runStep("broker_detection", false, async () => {
        const { runBrokerDetectionForOrg } = await import("@/lib/broker/service");
        // TWO passes converge in one refresh: pass 1 classifies each listing
        // (broker/agency/private) and registers publishers that were ALREADY
        // broker-typed; on a fresh office that's 0. Pass 2 now SEES the freshly
        // classified broker/agency listings, creates their broker_profiles, and
        // matches private listings that share a broker's phone/name. Idempotent.
        await runBrokerDetectionForOrg();
        const d = await runBrokerDetectionForOrg();
        return { summary: `מתווכים: ${d.matched} זוהו · ${d.needsReview} לבדיקה · ${d.unknown} פרטיים` };
      }));
    } else if (!externalSyncRan) {
      steps.push(await runStep("broker_detection", false, async () => {
        const { runBrokerDetectionForOrgServiceRole } = await import("@/lib/broker/service");
        const d = await runBrokerDetectionForOrgServiceRole(organizationId);
        return { summary: `מתווכים (cron): ${d.matched} זוהו · ${d.needsReview} לבדיקה · ${d.unknown} פרטיים` };
      }));
    } else {
      steps.push(skippedStep("broker_detection", "בוצע במסגרת סנכרון המקורות"));
    }

    // STEP 3.6 — Area intelligence. The moment the office's city has scanned
    // data, AUTO-START competitor research + area/brokerage knowledge — the same
    // principle as the automatic city scan (a new office is never a cold system).
    // Both engines are session-scoped and self-throttle (city-learning 6h; the
    // competitor snapshot is idempotent per day), so entering the dashboard keeps
    // them fresh without a manual click. Best-effort: never breaks the run.
    // P9.1C — area intelligence now runs on the CRON path too (not only sessions),
    // using tenant-safe, explicitly org-scoped entry points that need no session:
    //  • triggerCityLearning(orgId, city, …) already takes an explicit org.
    //  • runCompetitorIntelligenceSnapshotForOrg(orgId) is the service-role variant
    //    (org-scoped writes; only PUBLIC market data is read by city).
    // This is what makes competitor research + area knowledge AUTOMATIC without the
    // customer keeping the dashboard open.
    {
      steps.push(await runStep("area_intelligence", false, async () => {
        let learned = "—";
        try {
          const db = createServiceRoleClient() as Db;
          const { data } = await db.from("organizations").select("city").eq("id", organizationId).single();
          const city = (data?.city as string | null) ?? null;
          if (city) {
            const { triggerCityLearning } = await import("@/lib/brokerage-data/city-learning-trigger");
            const o = await triggerCityLearning(organizationId, city, "external_listing_city_detected");
            learned = o.actionTaken;
          }
        } catch (e) { console.error("[orchestrator] city learning skipped:", e); }
        let competitors = "—";
        try {
          const engine = await import("@/lib/competitor-intelligence/engine");
          if (sessionScoped) {
            await engine.runCompetitorIntelligenceSnapshotJob();
          } else {
            await engine.runCompetitorIntelligenceSnapshotForOrg(organizationId);
          }
          competitors = "עודכן";
        } catch (e) { console.error("[orchestrator] competitor snapshot skipped:", e); }
        // P9.1D — Office intelligence: auto-populate the broker→office graph from
        // the SAME automatic pipeline. Deterministic + tenant-safe, no external
        // keys, no fabrication:
        //  • resolveBrokerageLinksForOrg(orgId) — org-scoped read of THIS org's
        //    has_agent listings; seeds global broker agents + writes the org-scoped
        //    external_listing_links bridge.
        //  • resolveBrokerOfficesForOrg(orgId) — clusters agents into offices ONLY
        //    on real shared-phone evidence (isAcceptableOfficeName guard), so a
        //    "מודיעין משרדים" landscape appears for the city with no manual action.
        let offices = "—";
        try {
          const { resolveBrokerageLinksForOrg } = await import("@/lib/brokerage-data/service");
          const { resolveBrokerOfficesForOrg } = await import("@/lib/brokerage-data/office-resolution");
          const links = await resolveBrokerageLinksForOrg(organizationId, { recordAudit: false });
          const off = await resolveBrokerOfficesForOrg(organizationId);
          offices = `${links.linksCreated} קישורים · ${off.officeCandidatesCreated} משרדים`;
        } catch (e) { console.error("[orchestrator] office resolution skipped:", e); }
        return { summary: `ידע אזור: ${learned} · חקר מתחרים: ${competitors} · משרדים: ${offices}` };
      }));
    }

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
