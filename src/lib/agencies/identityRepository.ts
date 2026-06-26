// ZONO — Agency identity-match repository (Phase 26.0, SERVER-ONLY). Org-scoped.
// Stores every AI/heuristic identity match with its evidence + confidence.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "./_context";
import { toIdentityMatch } from "./mappers";
import type { AgencyIdentityMatch } from "./types";

const COLS = "id,organization_id,agency_id,source,source_url,matched_name,confidence,evidence,created_at";

export interface CreateIdentityMatchInput {
  agencyId: string; source: string; sourceUrl?: string | null; matchedName?: string | null;
  confidence?: number | null; evidence?: Record<string, unknown>;
}

export async function recordIdentityMatch(input: CreateIdentityMatchInput): Promise<AgencyIdentityMatch> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data, error } = await db.from("agency_identity_matches").insert({
    organization_id: org, agency_id: input.agencyId, source: input.source,
    source_url: input.sourceUrl ?? null, matched_name: input.matchedName ?? null,
    confidence: input.confidence ?? null, evidence: input.evidence ?? {},
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toIdentityMatch(data as Record<string, unknown>);
}

export async function listIdentityMatches(agencyId: string, limit = 50): Promise<AgencyIdentityMatch[]> {
  const db = await createClient();
  const { data } = await db.from("agency_identity_matches").select(COLS)
    .eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(limit);
  return ((data as Record<string, unknown>[] | null) ?? []).map(toIdentityMatch);
}
