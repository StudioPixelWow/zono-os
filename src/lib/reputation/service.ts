// ============================================================================
// ZONO — Review, Referral & Reputation Intelligence OS · Service (server-only)
// ----------------------------------------------------------------------------
// Aggregates reviews + referrals into advocate scores, geo reputation and
// agent rankings; detects review/referral opportunities; records reviews and
// referrals; prepares review REQUESTS (drafts only). Feeds Decision Brain via
// reputation_signals. Org-scoped RLS. No autonomous sending.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  computeAdvocateScore, computeReputation, deriveAdvocateSignals, type AdvocateLevel,
} from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default agent */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface AdvocateSummary { client_id: string; name: string; level: string; score: number; deals: number; reviews: number; referrals: number; referral_revenue: number }
export interface GeoReputation { scope: string; scope_key: string; label: string | null; trust: number; influence: number; reviews: number; referrals: number }
export interface AgentRanking { agent_id: string; name: string; reviews: number; referrals: number; referral_revenue: number }
export interface RepOpportunity { id: string; signal_type: string; title: string; reason: string | null; recommended_action: string | null; score: number }
export interface ReputationCommandCenter {
  reviewCount: number; avgRating: number; publishedReviews: number;
  referralCount: number; convertedReferrals: number; referralRevenue: number;
  advocateCounts: { level: string; count: number }[]; ambassadors: number;
  topAdvocates: AdvocateSummary[]; topReferrers: AdvocateSummary[];
  geoInfluence: GeoReputation[]; agentRankings: AgentRanking[]; opportunities: RepOpportunity[];
  reviewOpportunities: number; referralOpportunities: number; isManager: boolean;
}

// ── command center ─────────────────────────────────────────────────────────
export async function getReputationCommandCenter(): Promise<ReputationCommandCenter> {
  const { orgId, isManager, supabase } = await ctx();

  const { data: revData } = await supabase.from("client_reviews").select("rating,status,agent_id").eq("organization_id", orgId).limit(2000);
  const reviews = (revData ?? []) as { rating: number | null; status: string; agent_id: string | null }[];
  const ratings = reviews.map((r) => r.rating).filter((x): x is number => typeof x === "number");
  const avgRating = ratings.length ? Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10 : 0;
  const publishedReviews = reviews.filter((r) => r.status === "published").length;

  const { data: refData } = await supabase.from("referrals").select("status,converted,revenue,agent_id").eq("organization_id", orgId).limit(2000);
  const refs = (refData ?? []) as { status: string; converted: boolean; revenue: number; agent_id: string | null }[];
  const convertedReferrals = refs.filter((r) => r.converted || r.status === "converted").length;
  const referralRevenue = refs.reduce((s, r) => s + (r.revenue ?? 0), 0);

  const { data: advData } = await supabase.from("client_advocates").select("client_id,client_name,advocate_level,advocate_score,deals_completed,reviews_count,referrals_count,referral_revenue").eq("organization_id", orgId).order("advocate_score", { ascending: false }).limit(200);
  const advocates = ((advData ?? []) as Record<string, unknown>[]).map((a): AdvocateSummary => ({
    client_id: a.client_id as string, name: (a.client_name as string) ?? "לקוח", level: a.advocate_level as string,
    score: (a.advocate_score as number) ?? 0, deals: (a.deals_completed as number) ?? 0, reviews: (a.reviews_count as number) ?? 0,
    referrals: (a.referrals_count as number) ?? 0, referral_revenue: (a.referral_revenue as number) ?? 0,
  }));
  const levels = ["elite_ambassador", "ambassador", "gold", "silver", "bronze"];
  const advocateCounts = levels.map((lv) => ({ level: lv, count: advocates.filter((a) => a.level === lv).length }));
  const ambassadors = advocates.filter((a) => a.level === "ambassador" || a.level === "elite_ambassador").length;
  const topAdvocates = advocates.slice(0, 10);
  const topReferrers = [...advocates].filter((a) => a.referrals > 0).sort((a, b) => b.referrals - a.referrals).slice(0, 10);

  const { data: geoData } = await supabase.from("reputation_scores").select("*").eq("organization_id", orgId).order("trust_score", { ascending: false }).limit(40);
  const geoInfluence = ((geoData ?? []) as Record<string, unknown>[]).map((g): GeoReputation => ({
    scope: g.scope as string, scope_key: g.scope_key as string, label: (g.label as string) ?? null,
    trust: (g.trust_score as number) ?? 0, influence: (g.influence_score as number) ?? 0,
    reviews: (g.review_count as number) ?? 0, referrals: (g.referral_count as number) ?? 0,
  }));

  // agent rankings (reviews + referrals per agent)
  const agentAgg = new Map<string, { reviews: number; referrals: number; revenue: number }>();
  for (const r of reviews) if (r.agent_id) { const a = agentAgg.get(r.agent_id) ?? { reviews: 0, referrals: 0, revenue: 0 }; a.reviews++; agentAgg.set(r.agent_id, a); }
  for (const r of refs as { agent_id: string | null; revenue: number }[]) if (r.agent_id) { const a = agentAgg.get(r.agent_id) ?? { reviews: 0, referrals: 0, revenue: 0 }; a.referrals++; a.revenue += r.revenue ?? 0; agentAgg.set(r.agent_id, a); }
  const agentIds = [...agentAgg.keys()];
  const agentNames = new Map<string, string>();
  if (agentIds.length) { const { data: us } = await supabase.from("users").select("id,full_name").in("id", agentIds); for (const u of (us ?? []) as { id: string; full_name: string }[]) agentNames.set(u.id, u.full_name); }
  const agentRankings: AgentRanking[] = agentIds.map((id) => ({ agent_id: id, name: agentNames.get(id) ?? "סוכן", reviews: agentAgg.get(id)!.reviews, referrals: agentAgg.get(id)!.referrals, referral_revenue: agentAgg.get(id)!.revenue }))
    .sort((a, b) => (b.reviews + b.referrals * 2) - (a.reviews + a.referrals * 2)).slice(0, 10);

  const { data: sigData } = await supabase.from("reputation_signals").select("id,signal_type,title,reason,recommended_action,score").eq("organization_id", orgId).eq("status", "open").order("score", { ascending: false }).limit(40);
  const opportunities = ((sigData ?? []) as Record<string, unknown>[]).map((s): RepOpportunity => ({
    id: s.id as string, signal_type: s.signal_type as string, title: s.title as string, reason: (s.reason as string) ?? null, recommended_action: (s.recommended_action as string) ?? null, score: (s.score as number) ?? 50,
  }));
  const reviewOpportunities = opportunities.filter((o) => o.signal_type === "review_opportunity").length;
  const referralOpportunities = opportunities.filter((o) => o.signal_type === "referral_opportunity").length;

  return {
    reviewCount: reviews.length, avgRating, publishedReviews,
    referralCount: refs.length, convertedReferrals, referralRevenue,
    advocateCounts, ambassadors, topAdvocates, topReferrers, geoInfluence, agentRankings, opportunities,
    reviewOpportunities, referralOpportunities, isManager,
  };
}

// ── record review / referral / request ────────────────────────────────────────
export interface ReviewInput { buyerId?: string; sellerId?: string; dealId?: string; reviewerName?: string; rating: number; sentiment?: string; source?: string; category?: string; text?: string; neighborhood?: string; street?: string; building?: string; city?: string; featured?: boolean }
export async function recordReview(input: ReviewInput): Promise<{ id: string }> {
  const { orgId, userId, supabase } = await ctx();
  const sentiment = input.sentiment ?? (input.rating >= 4 ? "positive" : input.rating <= 2 ? "negative" : "neutral");
  const { data, error } = await supabase.from("client_reviews").insert({
    organization_id: orgId, agent_id: userId, buyer_id: input.buyerId ?? null, seller_id: input.sellerId ?? null, deal_id: input.dealId ?? null,
    reviewer_name: input.reviewerName ?? null, rating: input.rating, sentiment, source: input.source ?? "manual", category: input.category ?? "overall",
    review_text: input.text ?? null, city: input.city ?? null, neighborhood: input.neighborhood ?? null, street: input.street ?? null, building: input.building ?? null,
    is_featured: input.featured ?? false, status: "approved",
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "רישום הביקורת נכשל");
  return { id: (data as { id: string }).id };
}

export async function createReviewRequest(input: { buyerId?: string; sellerId?: string; dealId?: string; channel?: string; note?: string }): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  await supabase.from("review_requests").insert({ organization_id: orgId, requested_by: userId, buyer_id: input.buyerId ?? null, seller_id: input.sellerId ?? null, deal_id: input.dealId ?? null, channel: input.channel ?? "manual", status: "pending", note: input.note ?? null });
}

export interface ReferralInput { referrerBuyerId?: string; referrerSellerId?: string; referredLeadId?: string; status?: string; revenue?: number; commission?: number; neighborhood?: string; note?: string }
export async function recordReferral(input: ReferralInput): Promise<{ id: string }> {
  const { orgId, userId, supabase } = await ctx();
  const converted = input.status === "converted";
  const { data, error } = await supabase.from("referrals").insert({
    organization_id: orgId, agent_id: userId, referrer_buyer_id: input.referrerBuyerId ?? null, referrer_seller_id: input.referrerSellerId ?? null,
    referred_lead_id: input.referredLeadId ?? null, status: input.status ?? "new", converted, revenue: input.revenue ?? 0, commission: input.commission ?? 0,
    source_neighborhood: input.neighborhood ?? null, note: input.note ?? null,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "רישום ההפניה נכשל");
  return { id: (data as { id: string }).id };
}

// ── recompute advocates + reputation + opportunities (manager) ────────────────
async function genReviewOpportunities(supabase: DB, orgId: string) {
  // won deals with a buyer and no review yet → review opportunity
  const { data: won } = await supabase.from("deals").select("id,buyer_id").eq("org_id", orgId).eq("status", "won").not("buyer_id", "is", null).limit(200);
  const wonRows = (won ?? []) as { id: string; buyer_id: string }[];
  if (!wonRows.length) return;
  const { data: reviewed } = await supabase.from("client_reviews").select("deal_id").eq("organization_id", orgId).not("deal_id", "is", null);
  const reviewedDeals = new Set((reviewed ?? []).map((r) => (r as { deal_id: string }).deal_id));
  const { data: existing } = await supabase.from("reputation_signals").select("deal_id").eq("organization_id", orgId).eq("signal_type", "review_opportunity").eq("status", "open");
  const existingDeals = new Set((existing ?? []).map((r) => (r as { deal_id: string | null }).deal_id));
  const toInsert = wonRows.filter((d) => !reviewedDeals.has(d.id) && !existingDeals.has(d.id)).slice(0, 100);
  if (toInsert.length) {
    await supabase.from("reputation_signals").insert(toInsert.map((d) => ({
      organization_id: orgId, signal_type: "review_opportunity", buyer_id: d.buyer_id, deal_id: d.id, score: 72,
      title: "הזדמנות לבקש ביקורת מעסקה שנסגרה", reason: "עסקה נסגרה בהצלחה וטרם התקבלה ביקורת", recommended_action: "בקש ביקורת מהלקוח המרוצה", status: "open",
    })));
  }
}

export async function recomputeReputation(): Promise<{ advocates: number; geoScopes: number }> {
  const { orgId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול לחשב מחדש מוניטין");

  // ── advocates (from buyers with won deals) ──
  const { data: deals } = await supabase.from("deals").select("buyer_id,status").eq("org_id", orgId).eq("status", "won").not("buyer_id", "is", null);
  const dealsByBuyer = new Map<string, number>();
  for (const d of (deals ?? []) as { buyer_id: string }[]) dealsByBuyer.set(d.buyer_id, (dealsByBuyer.get(d.buyer_id) ?? 0) + 1);

  const { data: revByBuyer } = await supabase.from("client_reviews").select("buyer_id").eq("organization_id", orgId).not("buyer_id", "is", null);
  const reviewsByBuyer = new Map<string, number>();
  for (const r of (revByBuyer ?? []) as { buyer_id: string }[]) reviewsByBuyer.set(r.buyer_id, (reviewsByBuyer.get(r.buyer_id) ?? 0) + 1);

  const { data: refByBuyer } = await supabase.from("referrals").select("referrer_buyer_id,revenue").eq("organization_id", orgId).not("referrer_buyer_id", "is", null);
  const refsByBuyer = new Map<string, number>(); const refRevByBuyer = new Map<string, number>();
  for (const r of (refByBuyer ?? []) as { referrer_buyer_id: string; revenue: number }[]) {
    refsByBuyer.set(r.referrer_buyer_id, (refsByBuyer.get(r.referrer_buyer_id) ?? 0) + 1);
    refRevByBuyer.set(r.referrer_buyer_id, (refRevByBuyer.get(r.referrer_buyer_id) ?? 0) + (r.revenue ?? 0));
  }

  const buyerIds = Array.from(new Set([...dealsByBuyer.keys(), ...reviewsByBuyer.keys(), ...refsByBuyer.keys()]));
  const names = new Map<string, string>();
  if (buyerIds.length) { const { data: bs } = await supabase.from("buyers").select("id,full_name").eq("org_id", orgId).in("id", buyerIds); for (const b of (bs ?? []) as { id: string; full_name: string }[]) names.set(b.id, b.full_name); }

  let advocates = 0;
  await supabase.from("reputation_signals").delete().eq("organization_id", orgId).in("signal_type", ["ambassador_candidate", "high_influence_client", "referral_opportunity", "referral_revenue"]).eq("status", "open");
  for (const id of buyerIds) {
    const dealsCompleted = dealsByBuyer.get(id) ?? 0;
    const reviewsCount = reviewsByBuyer.get(id) ?? 0;
    const referralsCount = refsByBuyer.get(id) ?? 0;
    const referralRevenue = refRevByBuyer.get(id) ?? 0;
    const { score, level } = computeAdvocateScore({ dealsCompleted, reviewsCount, referralsCount, repeatBusiness: dealsCompleted > 1, satisfaction: 65, relationshipStrength: 55 });
    const name = names.get(id) ?? "לקוח";
    await supabase.from("client_advocates").upsert({
      organization_id: orgId, client_type: "buyer", client_id: id, client_name: name, advocate_score: score, advocate_level: level,
      deals_completed: dealsCompleted, reviews_count: reviewsCount, referrals_count: referralsCount, repeat_business: dealsCompleted > 1,
      referral_revenue: referralRevenue, last_computed_at: new Date().toISOString(),
    }, { onConflict: "organization_id,client_type,client_id" });
    advocates++;
    const specs = deriveAdvocateSignals(name, score, level as AdvocateLevel, referralRevenue, false);
    if (specs.length) await supabase.from("reputation_signals").insert(specs.map((s) => ({ organization_id: orgId, signal_type: s.signal_type, buyer_id: id, score: s.score, title: s.title, reason: s.reason, recommended_action: s.recommended_action, status: "open" })));
  }

  // ── geo reputation (neighborhood) ──
  const { data: geoRev } = await supabase.from("client_reviews").select("neighborhood,rating").eq("organization_id", orgId).not("neighborhood", "is", null);
  const { data: geoRef } = await supabase.from("referrals").select("source_neighborhood,converted").eq("organization_id", orgId).not("source_neighborhood", "is", null);
  const agg = new Map<string, { rsum: number; rcount: number; refs: number; conv: number }>();
  for (const r of (geoRev ?? []) as { neighborhood: string; rating: number | null }[]) { const a = agg.get(r.neighborhood) ?? { rsum: 0, rcount: 0, refs: 0, conv: 0 }; if (r.rating) { a.rsum += r.rating; a.rcount++; } agg.set(r.neighborhood, a); }
  for (const r of (geoRef ?? []) as { source_neighborhood: string; converted: boolean }[]) { const a = agg.get(r.source_neighborhood) ?? { rsum: 0, rcount: 0, refs: 0, conv: 0 }; a.refs++; if (r.converted) a.conv++; agg.set(r.source_neighborhood, a); }
  let geoScopes = 0;
  for (const [key, a] of agg) {
    const scores = computeReputation({ reviewCount: a.rcount, avgRating: a.rcount ? a.rsum / a.rcount : 0, referralCount: a.refs, convertedReferrals: a.conv });
    await supabase.from("reputation_scores").upsert({
      organization_id: orgId, scope: "neighborhood", scope_key: key, label: key,
      review_score: scores.reviewScore, referral_score: scores.referralScore, influence_score: scores.influenceScore, trust_score: scores.trustScore,
      review_count: a.rcount, referral_count: a.refs, computed_at: new Date().toISOString(),
    }, { onConflict: "organization_id,scope,scope_key" });
    geoScopes++;
  }

  await genReviewOpportunities(supabase, orgId);
  return { advocates, geoScopes };
}
