/**
 * Recommendation Intelligence OS — server service (Parts 3-10 + 11).
 *
 * Consumes the existing ZONO brains (match / forecast / transactions / buyer /
 * seller / property intelligence) and turns their signals into explainable,
 * evidence-gated recommendation records via the pure engine. Never invents
 * evidence: "עסקאות דומות" only appear when real property_transactions exist.
 * Nothing is sent or contacted automatically — records are review-only.
 *
 * Org column convention: recommendations + buyers/sellers/properties/match use
 * `org_id` semantics, but property_transactions uses `organization_id`.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { matchIntelligenceRepository } from "@/lib/matching-intelligence/repository";
import { getBuyerById } from "@/lib/buyers/repository";
import { getSellerById } from "@/lib/sellers/repository";
import { getPropertyById } from "@/lib/properties/repository";
import {
  buildScoredRecommendation, rankRecommendations, type EvidenceItem,
  type RecommendationSignals, type RecommendationType,
} from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id };
}

// ── Persistence ──────────────────────────────────────────────────────────────
export interface RecInput {
  type: RecommendationType;
  targetType: string;
  targetId?: string | null;
  title: string;
  description?: string;
  signals: RecommendationSignals;
  evidence: EvidenceItem[];
  dealValue?: number;
  commissionPct?: number;
  hasVerifiedTransactions?: boolean;
  overdue?: boolean;
  expiringSoon?: boolean;
  supporting?: {
    transactions?: unknown[]; properties?: unknown[]; buyers?: unknown[];
    sellers?: unknown[]; deals?: unknown[]; geo?: Record<string, unknown>; market?: Record<string, unknown>;
  };
  assignedUserId?: string | null;
  generationReason?: string;
}

/**
 * Replace the open (un-actioned) recommendations for one source entity with a
 * freshly generated set, then insert + log a 'generated' event each. Keeps any
 * user-actioned rows (accepted/rejected/converted) intact. Returns inserted rows.
 */
async function persistRecommendations(sourceType: string, sourceId: string, inputs: RecInput[]) {
  const { orgId } = await ctx();
  const supabase = await createClient();

  // Clear previous un-actioned recommendations for this source (regeneration).
  await supabase.from("recommendations").delete()
    .eq("organization_id", orgId).eq("source_entity_type", sourceType).eq("source_entity_id", sourceId)
    .in("status", ["new", "reviewed"]);

  if (!inputs.length) return [];

  const rows = inputs.map((i) => {
    const scored = buildScoredRecommendation({
      type: i.type, signals: i.signals, evidence: i.evidence, dealValue: i.dealValue,
      commissionPct: i.commissionPct, hasVerifiedTransactions: i.hasVerifiedTransactions,
      overdue: i.overdue, expiringSoon: i.expiringSoon,
    });
    return {
      organization_id: orgId,
      source_entity_type: sourceType, source_entity_id: sourceId,
      target_entity_type: i.targetType, target_entity_id: i.targetId ?? null,
      recommendation_type: i.type,
      title_hebrew: i.title, description_hebrew: i.description ?? null,
      reason_hebrew: scored.reason_hebrew, next_best_action_hebrew: scored.next_best_action_hebrew,
      recommendation_score: scored.recommendation_score, confidence_score: scored.confidence_score,
      urgency_score: scored.urgency_score, impact_score: scored.impact_score,
      expected_revenue: scored.expected_revenue, expected_commission: scored.expected_commission,
      expected_conversion_lift: scored.expected_conversion_lift,
      evidence: i.evidence as never,
      supporting_transactions: (i.supporting?.transactions ?? []) as never,
      supporting_properties: (i.supporting?.properties ?? []) as never,
      supporting_buyers: (i.supporting?.buyers ?? []) as never,
      supporting_sellers: (i.supporting?.sellers ?? []) as never,
      supporting_deals: (i.supporting?.deals ?? []) as never,
      supporting_geo: (i.supporting?.geo ?? {}) as never,
      supporting_market: (i.supporting?.market ?? {}) as never,
      status: "new", review_status: scored.review_status,
      assigned_user_id: i.assignedUserId ?? null,
      generated_by: "recommendation_engine",
      generation_reason: i.generationReason ?? null,
      source_confidence: scored.source_confidence,
    };
  });

  const { data, error } = await supabase.from("recommendations").insert(rows as never).select("id");
  if (error) throw new Error(error.message);
  const ids = (data ?? []) as { id: string }[];
  if (ids.length) {
    await supabase.from("recommendation_events").insert(
      ids.map((r) => ({ organization_id: orgId, recommendation_id: r.id, event_type: "generated" })) as never,
    );
  }
  await recomputeProfile(sourceType, sourceId);
  return ids;
}

/** Roll up counts/scores onto the entity's recommendation_profile. */
async function recomputeProfile(entityType: string, entityId: string) {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("recommendations")
    .select("recommendation_score,confidence_score,status,review_status")
    .eq("organization_id", orgId).eq("source_entity_type", entityType).eq("source_entity_id", entityId);
  const rows = (data ?? []) as { recommendation_score: number; confidence_score: number; status: string; review_status: string }[];
  const open = rows.filter((r) => r.status === "new" || r.status === "reviewed");
  const high = open.filter((r) => r.recommendation_score >= 70);
  const conf = open.length ? Math.round(open.reduce((a, r) => a + r.confidence_score, 0) / open.length) : 0;
  const health = open.length ? Math.round(open.reduce((a, r) => a + r.recommendation_score, 0) / open.length) : 0;
  await supabase.from("recommendation_profiles").upsert({
    organization_id: orgId, entity_type: entityType, entity_id: entityId,
    recommendation_health_score: health, recommendation_confidence_score: conf,
    open_recommendations_count: open.length, high_priority_recommendations_count: high.length,
    accepted_recommendations_count: rows.filter((r) => r.status === "accepted").length,
    rejected_recommendations_count: rows.filter((r) => r.status === "rejected").length,
    converted_recommendations_count: rows.filter((r) => r.status === "converted").length,
    last_generated_at: new Date().toISOString(),
  } as never, { onConflict: "organization_id,entity_type,entity_id" });
}

// ── Transaction evidence (real comparables only) ─────────────────────────────
interface TxnComparable { id: string; deal_amount: number | null; price_per_sqm: number | null; deal_date: string | null; neighborhood_name: string | null; street: string | null; rooms: number | null }
interface TxnEvidence { count: number; items: TxnComparable[]; avgPpsqm: number | null; hasVerified: boolean; evidence: EvidenceItem[] }

async function comparableTransactions(city: string | null, neighborhood: string | null): Promise<TxnEvidence> {
  const empty: TxnEvidence = { count: 0, items: [], avgPpsqm: null, hasVerified: false, evidence: [] };
  if (!city) return empty;
  const { orgId } = await ctx();
  const supabase = await createClient();
  let q = supabase.from("property_transactions")
    .select("id,deal_amount,price_per_sqm,deal_date,neighborhood_name,street,rooms")
    .eq("organization_id", orgId).eq("city_name", city).order("deal_date", { ascending: false }).limit(40);
  if (neighborhood) q = q.eq("neighborhood_name", neighborhood);
  const { data } = await q;
  let items = (data ?? []) as TxnComparable[];
  // If neighborhood filter returned nothing, fall back to city-level comparables.
  if (!items.length && neighborhood) {
    const { data: cityData } = await supabase.from("property_transactions")
      .select("id,deal_amount,price_per_sqm,deal_date,neighborhood_name,street,rooms")
      .eq("organization_id", orgId).eq("city_name", city).order("deal_date", { ascending: false }).limit(40);
    items = (cityData ?? []) as TxnComparable[];
  }
  if (!items.length) return empty;
  const ppsqm = items.map((t) => t.price_per_sqm).filter((n): n is number => typeof n === "number" && n > 0);
  const avgPpsqm = ppsqm.length ? Math.round(ppsqm.reduce((a, b) => a + b, 0) / ppsqm.length) : null;
  const evidence: EvidenceItem[] = [{
    kind: "transaction",
    label_hebrew: `${items.length} עסקאות אמת ב${neighborhood ?? city}${avgPpsqm ? ` · ₪${avgPpsqm.toLocaleString("he-IL")}/מ"ר` : ""}`,
    weight: Math.min(95, 40 + items.length * 5),
    detail: "מבוסס על עסקאות שנמכרו",
  }];
  return { count: items.length, items, avgPpsqm, hasVerified: items.length >= 3, evidence };
}

const matchSignals = (m: { compatibility_score: number; closing_probability: number; opportunity_score: number; urgency_score: number }): RecommendationSignals => ({
  entityFit: m.compatibility_score, matchProbability: m.closing_probability, dealForecast: m.closing_probability,
  marketDemand: m.opportunity_score, urgencySignal: m.urgency_score, revenueImpact: m.opportunity_score,
});

// ── Part 3 · Buyer recommendations ───────────────────────────────────────────
export async function generateBuyerRecommendations(buyerId: string) {
  await ctx();
  const buyer = await getBuyerById(buyerId);
  if (!buyer) throw new Error("הקונה לא נמצא");
  const matches = await matchIntelligenceRepository.listForBuyer(buyerId);
  const inputs: RecInput[] = [];

  // 1) Buyer → Property (one per strong match, ranked, top 6)
  const topMatches = [...matches].sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 6);
  for (const m of topMatches) {
    const evidence: EvidenceItem[] = [
      { kind: "match", label_hebrew: `התאמה ${Math.round(m.compatibility_score)}%`, weight: m.compatibility_score },
      { kind: "forecast", label_hebrew: `סבירות סגירה ${Math.round(m.closing_probability)}%`, weight: m.closing_probability },
    ];
    inputs.push({
      type: "buyer_property", targetType: "property", targetId: m.property_id,
      title: "נכס מומלץ לקונה",
      signals: matchSignals(m), evidence,
      dealValue: m.estimated_deal_value ?? undefined, commissionPct: 2,
      supporting: { properties: [{ property_id: m.property_id }] },
      assignedUserId: buyer.owner_id, generationReason: "buyer_match",
    });
  }

  // 2) Buyer → Transaction package (only if real comparables exist)
  const city = (buyer.preferred_areas ?? [])[0] ?? null;
  const txn = await comparableTransactions(city, null);
  if (txn.count > 0) {
    inputs.push({
      type: "buyer_transaction_package", targetType: "transaction", targetId: null,
      title: "חבילת עסקאות דומות לעיגון ציפיות מחיר",
      signals: { transactionEvidence: 80, marketDemand: 60, entityFit: 60 },
      evidence: txn.evidence, hasVerifiedTransactions: txn.hasVerified,
      supporting: { transactions: txn.items, market: txn.avgPpsqm ? { avg_price_per_sqm: txn.avgPpsqm } : {} },
      assignedUserId: buyer.owner_id, generationReason: "buyer_transactions",
    });
  }

  // 3) Buyer → Neighborhood (budget + demand based, evidence-gated by transactions)
  if (city && txn.count > 0) {
    inputs.push({
      type: "buyer_neighborhood", targetType: "locality", targetId: null,
      title: `שכונה מתאימה לתקציב ב${city}`,
      signals: { entityFit: 65, marketDemand: 60, transactionEvidence: 70 },
      evidence: txn.evidence, hasVerifiedTransactions: txn.hasVerified,
      supporting: { geo: { city } }, assignedUserId: buyer.owner_id, generationReason: "buyer_neighborhood",
    });
  }

  // 4) Buyer → Financing check (budget gap signal)
  if (buyer.budget_max != null && topMatches.some((m) => (m.estimated_deal_value ?? 0) > (buyer.budget_max ?? 0) * 1.05)) {
    inputs.push({
      type: "buyer_financing_check", targetType: "buyer", targetId: buyerId,
      title: "בדיקת יכולת מימון מול פער תקציב",
      signals: { urgencySignal: 60, buyerReadiness: 40 },
      evidence: [{ kind: "buyer", label_hebrew: "פער בין התקציב למחירי הנכסים המתאימים", weight: 55 }],
      assignedUserId: buyer.owner_id, generationReason: "buyer_financing",
    });
  }

  const ids = await persistRecommendations("buyer", buyerId, inputs);
  return { created: ids.length };
}

// ── Part 4 · Seller recommendations ──────────────────────────────────────────
export async function generateSellerRecommendations(sellerId: string) {
  await ctx();
  const seller = await getSellerById(sellerId);
  if (!seller) throw new Error("המוכר לא נמצא");
  const supabase = await createClient();
  const inputs: RecInput[] = [];

  // Linked properties (via property_sellers)
  const { data: links } = await supabase.from("property_sellers").select("property_id").eq("seller_id", sellerId);
  const propertyIds = ((links ?? []) as { property_id: string }[]).map((l) => l.property_id);

  // 1) Seller → Pricing (per property, only with real comparable transactions)
  for (const pid of propertyIds.slice(0, 5)) {
    const prop = await getPropertyById(pid);
    if (!prop) continue;
    const txn = await comparableTransactions(prop.city, prop.neighborhood);
    if (txn.count === 0) continue; // never claim market value without evidence
    inputs.push({
      type: "seller_pricing", targetType: "property", targetId: pid,
      title: "שיחת תמחור מבוססת עסקאות אמת",
      signals: { transactionEvidence: 85, sellerTrust: 60, marketDemand: 60 },
      evidence: txn.evidence, hasVerifiedTransactions: txn.hasVerified,
      supporting: { transactions: txn.items, properties: [{ property_id: pid }], market: txn.avgPpsqm ? { avg_price_per_sqm: txn.avgPpsqm } : {} },
      assignedUserId: seller.owner_id, generationReason: "seller_pricing",
    });
    inputs.push({
      type: "seller_transaction_package", targetType: "transaction", targetId: null,
      title: "דוח עסקאות דומות למוכר",
      signals: { transactionEvidence: 80 }, evidence: txn.evidence, hasVerifiedTransactions: txn.hasVerified,
      supporting: { transactions: txn.items }, assignedUserId: seller.owner_id, generationReason: "seller_transactions",
    });
  }

  // 2) Seller → Buyer pool (interested buyers via seller's properties)
  const interested = await matchIntelligenceRepository.listForSeller(sellerId).catch(() => []);
  if (interested.length) {
    const best = [...interested].sort((a, b) => b.closing_probability - a.closing_probability)[0];
    inputs.push({
      type: "seller_buyer_pool", targetType: "seller", targetId: sellerId,
      title: `${interested.length} קונים מתאימים במאגר`,
      signals: { entityFit: best.compatibility_score, matchProbability: best.closing_probability, marketDemand: 70, revenueImpact: best.opportunity_score },
      evidence: [{ kind: "match", label_hebrew: `${interested.length} קונים בעלי התאמה לנכסי המוכר`, weight: Math.min(90, 50 + interested.length * 6) }],
      supporting: { buyers: interested.map((m) => ({ buyer_id: m.buyer_id })) },
      assignedUserId: seller.owner_id, generationReason: "seller_buyer_pool",
    });
  }

  // 3) Seller → Marketing plan (lightweight, always allowed but low confidence without data)
  if (propertyIds.length) {
    inputs.push({
      type: "seller_marketing_plan", targetType: "seller", targetId: sellerId,
      title: "תוכנית שיווק והפצה למוכר",
      signals: { marketDemand: 55, sellerTrust: 55 },
      evidence: [{ kind: "inventory", label_hebrew: `${propertyIds.length} נכסים פעילים למוכר`, weight: 45 }],
      assignedUserId: seller.owner_id, generationReason: "seller_marketing",
    });
  }

  const ids = await persistRecommendations("seller", sellerId, inputs);
  return { created: ids.length };
}

// ── Part 5 · Property recommendations ────────────────────────────────────────
export async function generatePropertyRecommendations(propertyId: string) {
  await ctx();
  const prop = await getPropertyById(propertyId);
  if (!prop) throw new Error("הנכס לא נמצא");
  const matches = await matchIntelligenceRepository.listForProperty(propertyId);
  const inputs: RecInput[] = [];

  // 1) Property → Buyer (top buyers by closing probability)
  for (const m of [...matches].sort((a, b) => b.closing_probability - a.closing_probability).slice(0, 6)) {
    inputs.push({
      type: "property_buyer", targetType: "buyer", targetId: m.buyer_id,
      title: "קונה מומלץ לנכס",
      signals: matchSignals(m), evidence: [
        { kind: "match", label_hebrew: `התאמה ${Math.round(m.compatibility_score)}%`, weight: m.compatibility_score },
        { kind: "forecast", label_hebrew: `סבירות סגירה ${Math.round(m.closing_probability)}%`, weight: m.closing_probability },
      ],
      dealValue: m.estimated_deal_value ?? undefined, commissionPct: 2,
      supporting: { buyers: [{ buyer_id: m.buyer_id }] },
      assignedUserId: prop.owner_id, generationReason: "property_buyer",
    });
  }

  // 2) Property → Pricing (real comparables only)
  const txn = await comparableTransactions(prop.city, prop.neighborhood);
  if (txn.count > 0) {
    inputs.push({
      type: "property_pricing", targetType: "property", targetId: propertyId,
      title: "בחינת מחיר מול עסקאות אחרונות",
      signals: { transactionEvidence: 85, marketDemand: 60, propertyHealth: 60 },
      evidence: txn.evidence, hasVerifiedTransactions: txn.hasVerified,
      supporting: { transactions: txn.items, market: txn.avgPpsqm ? { avg_price_per_sqm: txn.avgPpsqm } : {} },
      assignedUserId: prop.owner_id, generationReason: "property_pricing",
    });
  }

  // 3) Property → Distribution (if active)
  if (prop.status === "active" || prop.status === "published") {
    inputs.push({
      type: "property_distribution", targetType: "property", targetId: propertyId,
      title: "הוספת הנכס לתור ההפצה היומי",
      signals: { marketDemand: 55, propertyHealth: 55 },
      evidence: [{ kind: "inventory", label_hebrew: "נכס פעיל שטרם מופץ באופן יומי", weight: 45 }],
      assignedUserId: prop.owner_id, generationReason: "property_distribution",
    });
  }

  const ids = await persistRecommendations("property", propertyId, inputs);
  return { created: ids.length };
}

// ── Part 6 · Lead recommendations ────────────────────────────────────────────
export async function generateLeadRecommendations(leadId: string) {
  await ctx();
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) throw new Error("הליד לא נמצא");
  const l = lead as { id: string; owner_id: string | null; property_id: string | null; stage: string; converted_buyer_id: string | null; last_activity_at: string | null };
  const inputs: RecInput[] = [];

  // 1) Lead → Property of interest (if the lead references a property)
  if (l.property_id) {
    inputs.push({
      type: "lead_property", targetType: "property", targetId: l.property_id,
      title: "שלח לליד את הנכס שעניין אותו + נכסים דומים",
      signals: { entityFit: 65, marketDemand: 60, urgencySignal: 60 },
      evidence: [{ kind: "inventory", label_hebrew: "הליד הביע עניין בנכס ספציפי", weight: 60 }],
      supporting: { properties: [{ property_id: l.property_id }] },
      assignedUserId: l.owner_id, generationReason: "lead_property",
    });
  }

  // 2) Lead → Routing (if unassigned)
  if (!l.owner_id) {
    inputs.push({
      type: "lead_routing", targetType: "lead", targetId: leadId,
      title: "נתב את הליד לסוכן המתאים",
      signals: { urgencySignal: 70, revenueImpact: 50 },
      evidence: [{ kind: "graph", label_hebrew: "ליד פתוח ללא שיוך — סיכון לאובדן", weight: 60 }],
      generationReason: "lead_routing",
    });
  }

  // 3) Lead → Follow-up (always, urgency from staleness)
  const stale = l.last_activity_at ? Date.now() - new Date(l.last_activity_at).getTime() > 3 * 86_400_000 : true;
  inputs.push({
    type: "lead_followup", targetType: "lead", targetId: leadId,
    title: "צור מעקב מול הליד",
    signals: { urgencySignal: stale ? 75 : 45, communicationFreshness: stale ? 20 : 70 },
    evidence: [{ kind: "communication", label_hebrew: stale ? "אין פעילות מעל 3 ימים" : "ליד פעיל — שמור על קשר", weight: stale ? 65 : 40 }],
    overdue: stale, assignedUserId: l.owner_id, generationReason: "lead_followup",
  });

  const ids = await persistRecommendations("lead", leadId, inputs);
  return { created: ids.length };
}

// ── Part 7 · Agent daily recommendations ─────────────────────────────────────
/** Aggregate the agent's highest-value open recommendations into a ranked day. */
export async function generateAgentDailyRecommendations(userId?: string) {
  const { userId: me } = await ctx();
  const target = userId ?? me;
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("recommendations")
    .select("id,title_hebrew,recommendation_score,urgency_score,impact_score,confidence_score,expected_revenue,next_best_action_hebrew,recommendation_type,source_entity_type,source_entity_id")
    .eq("organization_id", orgId).eq("assigned_user_id", target).in("status", ["new", "reviewed"])
    .order("recommendation_score", { ascending: false }).limit(50);
  const recs = (data ?? []) as { id: string; recommendation_score: number; urgency_score: number; impact_score: number; confidence_score: number; expected_revenue: number; title_hebrew: string; next_best_action_hebrew: string }[];
  const ranked = rankRecommendations(recs).slice(0, 10);
  return {
    count: ranked.length,
    expectedRevenue: ranked.reduce((a, r) => a + (r.expected_revenue ?? 0), 0),
    actions: ranked.map((r) => ({ id: r.id, title: r.title_hebrew, action: r.next_best_action_hebrew, score: r.recommendation_score, revenue: r.expected_revenue })),
  };
}

// ── Part 8 · Office recommendations (manager) ────────────────────────────────
export async function generateOfficeRecommendations() {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("recommendations")
    .select("id,title_hebrew,recommendation_score,urgency_score,impact_score,confidence_score,expected_revenue,next_best_action_hebrew,recommendation_type")
    .eq("organization_id", orgId).in("status", ["new", "reviewed"])
    .order("impact_score", { ascending: false }).limit(80);
  const recs = (data ?? []) as { id: string; recommendation_score: number; urgency_score: number; impact_score: number; confidence_score: number; expected_revenue: number; title_hebrew: string; next_best_action_hebrew: string; recommendation_type: string }[];
  const ranked = rankRecommendations(recs).slice(0, 12);
  return {
    count: ranked.length,
    pipelineRevenue: recs.reduce((a, r) => a + (r.expected_revenue ?? 0), 0),
    priorities: ranked.map((r) => ({ id: r.id, title: r.title_hebrew, action: r.next_best_action_hebrew, type: r.recommendation_type, revenue: r.expected_revenue })),
  };
}

// ── Part 9 · Acquisition recommendations ─────────────────────────────────────
export async function generateAcquisitionRecommendations(acquisitionProfileId: string) {
  await ctx();
  const supabase = await createClient();
  const { data: prof } = await supabase.from("inventory_acquisition_profiles")
    .select("id,external_listing_id,acquisition_score,opportunity_score").eq("id", acquisitionProfileId).maybeSingle();
  if (!prof) throw new Error("פרופיל הרכש לא נמצא");
  const p = prof as { id: string; external_listing_id: string | null; acquisition_score: number | null; opportunity_score: number | null };
  const score = p.acquisition_score ?? p.opportunity_score ?? 0;
  const inputs: RecInput[] = [{
    type: "acquisition_seller_outreach", targetType: "acquisition", targetId: acquisitionProfileId,
    title: "פנייה למוכר בהזדמנות רכש",
    signals: { revenueImpact: score, marketDemand: score, urgencySignal: 60 },
    evidence: [{ kind: "inventory", label_hebrew: `ציון הזדמנות רכש ${Math.round(score)}`, weight: Math.min(85, score) }],
    generationReason: "acquisition_outreach",
  }, {
    type: "acquisition_property_research", targetType: "acquisition", targetId: acquisitionProfileId,
    title: "הפקת מחקר נכס מלא לפני פנייה",
    signals: { propertyHealth: 50, transactionEvidence: 50 },
    evidence: [{ kind: "inventory", label_hebrew: "נדרש מחקר עסקאות לתמיכה בפנייה", weight: 45 }],
    generationReason: "acquisition_research",
  }];
  const ids = await persistRecommendations("acquisition", acquisitionProfileId, inputs);
  return { created: ids.length };
}

// ── Part 10 · Deal recommendations ───────────────────────────────────────────
export async function generateDealRecommendations(dealProfileId: string) {
  await ctx();
  const supabase = await createClient();
  const { data: deal } = await supabase.from("deal_profiles").select("*").eq("id", dealProfileId).maybeSingle();
  if (!deal) throw new Error("העסקה לא נמצאה");
  const d = deal as { id: string; deal_health_score?: number | null; closing_probability?: number | null; assigned_agent_id?: string | null };
  const health = d.deal_health_score ?? 50;
  const closing = d.closing_probability ?? 50;
  const inputs: RecInput[] = [{
    type: "deal_closing_action", targetType: "deal", targetId: dealProfileId,
    title: "פעולת הסגירה הבאה בעסקה",
    signals: { dealForecast: closing, revenueImpact: 70, urgencySignal: 100 - health },
    evidence: [{ kind: "deal", label_hebrew: `בריאות עסקה ${Math.round(health)} · סבירות סגירה ${Math.round(closing)}%`, weight: Math.round((health + closing) / 2) }],
    overdue: health < 40, generationReason: "deal_closing",
  }];
  if (closing < 60) {
    inputs.push({
      type: "deal_negotiation_action", targetType: "deal", targetId: dealProfileId,
      title: "התקדמות במשא ומתן עם ראיות מחיר",
      signals: { dealForecast: closing, urgencySignal: 60 },
      evidence: [{ kind: "deal", label_hebrew: "סבירות סגירה בינונית — נדרש מהלך מו״מ", weight: 55 }],
      generationReason: "deal_negotiation",
    });
  }
  const ids = await persistRecommendations("deal", dealProfileId, inputs);
  return { created: ids.length };
}

// ── Reads for UI ─────────────────────────────────────────────────────────────
export interface RecommendationView {
  id: string; recommendation_type: string; title_hebrew: string; reason_hebrew: string | null;
  next_best_action_hebrew: string | null; recommendation_score: number; confidence_score: number;
  urgency_score: number; impact_score: number; expected_revenue: number; status: string; review_status: string;
  source_entity_type: string; source_entity_id: string; target_entity_type: string; target_entity_id: string | null;
  source_confidence: string;
}

export async function listRecommendationsForEntity(entityType: string, entityId: string): Promise<RecommendationView[]> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("recommendations")
    .select("id,recommendation_type,title_hebrew,reason_hebrew,next_best_action_hebrew,recommendation_score,confidence_score,urgency_score,impact_score,expected_revenue,status,review_status,source_entity_type,source_entity_id,target_entity_type,target_entity_id,source_confidence")
    .eq("organization_id", orgId).eq("source_entity_type", entityType).eq("source_entity_id", entityId)
    .order("recommendation_score", { ascending: false });
  return rankRecommendations((data ?? []) as RecommendationView[]);
}

export interface RecommendationCommandCenter {
  total: number; highPriority: number; needsMoreData: number; readyPackages: number;
  expectedRevenue: number; accepted: number; rejected: number; converted: number;
  byType: { type: string; count: number }[];
  top: RecommendationView[]; recentlyConverted: RecommendationView[]; needsData: RecommendationView[];
}

export async function getRecommendationCommandCenter(): Promise<RecommendationCommandCenter> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const [allR, pkgR] = await Promise.all([
    supabase.from("recommendations")
      .select("id,recommendation_type,title_hebrew,reason_hebrew,next_best_action_hebrew,recommendation_score,confidence_score,urgency_score,impact_score,expected_revenue,status,review_status,source_entity_type,source_entity_id,target_entity_type,target_entity_id,source_confidence,converted_at")
      .eq("organization_id", orgId).order("recommendation_score", { ascending: false }).limit(500),
    supabase.from("recommendation_packages").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "ready_for_review"),
  ]);
  const all = (allR.data ?? []) as (RecommendationView & { converted_at: string | null })[];
  const open = all.filter((r) => r.status === "new" || r.status === "reviewed");
  const byTypeMap = new Map<string, number>();
  for (const r of open) byTypeMap.set(r.recommendation_type, (byTypeMap.get(r.recommendation_type) ?? 0) + 1);
  return {
    total: open.length,
    highPriority: open.filter((r) => r.recommendation_score >= 70).length,
    needsMoreData: open.filter((r) => r.review_status === "needs_more_data").length,
    readyPackages: pkgR.count ?? 0,
    expectedRevenue: open.reduce((a, r) => a + (r.expected_revenue ?? 0), 0),
    accepted: all.filter((r) => r.status === "accepted").length,
    rejected: all.filter((r) => r.status === "rejected").length,
    converted: all.filter((r) => r.status === "converted").length,
    byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    top: rankRecommendations(open.filter((r) => r.review_status !== "needs_more_data")).slice(0, 12),
    recentlyConverted: all.filter((r) => r.status === "converted").slice(0, 10),
    needsData: open.filter((r) => r.review_status === "needs_more_data").slice(0, 10),
  };
}
