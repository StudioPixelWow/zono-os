// ============================================================================
// ♻️ Continuous Learning — differential refresh + confidence evolution (server).
// 26.4.16 · Part 3/5/6.
// ----------------------------------------------------------------------------
// A refresh researches ONLY the delta. It reuses the Research Job engine but
// pre-skips AI_SEED/PUBLIC_SEARCH/EXTRACT (no new AI, no new searches) so it just
// drains VERIFY on waiting candidates + rematches brokers + relinks listings.
// Low-coverage cities get a full job. Office confidence evolves gradually (never
// instantly), never overwriting stronger evidence. No schema change.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getBrokerageKnowledgeForCity } from "../brokerage-knowledge";
import { createBrokerageResearchJob, runBrokerageResearchJob } from "../research-jobs/service";
import type { JobStage } from "../research-jobs/types";
import { daysSince, evolveConfidence } from "./freshness";
import type { RefreshReason } from "./types";

// Differential: skip the expensive AI + search stages (INIT still runs cheaply).
const DIFFERENTIAL_SKIP: JobStage[] = ["AI_SEED", "PUBLIC_SEARCH", "EXTRACT"];

export interface RefreshOutcome { jobId: string | null; status: string | null; migrationRequired: boolean; differential: boolean; note: string }

/** Enqueue a city refresh and run one budgeted slice. Differential unless the
 *  city has low coverage (then a full discovery job is created). */
export async function enqueueCityRefresh(orgId: string | null, city: string, reason: RefreshReason, executionBudgetMs = 20000): Promise<RefreshOutcome> {
  const differential = reason !== "low_coverage";
  const created = await createBrokerageResearchJob(orgId, city, { depth: "quick", skipStages: differential ? DIFFERENTIAL_SKIP : undefined });
  if (created.migrationRequired) return { jobId: null, status: null, migrationRequired: true, differential, note: "טבלת המשרות חסרה — יש להריץ מיגרציית 26.4.15." };
  if (!created.ok || !created.job) return { jobId: null, status: null, migrationRequired: false, differential, note: created.error ?? "יצירת רענון נכשלה." };
  const ran = await runBrokerageResearchJob(created.job.id, executionBudgetMs);
  const job = ran.job ?? created.job;
  return {
    jobId: job.id, status: job.status, migrationRequired: false, differential,
    note: differential ? "רענון דיפרנציאלי — אימות מועמדים ממתינים + שיוך מחדש (ללא AI/חיפוש חדש)." : "רענון מלא — כיסוי נמוך דורש גילוי נוסף.",
  };
}

/** Fire-and-forget refresh for data events (never blocks the user action). */
export function enqueueCityRefreshFireAndForget(orgId: string | null, city: string, reason: RefreshReason): void {
  if (!city?.trim()) return;
  void enqueueCityRefresh(orgId, city, reason, 15000).catch((e) => console.error("[continuous] refresh failed:", e));
}

/**
 * Evolve office confidence for a city GRADUALLY from freshness signals. Fresh
 * offices with brokers nudge up; long-silent offices decay slowly. Bounded,
 * floored, never a large jump, never below a manually-verified floor.
 */
export async function evolveCityOfficeConfidence(orgId: string | null, city: string): Promise<number> {
  const db = createServiceRoleClient();
  const kb = await getBrokerageKnowledgeForCity(orgId ?? "", city).catch(() => null);
  if (!kb) return 0;
  let changed = 0;
  for (const o of kb.verifiedOffices) {
    const last = o.lastVerifiedAt || o.lastSeenAt;
    const d = daysSince(last);
    const monthsSinceEvidence = d == null ? null : d / 30;
    const fresh = d != null && d <= 30;
    const increases = fresh && o.brokerCount > 0 ? 1 : 0;
    const next = evolveConfidence(o.confidence, { increases, decreases: 0, monthsSinceEvidence });
    if (next !== o.confidence) {
      const { error } = await db.from("brokerage_offices" as never)
        .update({ confidence_score: next } as never).eq("id", o.id);
      if (!error) changed++;
    }
  }
  return changed;
}
