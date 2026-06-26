// ZONO — Agency score repository (Phase 26.0, SERVER-ONLY). 1:1 upsert.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "./_context";
import { toScore } from "./mappers";
import type { AgencyScore } from "./types";

const COLS = "id,organization_id,agency_id,market_strength,growth,digital,luxury,inventory,coverage,projects,reputation,momentum,overall,updated_at";

export interface UpsertScoreInput {
  agencyId: string;
  marketStrength?: number | null; growth?: number | null; digital?: number | null; luxury?: number | null;
  inventory?: number | null; coverage?: number | null; projects?: number | null; reputation?: number | null;
  momentum?: number | null; overall?: number | null;
}

export async function getScore(agencyId: string): Promise<AgencyScore | null> {
  const db = await createClient();
  const { data } = await db.from("agency_scores").select(COLS).eq("agency_id", agencyId).maybeSingle();
  return data ? toScore(data as Record<string, unknown>) : null;
}

export async function upsertScore(input: UpsertScoreInput): Promise<AgencyScore> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data, error } = await db.from("agency_scores").upsert({
    organization_id: org, agency_id: input.agencyId,
    market_strength: input.marketStrength ?? null, growth: input.growth ?? null, digital: input.digital ?? null,
    luxury: input.luxury ?? null, inventory: input.inventory ?? null, coverage: input.coverage ?? null,
    projects: input.projects ?? null, reputation: input.reputation ?? null, momentum: input.momentum ?? null,
    overall: input.overall ?? null,
  }, { onConflict: "agency_id" }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toScore(data as Record<string, unknown>);
}
