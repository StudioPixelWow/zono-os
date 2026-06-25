// ============================================================================
// ZONO Property Radar™ — matching repository (server-only, service-role).
// Loads active buyers for an org, upserts deterministic matches (never
// duplicates), marks matches inactive when a property is removed, creates the
// "contact the buyer" task for perfect matches, and reads top matches for UI.
// Uses the project's `.from(TABLE as never)` cast convention.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  MatchStatus,
  MatchableBuyer,
  MatchingRepository,
  PerfectMatchTaskInput,
  StoredBuyerMatch,
  UpsertMatchInput,
  UpsertMatchResult,
} from "./types";

const MATCHES = "buyer_property_matches";
const BUYERS = "buyers";
const TASKS = "tasks";
const PERFECT_TASK_TITLE = "ליצור קשר עם הקונה";

type Db = ReturnType<typeof createServiceRoleClient>;

const BUYER_SELECT =
  "id, org_id, full_name, phone, temperature, budget_min, budget_max, rooms_min, rooms_max, " +
  "size_min_sqm, size_max_sqm, preferred_types, preferred_areas, must_have_parking, preferences, last_contacted_at";

function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}
function asNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function asBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}
function asTimeline(v: unknown): MatchableBuyer["timeline"] {
  const s = String(v ?? "").trim().toLowerCase();
  if (["immediate", "מיידי", "now", "urgent"].includes(s)) return "immediate";
  if (["soon", "בקרוב", "3m", "short"].includes(s)) return "soon";
  if (["flexible", "גמיש", "later"].includes(s)) return "flexible";
  return null;
}

/** Map a raw buyer row into the matcher's flat shape (status derived). */
function toMatchableBuyer(r: Record<string, unknown>): MatchableBuyer {
  const prefs = (r.preferences && typeof r.preferences === "object" ? r.preferences : {}) as Record<string, unknown>;
  const budgetMin = asNum(r.budget_min);
  const budgetMax = asNum(r.budget_max);
  const preferredTypes = asStrArr(r.preferred_types);
  const preferredCities = asStrArr(r.preferred_areas);
  const preferredNeighborhoods = asStrArr(prefs.preferred_neighborhoods ?? prefs.neighborhoods);

  // A buyer with no budget, no types and no areas is unmatchable → "inactive".
  const hasCriteria =
    budgetMin != null || budgetMax != null || preferredTypes.length > 0 || preferredCities.length > 0;

  const temp = r.temperature as MatchableBuyer["temperature"] | null;
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    fullName: String(r.full_name ?? ""),
    phone: (r.phone as string | null) ?? null,
    status: hasCriteria ? "active" : "inactive",
    temperature: temp ?? null,
    budgetMin,
    budgetMax,
    roomsMin: asNum(r.rooms_min),
    roomsMax: asNum(r.rooms_max),
    sizeMin: asNum(r.size_min_sqm),
    sizeMax: asNum(r.size_max_sqm),
    preferredTypes,
    preferredCities,
    preferredNeighborhoods,
    mustHaveParking: asBool(r.must_have_parking),
    mustHaveBalcony: asBool(prefs.must_have_balcony ?? prefs.balcony),
    floorMin: asNum(prefs.floor_min),
    floorMax: asNum(prefs.floor_max),
    timeline: asTimeline(prefs.timeline ?? prefs.timeframe),
    lastContactedAt: (r.last_contacted_at as string | null) ?? null,
    manualBonus: asNum(prefs.match_manual_bonus) ?? 0,
    manualPenalty: asNum(prefs.match_manual_penalty) ?? 0,
  };
}

export function createMatchingRepository(db: Db = createServiceRoleClient()): MatchingRepository {
  return {
    async getActiveBuyersForOrg(orgId: string): Promise<MatchableBuyer[]> {
      const { data, error } = await db
        .from(BUYERS as never)
        .select(BUYER_SELECT)
        .eq("org_id", orgId);
      if (error) throw new Error(`getActiveBuyersForOrg failed: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      // Keep only matchable (active) buyers — inactive ones never reach scoring.
      return rows.map(toMatchableBuyer).filter((b) => b.status === "active");
    },

    async upsertBuyerPropertyMatch(input: UpsertMatchInput): Promise<UpsertMatchResult> {
      const { data: existing, error: re } = await db
        .from(MATCHES as never)
        .select("id, match_score")
        .eq("buyer_id", input.buyerId)
        .eq("market_property_source_id", input.marketPropertySourceId)
        .maybeSingle();
      if (re) throw new Error(`upsertBuyerPropertyMatch read failed: ${re.message}`);

      const b = input.breakdown;
      const fields = {
        org_id: input.orgId,
        linked_property_id: input.linkedPropertyId ?? null,
        match_score: input.matchScore,
        match_level: input.matchLevel,
        price_score: b.priceScore,
        location_score: b.locationScore,
        rooms_score: b.roomsScore,
        property_type_score: b.propertyTypeScore,
        size_score: b.sizeScore,
        parking_score: b.parkingScore,
        balcony_score: b.balconyScore,
        floor_score: b.floorScore,
        timeline_score: b.timelineScore,
        manual_bonus: input.manualBonus,
        manual_penalty: input.manualPenalty,
        explanation: input.explanation as unknown as Record<string, unknown>,
        is_active: true,
      };

      const prev = existing as unknown as { id: string; match_score: number } | null;
      if (prev?.id) {
        const scoreChanged = prev.match_score !== input.matchScore;
        const { error } = await db.from(MATCHES as never).update(fields as never).eq("id", prev.id);
        if (error) throw new Error(`upsertBuyerPropertyMatch update failed: ${error.message}`);
        return { matchId: prev.id, created: false, scoreChanged };
      }

      const { data, error } = await db
        .from(MATCHES as never)
        .insert({
          buyer_id: input.buyerId,
          market_property_source_id: input.marketPropertySourceId,
          status: "new",
          ...fields,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(`upsertBuyerPropertyMatch insert failed: ${error.message}`);
      return { matchId: (data as unknown as { id: string }).id, created: true, scoreChanged: true };
    },

    async markMatchesInactiveForSource(marketPropertySourceId: string): Promise<number> {
      const { data, error } = await db
        .from(MATCHES as never)
        .update({ is_active: false } as never)
        .eq("market_property_source_id", marketPropertySourceId)
        .eq("is_active", true)
        .select("id");
      if (error) throw new Error(`markMatchesInactiveForSource failed: ${error.message}`);
      return ((data as unknown as unknown[]) ?? []).length;
    },

    async perfectMatchTaskExists(orgId, buyerId, marketPropertySourceId): Promise<boolean> {
      // Guard against duplicate tasks across runs: one open contact-task per buyer.
      void marketPropertySourceId;
      const { data, error } = await db
        .from(TASKS as never)
        .select("id")
        .eq("org_id", orgId)
        .eq("buyer_id", buyerId)
        .eq("title", PERFECT_TASK_TITLE)
        .in("status", ["todo", "in_progress"] as never)
        .limit(1);
      if (error) throw new Error(`perfectMatchTaskExists failed: ${error.message}`);
      return ((data as unknown as unknown[]) ?? []).length > 0;
    },

    async createPerfectMatchTask(input: PerfectMatchTaskInput): Promise<void> {
      const { error } = await db.from(TASKS as never).insert({
        org_id: input.orgId,
        buyer_id: input.buyerId,
        title: PERFECT_TASK_TITLE,
        description: `התאמה מושלמת (${input.matchScore}) לנכס חדש מ‑Property Radar — ${input.buyerName}. מומלץ ליצור קשר עוד היום.`,
        status: "todo",
        priority: "high",
        due_at: input.dueAtIso,
      } as never);
      if (error) throw new Error(`createPerfectMatchTask failed: ${error.message}`);
    },

    async getTopMatchesForSource(orgId, marketPropertySourceId, limit = 20): Promise<StoredBuyerMatch[]> {
      const { data, error } = await db
        .from(MATCHES as never)
        .select(
          "id, buyer_id, match_score, match_level, status, explanation, market_property_source_id, " +
            "buyers!inner(full_name, phone, budget_min, budget_max, last_contacted_at)",
        )
        .eq("org_id", orgId)
        .eq("market_property_source_id", marketPropertySourceId)
        .eq("is_active", true)
        .order("match_score", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`getTopMatchesForSource failed: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return rows.map((r) => {
        const buyer = (Array.isArray(r.buyers) ? r.buyers[0] : r.buyers) as Record<string, unknown> | undefined;
        const exp = (r.explanation && typeof r.explanation === "object" ? r.explanation : {}) as Record<string, unknown>;
        return {
          id: String(r.id),
          buyerId: String(r.buyer_id),
          buyerName: String(buyer?.full_name ?? ""),
          phone: (buyer?.phone as string | null) ?? null,
          matchScore: asNum(r.match_score) ?? 0,
          matchLevel: String(r.match_level) as StoredBuyerMatch["matchLevel"],
          status: String(r.status),
          budgetMin: asNum(buyer?.budget_min),
          budgetMax: asNum(buyer?.budget_max),
          lastContactedAt: (buyer?.last_contacted_at as string | null) ?? null,
          positives: asStrArr(exp.positives),
          negatives: asStrArr(exp.negatives),
          marketPropertySourceId: String(r.market_property_source_id),
        };
      });
    },

    async countRelevantMatchesForSource(orgId, marketPropertySourceId): Promise<number> {
      const { count, error } = await db
        .from(MATCHES as never)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("market_property_source_id", marketPropertySourceId)
        .eq("is_active", true);
      if (error) throw new Error(`countRelevantMatchesForSource failed: ${error.message}`);
      return count ?? 0;
    },

    async updateMatchStatus(orgId, matchId, status: MatchStatus): Promise<void> {
      const { error } = await db
        .from(MATCHES as never)
        .update({ status } as never)
        .eq("id", matchId)
        .eq("org_id", orgId);
      if (error) throw new Error(`updateMatchStatus failed: ${error.message}`);
    },
  };
}
