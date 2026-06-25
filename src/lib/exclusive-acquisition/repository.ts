// ============================================================================
// ZONO — Exclusive Acquisition repository (server-only, service-role).
// Reads the radar inputs (org links + market sources + events) and reads/writes
// the radar_seller_* tables. Org-scoped by explicit filters. Used by engine.ts.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ScoreReason, SellerLifecycleStage, SellerOutcome } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

export interface OrgLinkRow { sourceId: string; opportunityScore: number | null; buyerMatchCount: number; createdAt: string }
export interface SourceRow {
  id: string; provider: string; listing_type: string | null; city: string | null; neighborhood: string | null;
  address_text: string | null; price: number | null; published_at: string | null; first_seen_at: string | null;
  last_seen_at: string | null; source_status: string | null;
}
export interface EventAgg { priceDrops: number; republished: number; backOnMarket: number; lastPriceDropAt: string | null }
export interface ExistingProfile { id: string; lifecycleStage: SellerLifecycleStage; contactAttempts: number; lastContactAt: string | null }

export interface UpsertProfileInput {
  orgId: string; marketPropertySourceId: string | null; linkedPropertyId: string | null;
  provider: string; city: string | null; neighborhood: string | null; addressText: string | null;
  listingType: string | null; price: number | null;
  sellerScore: number; exclusiveProbability: number; exclusiveBand: string;
  scoreReasons: ScoreReason[]; probabilityReasons: ScoreReason[];
  recommendedAction: string; recommendedActionReason: string; priorityRank: number;
  buyerMatchCount: number; daysOnMarket: number | null; priceDropCount: number; republishedCount: number;
  lifecycleStage: SellerLifecycleStage; nextFollowupAt: string | null;
}

export function createAcquisitionRepository(db: Db = createServiceRoleClient()) {
  return {
    async getActiveLinks(orgId: string, limit = 2000): Promise<OrgLinkRow[]> {
      const { data, error } = await db
        .from("org_market_property_links" as never)
        .select("market_property_source_id, opportunity_score, buyer_match_count, created_at")
        .eq("org_id", orgId)
        .order("opportunity_score", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`getActiveLinks: ${error.message}`);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        sourceId: String(r.market_property_source_id), opportunityScore: (r.opportunity_score as number | null) ?? null,
        buyerMatchCount: Number(r.buyer_match_count ?? 0), createdAt: String(r.created_at),
      }));
    },

    async getSources(ids: string[]): Promise<Map<string, SourceRow>> {
      const map = new Map<string, SourceRow>();
      if (ids.length === 0) return map;
      const { data, error } = await db
        .from("market_property_sources" as never)
        .select("id, provider, listing_type, city, neighborhood, address_text, price, published_at, first_seen_at, last_seen_at, source_status")
        .in("id", ids as never).limit(3000);
      if (error) throw new Error(`getSources: ${error.message}`);
      for (const r of ((data ?? []) as unknown as SourceRow[])) map.set(r.id, r);
      return map;
    },

    async getEventAggregates(ids: string[]): Promise<Map<string, EventAgg>> {
      const map = new Map<string, EventAgg>();
      if (ids.length === 0) return map;
      const { data, error } = await db
        .from("market_property_events" as never)
        .select("market_property_source_id, event_type, detected_at")
        .in("market_property_source_id", ids as never)
        .order("detected_at", { ascending: false })
        .limit(8000);
      if (error) throw new Error(`getEventAggregates: ${error.message}`);
      for (const r of ((data ?? []) as unknown as { market_property_source_id: string; event_type: string; detected_at: string }[])) {
        const cur = map.get(r.market_property_source_id) ?? { priceDrops: 0, republished: 0, backOnMarket: 0, lastPriceDropAt: null };
        if (r.event_type === "price_drop") { cur.priceDrops++; if (!cur.lastPriceDropAt) cur.lastPriceDropAt = r.detected_at; }
        else if (r.event_type === "back_on_market") { cur.backOnMarket++; cur.republished++; }
        else if (r.event_type === "removed") cur.republished++;
        map.set(r.market_property_source_id, cur);
      }
      return map;
    },

    async getExistingProfiles(orgId: string): Promise<Map<string, ExistingProfile>> {
      const map = new Map<string, ExistingProfile>();
      const { data, error } = await db
        .from("radar_seller_profiles" as never)
        .select("id, market_property_source_id, lifecycle_stage, contact_attempts, last_contact_at")
        .eq("org_id", orgId).limit(5000);
      if (error) throw new Error(`getExistingProfiles: ${error.message}`);
      for (const r of ((data ?? []) as unknown as Record<string, unknown>[])) {
        if (!r.market_property_source_id) continue;
        map.set(String(r.market_property_source_id), {
          id: String(r.id), lifecycleStage: String(r.lifecycle_stage) as SellerLifecycleStage,
          contactAttempts: Number(r.contact_attempts ?? 0), lastContactAt: (r.last_contact_at as string | null) ?? null,
        });
      }
      return map;
    },

    async getLatestOutcomes(orgId: string): Promise<Map<string, SellerOutcome>> {
      const map = new Map<string, SellerOutcome>();
      const { data } = await db
        .from("radar_seller_outcomes" as never)
        .select("profile_id, outcome, recorded_at")
        .eq("org_id", orgId)
        .order("recorded_at", { ascending: false })
        .limit(3000);
      for (const r of ((data ?? []) as unknown as { profile_id: string; outcome: string }[])) {
        if (!map.has(r.profile_id)) map.set(r.profile_id, r.outcome as SellerOutcome);
      }
      return map;
    },

    async upsertProfile(input: UpsertProfileInput): Promise<{ id: string; created: boolean }> {
      const fields = {
        org_id: input.orgId, linked_property_id: input.linkedPropertyId, provider: input.provider,
        city: input.city, neighborhood: input.neighborhood, address_text: input.addressText,
        listing_type: input.listingType, price: input.price,
        seller_score: input.sellerScore, exclusive_probability: input.exclusiveProbability, exclusive_band: input.exclusiveBand,
        score_reasons: input.scoreReasons as unknown as Record<string, unknown>,
        probability_reasons: input.probabilityReasons as unknown as Record<string, unknown>,
        recommended_action: input.recommendedAction, recommended_action_reason: input.recommendedActionReason,
        priority_rank: input.priorityRank, buyer_match_count: input.buyerMatchCount, days_on_market: input.daysOnMarket,
        price_drop_count: input.priceDropCount, republished_count: input.republishedCount,
        lifecycle_stage: input.lifecycleStage, next_followup_at: input.nextFollowupAt, last_evaluated_at: new Date().toISOString(),
      };
      let id: string | undefined;
      if (input.marketPropertySourceId) {
        const { data: existing } = await db
          .from("radar_seller_profiles" as never)
          .select("id").eq("org_id", input.orgId).eq("market_property_source_id", input.marketPropertySourceId).maybeSingle();
        id = (existing as { id: string } | null)?.id;
      }
      if (id) {
        const { error } = await db.from("radar_seller_profiles" as never).update(fields as never).eq("id", id);
        if (error) throw new Error(`upsertProfile update: ${error.message}`);
        return { id, created: false };
      }
      const { data, error } = await db
        .from("radar_seller_profiles" as never)
        .insert({ market_property_source_id: input.marketPropertySourceId, ...fields } as never)
        .select("id").single();
      if (error) throw new Error(`upsertProfile insert: ${error.message}`);
      return { id: (data as unknown as { id: string }).id, created: true };
    },

    async replaceSignals(orgId: string, profileId: string, reasons: ScoreReason[]): Promise<void> {
      await db.from("radar_seller_signals" as never).delete().eq("profile_id", profileId);
      if (reasons.length === 0) return;
      const rows = reasons.map((r) => ({ org_id: orgId, profile_id: profileId, signal_type: r.code, weight: r.points, value: { label: r.label } }));
      await db.from("radar_seller_signals" as never).insert(rows as never);
    },

    /** Create a follow-up + a real task, deduped on (profile, reason, open). */
    async ensureFollowup(orgId: string, profileId: string, f: { reason: string; action: string; title: string; priority: string; dueAtIso: string; linkedPropertyId: string | null }): Promise<boolean> {
      const { data: existing } = await db
        .from("radar_seller_followups" as never)
        .select("id").eq("profile_id", profileId).eq("reason", f.reason).eq("status", "open").maybeSingle();
      if (existing) return false;
      let taskId: string | null = null;
      try {
        const { data: t } = await db.from("tasks" as never).insert({
          org_id: orgId, title: f.title, status: "todo", priority: f.priority === "urgent" ? "high" : f.priority,
          due_at: f.dueAtIso, property_id: f.linkedPropertyId,
          description: "נוצר אוטומטית ע״י מנוע ההזדמנויות הבלעדיות של ZONO.",
        } as never).select("id").single();
        taskId = (t as { id: string } | null)?.id ?? null;
      } catch { /* task creation best-effort */ }
      const { error } = await db.from("radar_seller_followups" as never).insert({
        org_id: orgId, profile_id: profileId, reason: f.reason, action: f.action, due_at: f.dueAtIso, status: "open", task_id: taskId,
      } as never);
      if (error) throw new Error(`ensureFollowup: ${error.message}`);
      return true;
    },

    async recordTouchpoint(orgId: string, profileId: string, channel: string, outcome: string | null, notes: string | null, userId: string | null): Promise<void> {
      const now = new Date().toISOString();
      await db.from("radar_seller_touchpoints" as never).insert({ org_id: orgId, profile_id: profileId, channel, outcome, notes, created_by: userId, occurred_at: now } as never);
      // Maintain denormalized counters on the profile for fast recompute.
      const { data: p } = await db.from("radar_seller_profiles" as never).select("contact_attempts").eq("id", profileId).eq("org_id", orgId).maybeSingle();
      const attempts = Number((p as { contact_attempts: number } | null)?.contact_attempts ?? 0) + 1;
      await db.from("radar_seller_profiles" as never).update({ contact_attempts: attempts, last_contact_at: now, lifecycle_stage: "contacted" } as never).eq("id", profileId).eq("org_id", orgId);
    },

    async recordOutcome(orgId: string, profileId: string, outcome: SellerOutcome, notes: string | null, userId: string | null, lifecycleStage: SellerLifecycleStage): Promise<void> {
      await db.from("radar_seller_outcomes" as never).insert({ org_id: orgId, profile_id: profileId, outcome, notes, recorded_by: userId } as never);
      await db.from("radar_seller_profiles" as never).update({ lifecycle_stage: lifecycleStage } as never).eq("id", profileId).eq("org_id", orgId);
    },

    db,
  };
}
