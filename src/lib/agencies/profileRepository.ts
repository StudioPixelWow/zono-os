// ZONO — Agency profile repository (Phase 26.0, SERVER-ONLY). 1:1 upsert.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "./_context";
import { toProfile } from "./mappers";
import type { AgencyProfile } from "./types";

const COLS = "id,organization_id,agency_id,specialties,service_areas,languages,luxury,commercial,investments,rentals,projects,notes,created_at,updated_at";

export interface UpsertProfileInput {
  agencyId: string; specialties?: string[]; serviceAreas?: string[]; languages?: string[];
  luxury?: boolean; commercial?: boolean; investments?: boolean; rentals?: boolean; projects?: boolean; notes?: string | null;
}

export async function getProfile(agencyId: string): Promise<AgencyProfile | null> {
  const db = await createClient();
  const { data } = await db.from("agency_profiles").select(COLS).eq("agency_id", agencyId).maybeSingle();
  return data ? toProfile(data as Record<string, unknown>) : null;
}

export async function upsertProfile(input: UpsertProfileInput): Promise<AgencyProfile> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data, error } = await db.from("agency_profiles").upsert({
    organization_id: org, agency_id: input.agencyId,
    specialties: input.specialties ?? [], service_areas: input.serviceAreas ?? [], languages: input.languages ?? [],
    luxury: input.luxury ?? false, commercial: input.commercial ?? false, investments: input.investments ?? false,
    rentals: input.rentals ?? false, projects: input.projects ?? false, notes: input.notes ?? null,
  }, { onConflict: "agency_id" }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toProfile(data as Record<string, unknown>);
}
