/**
 * Property Intelligence repositories — RLS-scoped data access (server-only).
 *
 * Nine grouped repositories, one per table. All reads/writes go through the
 * cookie server client so Postgres RLS keeps everything org-scoped. Never
 * import from a Client Component; never use the service-role client here.
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];
export type IntelligenceProfileRow = DB["property_intelligence_profiles"]["Row"];
export type BlueprintRow = DB["property_blueprints"]["Row"];
export type MissionRow = DB["property_missions"]["Row"];
export type LeverRow = DB["property_levers"]["Row"];
export type RiskRow = DB["property_risks"]["Row"];
export type ExposureRow = DB["property_exposure_channels"]["Row"];
export type TouchpointRow = DB["property_seller_touchpoints"]["Row"];
export type CalendarPlanRow = DB["property_calendar_plans"]["Row"];
export type ScoreEventRow = DB["property_score_events"]["Row"];

type ProfileInsert = DB["property_intelligence_profiles"]["Insert"];
type ProfileUpdate = DB["property_intelligence_profiles"]["Update"];

// ── 1) Intelligence profiles ─────────────────────────────────────────────────
export const propertyIntelligenceRepository = {
  async getByProperty(propertyId: string): Promise<IntelligenceProfileRow | null> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_intelligence_profiles")
      .select("*")
      .eq("property_id", propertyId)
      .maybeSingle();
    return data ?? null;
  },
  async create(row: ProfileInsert): Promise<IntelligenceProfileRow> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("property_intelligence_profiles")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async update(propertyId: string, patch: ProfileUpdate): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("property_intelligence_profiles")
      .update(patch)
      .eq("property_id", propertyId);
    if (error) throw new Error(error.message);
  },
  /** Profiles for the org (for dashboard widgets), newest-calculated first. */
  async listForOrg(): Promise<IntelligenceProfileRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_intelligence_profiles")
      .select("*")
      .limit(500);
    return data ?? [];
  },
};

// ── 2) Blueprints ────────────────────────────────────────────────────────────
export const propertyBlueprintRepository = {
  async getByName(name: string): Promise<BlueprintRow | null> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_blueprints")
      .select("*")
      .eq("name", name)
      .order("is_system_default", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  },
  async list(): Promise<BlueprintRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_blueprints")
      .select("*")
      .eq("is_active", true);
    return data ?? [];
  },
};

// ── helpers for child-table repos ────────────────────────────────────────────
async function insertMany<T extends keyof DB>(
  table: T,
  rows: DB[T]["Insert"][],
): Promise<void> {
  if (!rows.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert(rows as never);
  if (error) throw new Error(error.message);
}

// ── 3) Missions ──────────────────────────────────────────────────────────────
export const propertyMissionRepository = {
  async listByProperty(propertyId: string): Promise<MissionRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_missions")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true });
    return data ?? [];
  },
  insertMany: (rows: DB["property_missions"]["Insert"][]) =>
    insertMany("property_missions", rows),
  async updateProgress(id: string, currentValue: number): Promise<void> {
    const supabase = await createClient();
    await supabase
      .from("property_missions")
      .update({ current_value: currentValue })
      .eq("id", id);
  },
};

// ── 4) Levers ────────────────────────────────────────────────────────────────
export const propertyLeverRepository = {
  async listByProperty(propertyId: string): Promise<LeverRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_levers")
      .select("*")
      .eq("property_id", propertyId)
      .order("impact_score", { ascending: false });
    return data ?? [];
  },
  insertMany: (rows: DB["property_levers"]["Insert"][]) =>
    insertMany("property_levers", rows),
  async setStatus(id: string, status: string, relatedTaskId?: string): Promise<void> {
    const supabase = await createClient();
    const patch: DB["property_levers"]["Update"] = { status };
    if (relatedTaskId) patch.related_task_id = relatedTaskId;
    await supabase.from("property_levers").update(patch).eq("id", id);
  },
  async getById(id: string): Promise<LeverRow | null> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_levers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ?? null;
  },
};

// ── 5) Risks ─────────────────────────────────────────────────────────────────
export const propertyRiskRepository = {
  async listByProperty(propertyId: string): Promise<RiskRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_risks")
      .select("*")
      .eq("property_id", propertyId)
      .order("detected_at", { ascending: false });
    return data ?? [];
  },
  async listOpen(propertyId: string): Promise<RiskRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_risks")
      .select("*")
      .eq("property_id", propertyId)
      .eq("status", "open");
    return data ?? [];
  },
  insertMany: (rows: DB["property_risks"]["Insert"][]) =>
    insertMany("property_risks", rows),
  async resolve(id: string): Promise<void> {
    const supabase = await createClient();
    await supabase
      .from("property_risks")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);
  },
  /** Delete the property's open risks (used before re-detecting on recalc). */
  async clearOpen(propertyId: string): Promise<void> {
    const supabase = await createClient();
    await supabase
      .from("property_risks")
      .delete()
      .eq("property_id", propertyId)
      .eq("status", "open");
  },
};

// ── 6) Exposure channels ─────────────────────────────────────────────────────
export const propertyExposureRepository = {
  async listByProperty(propertyId: string): Promise<ExposureRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_exposure_channels")
      .select("*")
      .eq("property_id", propertyId)
      .order("channel", { ascending: true });
    return data ?? [];
  },
  async ensureChannels(rows: DB["property_exposure_channels"]["Insert"][]): Promise<void> {
    if (!rows.length) return;
    const supabase = await createClient();
    await supabase
      .from("property_exposure_channels")
      .upsert(rows as never, { onConflict: "property_id,channel", ignoreDuplicates: true });
  },
  async setStatus(id: string, status: string): Promise<void> {
    const supabase = await createClient();
    await supabase
      .from("property_exposure_channels")
      .update({ status, published_at: status === "published" ? new Date().toISOString() : null })
      .eq("id", id);
  },
};

// ── 7) Seller touchpoints ────────────────────────────────────────────────────
export const propertySellerTrustRepository = {
  async listByProperty(propertyId: string): Promise<TouchpointRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_seller_touchpoints")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  },
  async insert(row: DB["property_seller_touchpoints"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("property_seller_touchpoints").insert(row);
    if (error) throw new Error(error.message);
  },
};

// ── 8) Calendar plans ────────────────────────────────────────────────────────
export const propertyCalendarPlanRepository = {
  async listByProperty(propertyId: string): Promise<CalendarPlanRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_calendar_plans")
      .select("*")
      .eq("property_id", propertyId)
      .order("suggested_date", { ascending: true });
    return data ?? [];
  },
  insertMany: (rows: DB["property_calendar_plans"]["Insert"][]) =>
    insertMany("property_calendar_plans", rows),
  async setStatus(id: string, status: string): Promise<void> {
    const supabase = await createClient();
    await supabase.from("property_calendar_plans").update({ status }).eq("id", id);
  },
};

// ── 9) Score events ──────────────────────────────────────────────────────────
export const propertyScoreRepository = {
  async listByProperty(propertyId: string, limit = 50): Promise<ScoreEventRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("property_score_events")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  },
  insertMany: (rows: DB["property_score_events"]["Insert"][]) =>
    insertMany("property_score_events", rows),
};
