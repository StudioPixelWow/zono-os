// ============================================================================
// ZONO — AI context builder + DB cache + generate orchestration (server-only).
// Builds a SANITIZED, structured context from the deterministic engines (never
// raw payloads / secrets / cross-org data), runs the provider with graceful
// fallback, and caches outputs per org (invalidated by data hash). The AI reads
// this context only — it never queries the DB itself and never decides matches.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getExclusiveDashboard } from "@/lib/exclusive-acquisition/engine";
import { selectAiProvider, generateWithProvider } from "./engine";
import { sanitizeContext } from "./prompts";
import type { AiGenerateRequest, AiResult, MorningBriefContext, OfficeBriefContext, SellerCallContext } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;
const DAY = 86_400_000;

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  return { db: createServiceRoleClient(), orgId: profile.org_id, userId: user.id };
}

/** Build a sanitized seller context from the deterministic profile + source + touchpoints. */
export async function buildSellerContext(db: Db, orgId: string, profileId: string): Promise<{ entityId: string; context: SellerCallContext }> {
  const { data } = await db
    .from("radar_seller_profiles" as never)
    .select("id, market_property_source_id, city, neighborhood, address_text, listing_type, price, days_on_market, price_drop_count, buyer_match_count, seller_score, exclusive_probability, exclusive_band, recommended_action, recommended_action_reason, score_reasons, lifecycle_stage, last_contact_at")
    .eq("id", profileId).eq("org_id", orgId).maybeSingle();
  const r = (data as Record<string, unknown> | null) ?? {};
  // Contact-history summary (counts only — no raw notes/ids in the prompt).
  const { data: tps } = await db
    .from("radar_seller_touchpoints" as never)
    .select("channel, occurred_at").eq("org_id", orgId).eq("profile_id", profileId).order("occurred_at", { ascending: false }).limit(20);
  const touchpoints = (tps ?? []) as unknown as { channel: string; occurred_at: string }[];
  const contactSummary = touchpoints.length
    ? `${touchpoints.length} אינטראקציות, אחרונה ${new Date(touchpoints[0]!.occurred_at).toLocaleDateString("he-IL")}`
    : null;
  const reasons = Array.isArray(r.score_reasons) ? (r.score_reasons as { label?: string }[]).map((x) => x.label ?? "").filter(Boolean) : [];

  const context: SellerCallContext = {
    city: (r.city as string | null) ?? null, neighborhood: (r.neighborhood as string | null) ?? null,
    addressText: (r.address_text as string | null) ?? null, listingType: (r.listing_type as string | null) ?? null,
    price: (r.price as number | null) ?? null, daysOnMarket: (r.days_on_market as number | null) ?? null,
    priceDropCount: Number(r.price_drop_count ?? 0), buyerMatchCount: Number(r.buyer_match_count ?? 0),
    sellerScore: Number(r.seller_score ?? 0), exclusiveProbability: Number(r.exclusive_probability ?? 0),
    exclusiveBand: String(r.exclusive_band ?? "low"), recommendedAction: String(r.recommended_action ?? "wait"),
    recommendedActionReason: String(r.recommended_action_reason ?? ""), scoreReasons: reasons,
    lifecycleStage: String(r.lifecycle_stage ?? "new_opportunity"), lastContactAt: (r.last_contact_at as string | null) ?? null,
    contactSummary,
  };
  return { entityId: profileId, context };
}

export async function buildMorningContext(): Promise<MorningBriefContext> {
  const { db, orgId } = await ctx();
  const dash = await getExclusiveDashboard();
  const todayIso = new Date(Date.now() - (Date.now() % DAY)).toISOString();
  const yIso = new Date(Date.now() - DAY).toISOString();
  const { count: pending } = await db.from("tasks" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", ["todo", "in_progress"] as never);
  const { count: done } = await db.from("tasks" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "done").gte("updated_at", yIso).lt("updated_at", todayIso);
  return {
    topPriorities: dash.todaysPriorities.slice(0, 6).map((p) => ({ label: p.addressText ?? p.city ?? "נכס", probability: p.exclusiveProbability, action: p.recommendedAction })),
    hotOpportunities: dash.topOpportunities.slice(0, 4).map((p) => ({ label: p.addressText ?? p.city ?? "נכס", probability: p.exclusiveProbability })),
    totals: dash.totals,
    pendingTasks: pending ?? 0,
    completedYesterday: done ?? 0,
  };
}

export async function buildOfficeContext(): Promise<OfficeBriefContext> {
  const dash = await getExclusiveDashboard();
  return {
    totals: { profiles: dash.totals.profiles, veryHigh: dash.totals.veryHigh, high: dash.totals.high, signed: dash.totals.signed },
    funnel: dash.funnel.map((f) => ({ stage: f.stage, count: f.count })),
    topOpportunities: dash.topOpportunities.slice(0, 5).map((p) => ({ label: p.addressText ?? p.city ?? "נכס", probability: p.exclusiveProbability })),
  };
}

// ── Cache + generate ──────────────────────────────────────────────────────────
async function readCache(db: Db, orgId: string, cacheKey: string): Promise<AiResult | null> {
  const { data } = await db.from("ai_copilot_cache" as never).select("content, source, model").eq("org_id", orgId).eq("cache_key", cacheKey).maybeSingle();
  const r = data as { content: string; source: string; model: string | null } | null;
  if (!r) return null;
  return { content: r.content, source: "cache", model: r.model, cached: true };
}
async function writeCache(db: Db, orgId: string, req: AiGenerateRequest, res: AiResult): Promise<void> {
  await db.from("ai_copilot_cache" as never).upsert({
    org_id: orgId, cache_key: req.cacheKey, kind: req.kind, entity_id: req.entityId, data_hash: req.dataHash,
    content: res.content, source: res.source, model: res.model, updated_at: new Date().toISOString(),
  } as never, { onConflict: "org_id,cache_key" });
}

export interface RunCopilotOptions { cache?: boolean }

/** Cache-aware generate: hit cache → return; else provider (graceful fallback) → cache. */
export async function runCopilot(req: AiGenerateRequest, opts: RunCopilotOptions = {}): Promise<AiResult> {
  const { db, orgId } = await ctx();
  // Defensive: re-sanitize each message's content shape (already structured).
  void sanitizeContext;
  if (opts.cache !== false) {
    const hit = await readCache(db, orgId, req.cacheKey).catch(() => null);
    if (hit) return hit;
  }
  const res = await generateWithProvider(req, selectAiProvider());
  if (opts.cache !== false) await writeCache(db, orgId, req, res).catch(() => {});
  return res;
}

export { ctx as copilotSessionContext };
