// ============================================================================
// ZONO — Agency Scoring repository (Phase 26.5, SERVER-ONLY). Org-scoped.
// Idempotent 1:1 upsert (onConflict agency_id) writing the full score set +
// competition_threat, data_confidence, score_breakdown and the period covered.
// Reuses the existing agency_scores mapper for reads.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { toScore } from "../mappers";
import type { AgencyScore } from "../types";
import type { AgencyScoreResult } from "./agencyScoringTypes";

const COLS =
  "id,organization_id,agency_id,market_strength,growth,digital,luxury,inventory,coverage,projects,reputation,momentum,overall,competition_threat,data_confidence,score_breakdown,period_start,period_end,calculated_at,updated_at";

const SCORE_COLUMN: Record<string, string> = {
  marketStrength: "market_strength", growth: "growth", digital: "digital", luxury: "luxury",
  inventory: "inventory", coverage: "coverage", projects: "projects", reputation: "reputation",
  momentum: "momentum", competitionThreat: "competition_threat", overall: "overall",
};

export async function getScore(agencyId: string): Promise<AgencyScore | null> {
  const db = await createClient();
  const { data } = await db.from("agency_scores").select(COLS).eq("agency_id", agencyId).maybeSingle();
  return data ? toScore(data as unknown as Record<string, unknown>) : null;
}

export interface UpsertFullScoreInput {
  agencyId: string;
  result: AgencyScoreResult;
  periodStart: string;
  periodEnd: string;
  calculatedAt: string;
}

export async function upsertFullScore(input: UpsertFullScoreInput): Promise<AgencyScore> {
  const org = await currentOrgId();
  const db = await createClient();
  const r = input.result;
  const { data, error } = await db.from("agency_scores").upsert({
    organization_id: org, agency_id: input.agencyId,
    market_strength: r.marketStrength, growth: r.growth, digital: r.digital, luxury: r.luxury,
    inventory: r.inventory, coverage: r.coverage, projects: r.projects, reputation: r.reputation,
    momentum: r.momentum, overall: r.overall, competition_threat: r.competitionThreat,
    data_confidence: r.dataConfidence,
    score_breakdown: { breakdown: r.breakdown, missing: r.missing },
    period_start: input.periodStart, period_end: input.periodEnd, calculated_at: input.calculatedAt,
  } as never, { onConflict: "agency_id" }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toScore(data as unknown as Record<string, unknown>);
}

/** Top agencies in the org by a chosen score column. */
export async function getTopByScore(scoreType: string, limit = 20): Promise<AgencyScore[]> {
  const org = await currentOrgId();
  const db = await createClient();
  const col = SCORE_COLUMN[scoreType] ?? "overall";
  const { data } = await db.from("agency_scores").select(COLS)
    .eq("organization_id", org).order(col, { ascending: false, nullsFirst: false }).limit(limit);
  return ((data as unknown as Record<string, unknown>[] | null) ?? []).map(toScore);
}
