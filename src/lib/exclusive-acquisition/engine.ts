// ============================================================================
// ZONO — Exclusive Acquisition engine (server-only orchestration).
// Recomputes seller opportunity profiles from the radar (market links + sources
// + events + contact history), upserts them, persists explainability signals,
// and generates smart follow-up tasks. Also serves the executive dashboard, the
// "contact today" ranking, live-feed enrichment, and outcome/touchpoint writes.
// Deterministic (no AI); scales by capping per-run work + O(1) scoring.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { evaluateSellerOpportunity } from "./evaluate";
import { computePriorityScore, rankContactPriority } from "./recommendations";
import { smartFollowupRules } from "./touchpoints";
import { nextLifecycleStage } from "./lifecycle";
import { createAcquisitionRepository } from "./repository";
import type {
  ContactPriorityItem, ExclusiveBand, ExclusiveDashboard, ScoreReason, SellerLifecycleStage,
  SellerOutcome, SellerProfile, TouchpointChannel,
} from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;
const DAY = 86_400_000;

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  return { db: createServiceRoleClient(), orgId: profile.org_id, userId: user.id };
}

function daysBetween(fromIso: string | null, now: number): number | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / DAY)) : null;
}

export interface RecomputeSummary { evaluated: number; created: number; updated: number; followupsCreated: number }

/** Recompute the exclusive-acquisition profiles for the current org. */
export async function recomputeExclusiveAcquisitionForOrg(maxItems = 2000): Promise<RecomputeSummary> {
  const { db, orgId } = await ctx();
  const repo = createAcquisitionRepository(db);
  const now = Date.now();
  const summary: RecomputeSummary = { evaluated: 0, created: 0, updated: 0, followupsCreated: 0 };

  const links = (await repo.getActiveLinks(orgId, maxItems));
  if (links.length === 0) return summary;
  const sourceIds = links.map((l) => l.sourceId);
  const [sources, events, existing, outcomes] = await Promise.all([
    repo.getSources(sourceIds), repo.getEventAggregates(sourceIds), repo.getExistingProfiles(orgId), repo.getLatestOutcomes(orgId),
  ]);

  interface Built {
    sourceId: string; profile: SellerProfile; followupCtx: { contactAttempts: number; hasPositiveResponse: boolean; hoursSinceLastContact: number | null; priceDroppedRecently: boolean; newBuyerMatch: boolean; exclusiveProbability: number };
    linkedPropertyId: string | null; republishedCount: number; recommendedActionReason: string;
  }
  const built: Built[] = [];

  for (const link of links) {
    const s = sources.get(link.sourceId);
    if (!s) continue;
    const agg = events.get(link.sourceId) ?? { priceDrops: 0, republished: 0, backOnMarket: 0, lastPriceDropAt: null };
    const ex = existing.get(link.sourceId);
    const lastOutcome: SellerOutcome | null = ex ? outcomes.get(ex.id) ?? null : null;
    const dom = daysBetween(s.first_seen_at ?? s.published_at, now);
    const hoursSinceLastContact = ex?.lastContactAt ? Math.round((now - Date.parse(ex.lastContactAt)) / 3_600_000) : null;
    const priceDroppedRecently = !!agg.lastPriceDropAt && now - Date.parse(agg.lastPriceDropAt) <= 3 * DAY;
    const removed = s.source_status === "deleted";
    const recentActivity = !!s.last_seen_at && now - Date.parse(s.last_seen_at) <= 3 * DAY;
    const contactAttempts = ex?.contactAttempts ?? 0;
    const hasPositiveResponse = ex?.lifecycleStage === "negotiating";

    const res = evaluateSellerOpportunity({
      features: {
        daysOnMarket: dom, priceDropCount: agg.priceDrops, returnedToMarket: agg.backOnMarket > 0,
        removedAndRepublished: agg.republished > 0, isPrivateListing: s.listing_type === "private",
        marketExposureDays: dom, buyerDemandIndex: 0, matchingBuyerCount: link.buyerMatchCount,
        previousContactCount: contactAttempts, marketTrendDelta: 0, respondedBefore: hasPositiveResponse, recentActivity,
      },
      currentStage: ex?.lifecycleStage ?? "new_opportunity", contactAttempts, hoursSinceLastContact,
      hasPositiveResponse, priceDroppedRecently, removed, lastOutcome,
    });

    const profile: SellerProfile = {
      id: ex?.id ?? "", marketPropertySourceId: link.sourceId, linkedPropertyId: null,
      provider: s.provider, city: s.city, neighborhood: s.neighborhood, addressText: s.address_text,
      listingType: s.listing_type, price: s.price, sellerScore: res.score, exclusiveProbability: res.probability,
      exclusiveBand: res.band, scoreReasons: res.scoreReasons, probabilityReasons: res.probabilityReasons,
      recommendedAction: res.recommendation.kind, recommendedActionReason: res.recommendation.reason, priorityRank: 0,
      buyerMatchCount: link.buyerMatchCount, daysOnMarket: dom, priceDropCount: agg.priceDrops, lifecycleStage: res.lifecycleStage,
      lastContactAt: ex?.lastContactAt ?? null, nextFollowupAt: null,
    };
    built.push({
      sourceId: link.sourceId, profile, linkedPropertyId: null, republishedCount: agg.republished,
      recommendedActionReason: res.recommendation.reason,
      followupCtx: { contactAttempts, hasPositiveResponse, hoursSinceLastContact, priceDroppedRecently, newBuyerMatch: link.buyerMatchCount > 0 && contactAttempts === 0, exclusiveProbability: res.probability },
    });
  }

  // Rank for priority (deterministic) → assign priority_rank.
  built.sort((a, b) => computePriorityScore(b.profile, b.followupCtx.hoursSinceLastContact) - computePriorityScore(a.profile, a.followupCtx.hoursSinceLastContact));
  built.forEach((b, i) => { b.profile.priorityRank = i + 1; });

  for (const b of built) {
    const fsugg = smartFollowupRules(b.followupCtx, new Date(now));
    const nextFollowupAt = fsugg.find((f) => f.reason === "no_response")?.dueAtIso ?? null;
    const up = await repo.upsertProfile({
      orgId, marketPropertySourceId: b.sourceId, linkedPropertyId: b.linkedPropertyId,
      provider: String(b.profile.provider), city: b.profile.city, neighborhood: b.profile.neighborhood,
      addressText: b.profile.addressText, listingType: b.profile.listingType, price: b.profile.price,
      sellerScore: b.profile.sellerScore, exclusiveProbability: b.profile.exclusiveProbability, exclusiveBand: b.profile.exclusiveBand,
      scoreReasons: b.profile.scoreReasons, probabilityReasons: b.profile.probabilityReasons,
      recommendedAction: b.profile.recommendedAction, recommendedActionReason: b.recommendedActionReason,
      priorityRank: b.profile.priorityRank, buyerMatchCount: b.profile.buyerMatchCount, daysOnMarket: b.profile.daysOnMarket,
      priceDropCount: b.profile.priceDropCount, republishedCount: b.republishedCount,
      lifecycleStage: b.profile.lifecycleStage, nextFollowupAt,
    });
    summary.evaluated++;
    if (up.created) summary.created++; else summary.updated++;
    await repo.replaceSignals(orgId, up.id, b.profile.scoreReasons).catch(() => {});
    for (const f of fsugg) {
      const created = await repo.ensureFollowup(orgId, up.id, { reason: f.reason, action: f.action, title: f.title, priority: f.priority, dueAtIso: f.dueAtIso, linkedPropertyId: b.linkedPropertyId }).catch(() => false);
      if (created) summary.followupsCreated++;
    }
  }
  return summary;
}

// ── Reads (RLS via service role + explicit org filter) ──────────────────────
const PROFILE_COLS =
  "id, market_property_source_id, linked_property_id, provider, city, neighborhood, address_text, listing_type, price, " +
  "seller_score, exclusive_probability, exclusive_band, score_reasons, probability_reasons, recommended_action, " +
  "recommended_action_reason, priority_rank, buyer_match_count, days_on_market, price_drop_count, lifecycle_stage, last_contact_at, next_followup_at";

function rowToProfile(r: Record<string, unknown>): SellerProfile {
  const arr = (v: unknown): ScoreReason[] => (Array.isArray(v) ? (v as ScoreReason[]) : []);
  return {
    id: String(r.id), marketPropertySourceId: (r.market_property_source_id as string | null) ?? null,
    linkedPropertyId: (r.linked_property_id as string | null) ?? null, provider: String(r.provider ?? "mock"),
    city: (r.city as string | null) ?? null, neighborhood: (r.neighborhood as string | null) ?? null,
    addressText: (r.address_text as string | null) ?? null, listingType: (r.listing_type as string | null) ?? null,
    price: (r.price as number | null) ?? null, sellerScore: Number(r.seller_score ?? 0),
    exclusiveProbability: Number(r.exclusive_probability ?? 0), exclusiveBand: String(r.exclusive_band ?? "low") as ExclusiveBand,
    scoreReasons: arr(r.score_reasons), probabilityReasons: arr(r.probability_reasons),
    recommendedAction: String(r.recommended_action ?? "wait") as SellerProfile["recommendedAction"],
    recommendedActionReason: String(r.recommended_action_reason ?? ""), priorityRank: Number(r.priority_rank ?? 0),
    buyerMatchCount: Number(r.buyer_match_count ?? 0), daysOnMarket: (r.days_on_market as number | null) ?? null,
    priceDropCount: Number(r.price_drop_count ?? 0), lifecycleStage: String(r.lifecycle_stage ?? "new_opportunity") as SellerLifecycleStage,
    lastContactAt: (r.last_contact_at as string | null) ?? null, nextFollowupAt: (r.next_followup_at as string | null) ?? null,
  };
}

async function loadProfiles(db: Db, orgId: string, limit = 300): Promise<SellerProfile[]> {
  const { data } = await db.from("radar_seller_profiles" as never).select(PROFILE_COLS).eq("org_id", orgId).order("exclusive_probability", { ascending: false }).limit(limit);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToProfile);
}

export async function getExclusiveDashboard(): Promise<ExclusiveDashboard> {
  const { db, orgId } = await ctx();
  const profiles = await loadProfiles(db, orgId, 500);
  const now = Date.now();
  const hoursMap: Record<string, number | null> = {};
  for (const p of profiles) hoursMap[p.id] = p.lastContactAt ? Math.round((now - Date.parse(p.lastContactAt)) / 3_600_000) : null;

  const bands: ExclusiveBand[] = ["very_high", "high", "medium", "low"];
  const stages: SellerLifecycleStage[] = ["new_opportunity", "contact_recommended", "contacted", "follow_up", "negotiating", "exclusive_signed", "lost", "archived"];
  const todayIso = new Date(now - (now % DAY)).toISOString();

  return {
    topOpportunities: profiles.filter((p) => !["lost", "archived"].includes(p.lifecycleStage)).slice(0, 8),
    probabilityDistribution: bands.map((band) => ({ band, count: profiles.filter((p) => p.exclusiveBand === band).length })),
    todaysPriorities: rankContactPriority(profiles, hoursMap, 12),
    funnel: stages.map((stage) => ({ stage, count: profiles.filter((p) => p.lifecycleStage === stage).length })),
    averageDaysUntilExclusive: null,
    totals: {
      profiles: profiles.length,
      veryHigh: profiles.filter((p) => p.exclusiveBand === "very_high").length,
      high: profiles.filter((p) => p.exclusiveBand === "high").length,
      contactedToday: profiles.filter((p) => p.lastContactAt && p.lastContactAt >= todayIso).length,
      signed: profiles.filter((p) => p.lifecycleStage === "exclusive_signed").length,
    },
  };
}

export async function getTopSellersToday(limit = 25): Promise<ContactPriorityItem[]> {
  const { db, orgId } = await ctx();
  const profiles = await loadProfiles(db, orgId, 500);
  const now = Date.now();
  const hoursMap: Record<string, number | null> = {};
  for (const p of profiles) hoursMap[p.id] = p.lastContactAt ? Math.round((now - Date.parse(p.lastContactAt)) / 3_600_000) : null;
  return rankContactPriority(profiles, hoursMap, limit);
}

export interface SellerEnrichment { exclusiveProbability: number; exclusiveBand: ExclusiveBand; sellerScore: number; recommendedAction: string; lastContactAt: string | null; nextFollowupAt: string | null }

/** Map of sourceId → enrichment, for Property Radar live feed + map coloring. */
export async function getSellerEnrichmentForSources(sourceIds: string[]): Promise<Record<string, SellerEnrichment>> {
  if (sourceIds.length === 0) return {};
  const { db, orgId } = await ctx();
  const { data } = await db
    .from("radar_seller_profiles" as never)
    .select("market_property_source_id, exclusive_probability, exclusive_band, seller_score, recommended_action, last_contact_at, next_followup_at")
    .eq("org_id", orgId).in("market_property_source_id", sourceIds as never).limit(500);
  const out: Record<string, SellerEnrichment> = {};
  for (const r of ((data ?? []) as unknown as Record<string, unknown>[])) {
    if (!r.market_property_source_id) continue;
    out[String(r.market_property_source_id)] = {
      exclusiveProbability: Number(r.exclusive_probability ?? 0), exclusiveBand: String(r.exclusive_band ?? "low") as ExclusiveBand,
      sellerScore: Number(r.seller_score ?? 0), recommendedAction: String(r.recommended_action ?? "wait"),
      lastContactAt: (r.last_contact_at as string | null) ?? null, nextFollowupAt: (r.next_followup_at as string | null) ?? null,
    };
  }
  return out;
}

export async function recordSellerTouchpoint(profileId: string, channel: TouchpointChannel, outcome: string | null, notes: string | null): Promise<void> {
  const { db, orgId, userId } = await ctx();
  await createAcquisitionRepository(db).recordTouchpoint(orgId, profileId, channel, outcome, notes, userId);
}

export async function recordSellerOutcome(profileId: string, outcome: SellerOutcome, notes: string | null): Promise<SellerLifecycleStage> {
  const { db, orgId, userId } = await ctx();
  const stage = nextLifecycleStage("contacted", { score: 0, exclusiveProbability: 0, contactAttempts: 1, hoursSinceLastContact: 0, lastOutcome: outcome, hasPositiveResponse: outcome === "exclusive_signed", removed: false });
  await createAcquisitionRepository(db).recordOutcome(orgId, profileId, outcome, notes, userId, stage);
  return stage;
}
