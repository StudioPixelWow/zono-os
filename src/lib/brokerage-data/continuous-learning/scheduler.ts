// ============================================================================
// 🗓️ Continuous Learning — background scheduler (server-only). 26.4.16 · Part 7/9.
// ----------------------------------------------------------------------------
// Enumerates known cities, ranks them by refresh priority, and processes the
// highest-priority city first. One tick = pick the top city → differential
// refresh (reusing the Research Job engine) → evolve office confidence. Designed
// to be called on a schedule (cron / scheduled task) or manually. Never throws.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normCityKb } from "../brokerage-knowledge";
import { getCityBrokerageCensus } from "../brokerage-knowledge";
import { freshnessScore } from "./freshness";
import { classifyCityPriority, rankPriorities } from "./priority";
import { getCityLearningProfile } from "./profile";
import { enqueueCityRefresh, evolveCityOfficeConfidence } from "./refresh";
import type { CityPriority, SchedulerPlan, ContinuousTickResult } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Distinct known cities (representative raw label per normalized city). */
export async function scanKnownCities(limit = 200): Promise<string[]> {
  const db = createServiceRoleClient();
  const [cand, off, ag] = await Promise.all([
    db.from("brokerage_office_candidates" as never).select("city").limit(20000),
    db.from("brokerage_offices" as never).select("city").limit(20000),
    db.from("brokerage_agents" as never).select("city").limit(20000),
  ]);
  const byNorm = new Map<string, string>();
  for (const set of [cand.data, off.data, ag.data]) {
    for (const r of (set ?? []) as Row[]) {
      const raw = s(r.city).trim();
      if (!raw) continue;
      const n = normCityKb(raw);
      if (n && !byNorm.has(n)) byNorm.set(n, raw);
    }
  }
  return [...byNorm.values()].slice(0, limit);
}

/** Rank known cities by refresh priority. `cap` bounds census scans per tick. */
export async function buildSchedulerPlan(orgId: string | null, cap = 12): Promise<SchedulerPlan> {
  const cities = await scanKnownCities();
  const priorities: CityPriority[] = [];
  let scanned = 0;
  for (const city of cities) {
    if (scanned >= cap) break;
    scanned++;
    try {
      const c = await getCityBrokerageCensus(orgId ?? "", city);
      const p = classifyCityPriority({
        city: c.city, cityNormalized: c.cityNormalized,
        waitingCandidates: c.missingKnowledge.unverifiedCandidates,
        unmatchedBrokers: c.brokersUnmatched, unlinkedListings: c.listingsUnlinked,
        coveragePct: c.marketCoveragePct, freshnessScore: freshnessScore(c.lastResearchAt), rawDataExists: c.rawDataExists,
      });
      if (p) priorities.push(p);
    } catch { /* skip city on error */ }
  }
  const queue = rankPriorities(priorities);
  return { scannedCities: scanned, queue, picked: queue[0] ?? null, generatedAt: new Date().toISOString() };
}

export interface ContinuousSweepResult {
  ticks: number; citiesProcessed: number; stoppedReason: string;
  processed: { city: string; reason: string; tier: number; jobStatus: string | null; confidenceEvolved: number; healthBefore: number | null; healthAfter: number | null }[];
}

/**
 * Run MANY ticks in one background pass (for the Vercel cron). Drains the
 * priority queue city-by-city until there's no pending work, the tick cap is
 * hit, or the wall-clock budget is exhausted. Each city is refreshed
 * differentially. Never throws.
 */
export async function runContinuousLearningSweep(maxTicks = 8, totalBudgetMs = 240000, perTickBudgetMs = 18000): Promise<ContinuousSweepResult> {
  const t0 = Date.now();
  const processed: ContinuousSweepResult["processed"] = [];
  let stoppedReason = "no_work";
  let ticks = 0;
  for (; ticks < maxTicks; ticks++) {
    if (Date.now() - t0 > totalBudgetMs - perTickBudgetMs) { stoppedReason = "time_budget"; break; }
    const r = await runContinuousLearningTick(null, perTickBudgetMs).catch(() => null);
    if (!r || !r.ran || !r.picked) { stoppedReason = "no_work"; break; }
    processed.push({
      city: r.picked.city, reason: r.picked.reason, tier: r.picked.tier,
      jobStatus: r.jobStatus, confidenceEvolved: r.confidenceEvolved,
      healthBefore: r.profileBefore?.learningHealth ?? null, healthAfter: r.profileAfter?.learningHealth ?? null,
    });
    if (ticks + 1 >= maxTicks) stoppedReason = "tick_cap";
  }
  return { ticks, citiesProcessed: processed.length, stoppedReason, processed };
}

/** Run ONE scheduler tick: refresh the highest-priority city. */
export async function runContinuousLearningTick(orgId: string | null, executionBudgetMs = 20000): Promise<ContinuousTickResult> {
  const plan = await buildSchedulerPlan(orgId);
  if (!plan.picked) {
    return { ran: false, picked: null, plan, profileBefore: null, profileAfter: null, jobId: null, jobStatus: null, confidenceEvolved: 0, note: "אין ערים עם עבודה ממתינה — כל הידע מעודכן." };
  }
  const picked = plan.picked;
  const profileBefore = await getCityLearningProfile(orgId, picked.city).catch(() => null);
  const refresh = await enqueueCityRefresh(orgId, picked.city, picked.reason, executionBudgetMs);
  const confidenceEvolved = await evolveCityOfficeConfidence(orgId, picked.city).catch(() => 0);
  const profileAfter = await getCityLearningProfile(orgId, picked.city).catch(() => null);
  return {
    ran: true, picked, plan, profileBefore, profileAfter,
    jobId: refresh.jobId, jobStatus: refresh.status, confidenceEvolved,
    note: refresh.note,
  };
}
