// ZONO — Agency signal repository (Phase 26.0, SERVER-ONLY). Org-scoped.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "./_context";
import { toSignal } from "./mappers";
import type { AgencySignal, AgencySignalSeverity } from "./types";

const COLS = "id,organization_id,agency_id,signal_type,severity,title,description,metadata,created_at";

export interface CreateSignalInput {
  agencyId: string; signalType: string; title: string;
  severity?: AgencySignalSeverity | null; description?: string | null; metadata?: Record<string, unknown>;
}

export async function createSignal(input: CreateSignalInput): Promise<AgencySignal> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data, error } = await db.from("agency_signals").insert({
    organization_id: org, agency_id: input.agencyId, signal_type: input.signalType,
    severity: input.severity ?? "info", title: input.title, description: input.description ?? null,
    metadata: input.metadata ?? {},
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toSignal(data as Record<string, unknown>);
}

export async function listSignals(agencyId: string, limit = 50): Promise<AgencySignal[]> {
  const db = await createClient();
  const { data } = await db.from("agency_signals").select(COLS)
    .eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(limit);
  return ((data as Record<string, unknown>[] | null) ?? []).map(toSignal);
}
