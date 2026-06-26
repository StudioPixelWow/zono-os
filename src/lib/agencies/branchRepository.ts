// ZONO — Agency branch repository (Phase 26.0, SERVER-ONLY). Org-scoped.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "./_context";
import { toBranch } from "./mappers";
import type { AgencyBranch } from "./types";

const COLS = "id,organization_id,agency_id,city,neighborhood,address,phone,email,latitude,longitude,created_at";

export interface CreateBranchInput {
  agencyId: string; city?: string | null; neighborhood?: string | null; address?: string | null;
  phone?: string | null; email?: string | null; latitude?: number | null; longitude?: number | null;
}

export async function createBranch(input: CreateBranchInput): Promise<AgencyBranch> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data, error } = await db.from("agency_branches").insert({
    organization_id: org, agency_id: input.agencyId, city: input.city ?? null,
    neighborhood: input.neighborhood ?? null, address: input.address ?? null,
    phone: input.phone ?? null, email: input.email ?? null,
    latitude: input.latitude ?? null, longitude: input.longitude ?? null,
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toBranch(data as Record<string, unknown>);
}

export async function listBranches(agencyId: string): Promise<AgencyBranch[]> {
  const db = await createClient();
  const { data } = await db.from("agency_branches").select(COLS).eq("agency_id", agencyId).order("created_at", { ascending: true });
  return ((data as Record<string, unknown>[] | null) ?? []).map(toBranch);
}

export async function deleteBranch(id: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.from("agency_branches").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
