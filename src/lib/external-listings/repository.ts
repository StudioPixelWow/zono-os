/** External listings repositories — RLS-scoped (server-only). */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];
export type ExternalListingRow = DB["external_listings"]["Row"];
export type ImportJobRow = DB["import_jobs"]["Row"];

export const externalListingRepository = {
  async listForOrg(limit = 100): Promise<ExternalListingRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("external_listings")
      .select("*")
      .neq("status", "removed")
      .order("opportunity_score", { ascending: false })
      .order("imported_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  },
  /** Counts that need sibling tables (price drops + duplicate candidates). */
  async marketStats(): Promise<{ priceDrops: number; duplicateCandidates: number }> {
    const supabase = await createClient();
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [drops, dups] = await Promise.all([
      supabase.from("external_listing_history").select("listing_id", { count: "exact", head: true }).eq("change_type", "price_changed").gte("created_at", since),
      supabase.from("external_listing_duplicates").select("listing_id", { count: "exact", head: true }).eq("status", "suspected"),
    ]);
    return { priceDrops: drops.count ?? 0, duplicateCandidates: dups.count ?? 0 };
  },
  async getById(id: string): Promise<ExternalListingRow | null> {
    const supabase = await createClient();
    const { data } = await supabase.from("external_listings").select("*").eq("id", id).maybeSingle();
    return data ?? null;
  },
  async upsertMany(rows: DB["external_listings"]["Insert"][]): Promise<void> {
    if (!rows.length) return;
    const supabase = await createClient();
    const { error } = await supabase
      .from("external_listings")
      .upsert(rows as never, { onConflict: "org_id,source,source_id" });
    if (error) throw new Error(error.message);
  },
  async markPromoted(listingId: string, propertyId: string): Promise<void> {
    const supabase = await createClient();
    await supabase
      .from("external_listings")
      .update({ promoted_property_id: propertyId, status: "promoted", primary_property_id: propertyId })
      .eq("id", listingId);
  },
};

export const importJobRepository = {
  async create(row: DB["import_jobs"]["Insert"]): Promise<ImportJobRow> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("import_jobs").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return data;
  },
  async update(id: string, patch: DB["import_jobs"]["Update"]): Promise<void> {
    const supabase = await createClient();
    await supabase.from("import_jobs").update(patch).eq("id", id);
  },
  async log(orgId: string, jobId: string, message: string, level = "info"): Promise<void> {
    const supabase = await createClient();
    await supabase.from("import_job_logs").insert({ org_id: orgId, job_id: jobId, message, level });
  },
};
