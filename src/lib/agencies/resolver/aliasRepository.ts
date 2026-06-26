// ZONO — Agency alias repository (Phase 26.1, SERVER-ONLY). Org-scoped.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { normalizeAgencyName } from "../normalize";

export interface AliasRow { agencyId: string; alias: string; normalizedAlias: string }

/** Add an alias for an agency (idempotent on normalized alias). */
export async function addAlias(agencyId: string, alias: string, source = "auto"): Promise<void> {
  const org = await currentOrgId();
  const normalized = normalizeAgencyName(alias);
  if (!normalized) return;
  const db = await createClient();
  await db.from("agency_aliases").upsert(
    { organization_id: org, agency_id: agencyId, alias, normalized_alias: normalized, source },
    { onConflict: "organization_id,agency_id,normalized_alias" },
  );
}

/** All aliases in the org grouped by agency id (normalized). */
export async function listOrgAliases(): Promise<Map<string, string[]>> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data } = await db.from("agency_aliases").select("agency_id,normalized_alias").eq("organization_id", org).limit(5000);
  const map = new Map<string, string[]>();
  for (const r of (data as { agency_id: string; normalized_alias: string }[] | null) ?? []) {
    const arr = map.get(r.agency_id) ?? [];
    arr.push(r.normalized_alias);
    map.set(r.agency_id, arr);
  }
  return map;
}

/** Find an agency by an exact normalized alias (fast dedupe path). */
export async function findAgencyIdByAlias(alias: string): Promise<string | null> {
  const org = await currentOrgId();
  const normalized = normalizeAgencyName(alias);
  if (!normalized) return null;
  const db = await createClient();
  const { data } = await db.from("agency_aliases").select("agency_id")
    .eq("organization_id", org).eq("normalized_alias", normalized).limit(1).maybeSingle();
  return (data?.agency_id as string) ?? null;
}
