// ZONO — Agency resolution-candidate repository (Phase 26.1, SERVER-ONLY). Org-scoped.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import type { CandidateStatus, ResolutionCandidateRecord } from "./types";

const COLS = "id,raw_text,normalized_name,source,source_ref,status,confidence,matched_agency_id,evidence,created_at";

function toRecord(r: Record<string, unknown>): ResolutionCandidateRecord {
  return {
    id: r.id as string, rawText: r.raw_text as string, normalizedName: (r.normalized_name as string) ?? "",
    source: (r.source as string) ?? null, sourceRef: (r.source_ref as string) ?? null,
    status: (r.status as CandidateStatus) ?? "pending", confidence: (r.confidence as number) ?? null,
    matchedAgencyId: (r.matched_agency_id as string) ?? null,
    evidence: (r.evidence && typeof r.evidence === "object" ? r.evidence : {}) as Record<string, unknown>,
    createdAt: r.created_at as string,
  };
}

export interface CreateCandidateInput {
  rawText: string; normalizedName: string; source?: string | null; sourceRef?: string | null;
  status: CandidateStatus; confidence?: number | null; matchedAgencyId?: string | null;
  evidence?: Record<string, unknown>;
}

export async function createCandidate(input: CreateCandidateInput): Promise<ResolutionCandidateRecord> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data, error } = await db.from("agency_resolution_candidates").insert({
    organization_id: org, raw_text: input.rawText, normalized_name: input.normalizedName,
    source: input.source ?? null, source_ref: input.sourceRef ?? null, status: input.status,
    confidence: input.confidence ?? null, matched_agency_id: input.matchedAgencyId ?? null,
    evidence: input.evidence ?? {},
    resolved_at: input.matchedAgencyId ? new Date().toISOString() : null,
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toRecord(data as Record<string, unknown>);
}

export async function listCandidates(status?: CandidateStatus, limit = 100): Promise<ResolutionCandidateRecord[]> {
  const org = await currentOrgId();
  const db = await createClient();
  let req = db.from("agency_resolution_candidates").select(COLS)
    .eq("organization_id", org).order("created_at", { ascending: false }).limit(limit);
  if (status) req = req.eq("status", status);
  const { data } = await req;
  return ((data as Record<string, unknown>[] | null) ?? []).map(toRecord);
}

export async function updateCandidateStatus(id: string, status: CandidateStatus, matchedAgencyId?: string | null): Promise<void> {
  const db = await createClient();
  const patch: Record<string, unknown> = { status, resolved_at: new Date().toISOString() };
  if (matchedAgencyId !== undefined) patch.matched_agency_id = matchedAgencyId;
  const { error } = await db.from("agency_resolution_candidates").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
}
