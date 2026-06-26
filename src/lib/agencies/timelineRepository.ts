// ZONO — Agency timeline repository (Phase 26.0, SERVER-ONLY). Org-scoped.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "./_context";
import { toTimelineEvent } from "./mappers";
import type { AgencyTimelineEvent } from "./types";

const COLS = "id,organization_id,agency_id,event_type,title,description,metadata,event_date,created_at";

export interface CreateTimelineInput {
  agencyId: string; eventType: string; title: string;
  description?: string | null; metadata?: Record<string, unknown>; eventDate?: string;
}

export async function addTimelineEvent(input: CreateTimelineInput): Promise<AgencyTimelineEvent> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data, error } = await db.from("agency_timeline").insert({
    organization_id: org, agency_id: input.agencyId, event_type: input.eventType, title: input.title,
    description: input.description ?? null, metadata: input.metadata ?? {},
    event_date: input.eventDate ?? new Date().toISOString(),
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toTimelineEvent(data as Record<string, unknown>);
}

export async function listTimeline(agencyId: string, limit = 100): Promise<AgencyTimelineEvent[]> {
  const db = await createClient();
  const { data } = await db.from("agency_timeline").select(COLS)
    .eq("agency_id", agencyId).order("event_date", { ascending: false }).limit(limit);
  return ((data as Record<string, unknown>[] | null) ?? []).map(toTimelineEvent);
}
