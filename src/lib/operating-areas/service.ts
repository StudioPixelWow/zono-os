/**
 * Agent Operating Areas — management service (server-only).
 *
 * Lets an agent (or a manager, for their org's agents) manage multiple working
 * cities AFTER onboarding on top of the EXISTING user_operating_localities:
 * add a city, set primary, toggle how each city feeds intelligence, enable /
 * disable, and run a best-effort sync. Adding/disabling never deletes data.
 * When the primary changes, users.primary_city is kept in sync for backward
 * compatibility with every engine that already reads it. No duplicate area model.
 */
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];
type AreaRow = DB["user_operating_localities"]["Row"];

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, agent: 40, viewer: 20 };

export interface OperatingArea {
  id: string;
  userId: string;
  localityId: string;
  cityName: string;
  isPrimary: boolean;
  isActive: boolean;
  neighborhoods: string[];
  neighborhoodsCount: number;
  useForLeads: boolean;
  useForProperties: boolean;
  useForTransactions: boolean;
  useForExternalListings: boolean;
  useForRecommendations: boolean;
  lastSyncAt: string | null;
  addedAt: string;
}

export interface AddAreaOptions {
  targetUserId?: string;
  neighborhoods?: string[];
  isPrimary?: boolean;
  useForLeads?: boolean;
  useForProperties?: boolean;
  useForTransactions?: boolean;
  useForExternalListings?: boolean;
  useForRecommendations?: boolean;
}

export type AreaToggleKey =
  | "use_for_leads" | "use_for_properties" | "use_for_transactions"
  | "use_for_external_listings" | "use_for_recommendations";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data: role } = await supabase.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = role?.key ?? "agent";
  }
  return { userId: user.id, orgId: profile.org_id, roleKey, rank: ROLE_RANK[roleKey] ?? 0 };
}

/** Caller may manage the target user's areas (self, or manager+ in the same org). */
async function assertCanManage(targetUserId: string): Promise<{ orgId: string; callerId: string }> {
  const c = await ctx();
  if (targetUserId === c.userId) return { orgId: c.orgId, callerId: c.userId };
  if (c.rank < ROLE_RANK.manager) throw new Error("אין הרשאה לערוך אזורי פעילות של סוכן אחר.");
  const admin = createServiceRoleClient();
  const { data: target } = await admin.from("users").select("org_id").eq("id", targetUserId).maybeSingle();
  if (!target || target.org_id !== c.orgId) throw new Error("הסוכן אינו שייך לארגון שלך.");
  return { orgId: c.orgId, callerId: c.userId };
}

function shape(row: AreaRow, nameFallback?: string | null): OperatingArea {
  const hoods = Array.isArray(row.neighborhoods) ? (row.neighborhoods as string[]) : [];
  return {
    id: row.id, userId: row.user_id, localityId: row.locality_id,
    cityName: row.city_name ?? nameFallback ?? "",
    isPrimary: row.is_primary, isActive: row.is_active,
    neighborhoods: hoods, neighborhoodsCount: hoods.length,
    useForLeads: row.use_for_leads, useForProperties: row.use_for_properties,
    useForTransactions: row.use_for_transactions, useForExternalListings: row.use_for_external_listings,
    useForRecommendations: row.use_for_recommendations,
    lastSyncAt: row.last_sync_at, addedAt: row.added_at,
  };
}

type JoinedAreaRow = AreaRow & { israel_localities: { name_he: string } | null };
const SELECT = "*, israel_localities(name_he)";

async function listAreasFor(userId: string): Promise<OperatingArea[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_operating_localities").select(SELECT)
    .eq("user_id", userId)
    .order("is_primary", { ascending: false }).order("added_at", { ascending: true });
  return ((data ?? []) as unknown as JoinedAreaRow[]).map((r) => shape(r, r.israel_localities?.name_he));
}

/** The signed-in agent's own operating areas. */
export async function getMyOperatingAreas(): Promise<{ areas: OperatingArea[]; canManageOthers: boolean }> {
  const c = await ctx();
  return { areas: await listAreasFor(c.userId), canManageOthers: c.rank >= ROLE_RANK.manager };
}

/** A specific agent's operating areas (manager+ only, same org). */
export async function getAgentOperatingAreas(userId: string): Promise<OperatingArea[]> {
  await assertCanManage(userId);
  return listAreasFor(userId);
}

/** Active city names for a user (optionally filtered by purpose). Backward-compat
 *  helper for modules that want all working cities, not just users.primary_city. */
export async function getAgentActiveCities(userId: string, purpose?: AreaToggleKey): Promise<string[]> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("user_operating_localities")
    .select("city_name,is_active,use_for_leads,use_for_properties,use_for_transactions,use_for_external_listings,use_for_recommendations")
    .eq("user_id", userId).eq("is_active", true);
  const rows = (data ?? []) as unknown as AreaRow[];
  return [...new Set(rows
    .filter((r) => (purpose ? r[purpose] !== false : true))
    .map((r) => r.city_name)
    .filter((c): c is string => !!c))];
}

/** Add (or re-activate) a working city for a user. Never deletes existing cities.
 *  Best-effort: discovers the city's neighborhoods into the national reference. */
export async function addOperatingArea(localityId: string, opts: AddAreaOptions = {}): Promise<{ areaId: string; cityName: string }> {
  const targetUserId = opts.targetUserId ?? (await ctx()).userId;
  const { orgId, callerId } = await assertCanManage(targetUserId);
  const admin = createServiceRoleClient();

  const { data: loc } = await admin.from("israel_localities").select("name_he").eq("id", localityId).maybeSingle();
  if (!loc) throw new Error("עיר לא נמצאה.");
  const cityName = loc.name_he;

  const row = {
    user_id: targetUserId, organization_id: orgId, locality_id: localityId, city_name: cityName,
    is_active: true, added_by: callerId,
    neighborhoods: opts.neighborhoods ?? [],
    use_for_leads: opts.useForLeads ?? true,
    use_for_properties: opts.useForProperties ?? true,
    use_for_transactions: opts.useForTransactions ?? true,
    use_for_external_listings: opts.useForExternalListings ?? true,
    use_for_recommendations: opts.useForRecommendations ?? true,
  };
  const { data: saved, error } = await admin
    .from("user_operating_localities")
    .upsert(row as never, { onConflict: "user_id,locality_id" })
    .select("id").maybeSingle();
  if (error) throw new Error(error.message);
  const areaId = saved?.id as string;

  if (opts.isPrimary) await setPrimaryOperatingArea(areaId);

  // Backward-compat: ensure the ORG also works this locality, so org-level
  // engines (external listings sync, market snapshots) pick the city up — without
  // touching those engines. Idempotent; never blocks the add.
  try {
    const { data: orgLoc } = await admin.from("organization_operating_localities").select("id").eq("organization_id", orgId).eq("locality_id", localityId).maybeSingle();
    if (!orgLoc) await admin.from("organization_operating_localities").insert({ organization_id: orgId, locality_id: localityId, is_primary: false } as never);
  } catch (e) { console.error("[operating-areas] org locality ensure skipped:", e); }

  // Mandatory early step: discover the new city's neighborhoods (OSM + OpenAI)
  // into the shared national reference. Best-effort, never blocks the add.
  try {
    const { ensureNationalNeighborhoods } = await import("@/lib/transactions/service");
    await ensureNationalNeighborhoods([cityName]);
  } catch (e) { console.error("[operating-areas] neighborhood discovery skipped:", e); }

  // Fire-and-forget: learn this city's brokerage market (offices/brokers/listings)
  // if it's new/weak/stale. Never awaited → adding the area is never blocked.
  try {
    const { triggerCityLearning } = await import("@/lib/brokerage-data/city-learning-trigger");
    void triggerCityLearning(orgId, cityName, opts.isPrimary ? "onboarding_primary_city" : "broker_created").catch(() => {});
  } catch (e) { console.error("[operating-areas] city learning trigger skipped:", e); }

  return { areaId, cityName };
}

/** Update toggles / neighborhoods on an area. */
export async function updateOperatingArea(areaId: string, updates: Partial<{
  neighborhoods: string[];
  useForLeads: boolean; useForProperties: boolean; useForTransactions: boolean;
  useForExternalListings: boolean; useForRecommendations: boolean;
}>): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: area } = await admin.from("user_operating_localities").select("user_id").eq("id", areaId).maybeSingle();
  if (!area) throw new Error("אזור לא נמצא.");
  await assertCanManage(area.user_id);
  const patch: Record<string, unknown> = {};
  if (updates.neighborhoods !== undefined) patch.neighborhoods = updates.neighborhoods;
  if (updates.useForLeads !== undefined) patch.use_for_leads = updates.useForLeads;
  if (updates.useForProperties !== undefined) patch.use_for_properties = updates.useForProperties;
  if (updates.useForTransactions !== undefined) patch.use_for_transactions = updates.useForTransactions;
  if (updates.useForExternalListings !== undefined) patch.use_for_external_listings = updates.useForExternalListings;
  if (updates.useForRecommendations !== undefined) patch.use_for_recommendations = updates.useForRecommendations;
  if (!Object.keys(patch).length) return;
  await admin.from("user_operating_localities").update(patch as never).eq("id", areaId);
}

/** Make an area the user's single primary, and sync users.primary_city +
 *  primary_neighborhoods for backward compatibility with existing engines. */
export async function setPrimaryOperatingArea(areaId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: area } = await admin.from("user_operating_localities").select("*").eq("id", areaId).maybeSingle();
  if (!area) throw new Error("אזור לא נמצא.");
  const row = area as AreaRow;
  await assertCanManage(row.user_id);
  // Exactly one primary per user.
  await admin.from("user_operating_localities").update({ is_primary: false } as never).eq("user_id", row.user_id);
  await admin.from("user_operating_localities").update({ is_primary: true, is_active: true } as never).eq("id", areaId);
  // Backward compat: drive the legacy single-city signal every engine reads.
  const hoods = Array.isArray(row.neighborhoods) ? (row.neighborhoods as string[]) : [];
  await admin.from("users").update({ primary_city: row.city_name, primary_neighborhoods: hoods } as never).eq("id", row.user_id);
}

export async function disableOperatingArea(areaId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: area } = await admin.from("user_operating_localities").select("user_id,is_primary").eq("id", areaId).maybeSingle();
  if (!area) throw new Error("אזור לא נמצא.");
  if (area.is_primary) throw new Error("לא ניתן לכבות את העיר הראשית. קבע עיר ראשית אחרת תחילה.");
  await assertCanManage(area.user_id);
  // Keep all historical data — only stop future use.
  await admin.from("user_operating_localities").update({ is_active: false } as never).eq("id", areaId);
}

export async function enableOperatingArea(areaId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: area } = await admin.from("user_operating_localities").select("user_id").eq("id", areaId).maybeSingle();
  if (!area) throw new Error("אזור לא נמצא.");
  await assertCanManage(area.user_id);
  await admin.from("user_operating_localities").update({ is_active: true } as never).eq("id", areaId);
}

export interface SyncAreaResult { city: string | null; neighborhoodsDiscovered: number; coverageCreated: number; note: string }

/** Best-effort sync for one area: discover neighborhoods + create transaction
 *  coverage targets for the city. Heavy imports (Apify) are NOT run here — they
 *  stay behind explicit per-page actions. Never rolls back the area on failure. */
export async function syncOperatingArea(areaId: string): Promise<SyncAreaResult> {
  const admin = createServiceRoleClient();
  const { data: area } = await admin.from("user_operating_localities").select("*").eq("id", areaId).maybeSingle();
  if (!area) throw new Error("אזור לא נמצא.");
  const row = area as AreaRow;
  const { orgId } = await assertCanManage(row.user_id);
  const city = row.city_name;
  if (!city) return { city: null, neighborhoodsDiscovered: 0, coverageCreated: 0, note: "לא הוגדר שם עיר." };

  let neighborhoodsDiscovered = 0;
  let coverageCreated = 0;
  const svc = await import("@/lib/transactions/service");
  try {
    const res = await svc.ensureNationalNeighborhoods([city]);
    neighborhoodsDiscovered = res[0]?.discovered === -1 ? 0 : (res[0]?.discovered ?? 0);
  } catch (e) { console.error("[operating-areas] sync discover failed:", e); }

  if (row.use_for_transactions) {
    try {
      const manual = Array.isArray(row.neighborhoods) ? (row.neighborhoods as string[]) : [];
      const names = manual.length ? manual : await svc.nationalNeighborhoodNames(city);
      const cov = await svc.ensureCoverageTargetsForCity(orgId, city, names);
      coverageCreated = cov.created;
    } catch (e) { console.error("[operating-areas] sync coverage failed:", e); }
  }

  await admin.from("user_operating_localities").update({ last_sync_at: new Date().toISOString() } as never).eq("id", areaId);
  const bits: string[] = [];
  if (neighborhoodsDiscovered > 0) bits.push(`התגלו ${neighborhoodsDiscovered} שכונות`);
  if (coverageCreated > 0) bits.push(`נוצרו ${coverageCreated} אזורי כיסוי עסקאות`);
  return { city, neighborhoodsDiscovered, coverageCreated, note: bits.length ? bits.join(" · ") : "סונכרן — אין פריטים חדשים." };
}
