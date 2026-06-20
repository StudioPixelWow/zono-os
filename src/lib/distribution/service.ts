/**
 * Social Community Intelligence + Assisted Distribution service — server-only.
 * Builds community DNA, property↔community matches, distribution plans and the
 * Daily Assisted Distribution Workspace. Deterministic. NO publishing, NO LLM,
 * NO Meta API. Assisted-manual mode only. Org-scoped.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import { buildPostContent, chooseAngle, type PropertyForPost } from "./content";

type DB = Database["public"]["Tables"];
type CommunityRow = DB["community_profiles"]["Row"];
type IntelRow = DB["community_intelligence_profiles"]["Row"];
const ACTIVE_PROP = new Set(["active", "published", "ready", "under_offer", "in_contract"]);
const APPROVED = new Set(["approved_for_analysis", "approved_for_distribution"]);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const cityNorm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id };
}

function primaryAudience(type: string, price: number | null): string {
  if (["commercial", "office", "land"].includes(type)) return "commercial";
  if ((price ?? 0) >= 4_000_000) return "luxury";
  if (price != null && price <= 1_800_000) return "young";
  return "families";
}

// ── Community approval ───────────────────────────────────────────────────────
export async function setCommunityApproval(communityId: string, status: string, reason?: string): Promise<void> {
  const { userId, orgId } = await ctx();
  const supabase = await createClient();
  await supabase.from("community_profiles").update({
    approval_status: status, approved_by: APPROVED.has(status) ? userId : null,
    approved_at: APPROVED.has(status) ? new Date().toISOString() : null, rejection_reason: status === "rejected" ? (reason ?? null) : null,
  } as never).eq("id", communityId);
  await supabase.from("community_activity_logs").insert({ organization_id: orgId, community_id: communityId, activity_type: status === "rejected" ? "rejected" : "approved", title: status } as never);
}

// ── Recompute distribution intelligence ──────────────────────────────────────
export interface DistRecomputeSummary { communities: number; matches: number; plans: number; opportunities: number }

export async function recomputeDistributionIntelligence(): Promise<DistRecomputeSummary> {
  const { orgId } = await ctx();
  const supabase = await createClient();

  const [commRes, intelRes, propsRes, marketRes] = await Promise.all([
    supabase.from("community_profiles").select("*").in("approval_status", ["approved_for_analysis", "approved_for_distribution"]).limit(1000),
    supabase.from("community_intelligence_profiles").select("*").limit(1000),
    supabase.from("properties").select("id,title,type,city,neighborhood,price,rooms,size_sqm,zono_score,status").limit(2000),
    supabase.from("market_area_snapshots").select("locality_name,demand_score,date").order("date", { ascending: false }).limit(400),
  ]);
  const communities = commRes.data ?? [];
  const intelByComm = new Map((intelRes.data ?? []).map((i) => [i.community_id, i]));
  const properties = (propsRes.data ?? []).filter((p) => ACTIVE_PROP.has(p.status as string));
  const demandByCity = new Map<string, number>();
  for (const m of marketRes.data ?? []) { const k = cityNorm(m.locality_name); if (!demandByCity.has(k)) demandByCity.set(k, m.demand_score); }

  // Community DNA (deterministic from community fields + intel).
  const dnaRows: DB["community_dna_profiles"]["Insert"][] = communities.map((c) => ({
    organization_id: orgId, community_id: c.id,
    audience_mix: { [c.audience_type]: 100 } as never,
    property_type_fit: (c.community_type === "luxury" ? { penthouse: 80, apartment: 60 } : c.community_type === "commercial" ? { commercial: 90, office: 70 } : { apartment: 80, garden_apartment: 60 }) as never,
    budget_ranges: {} as never,
    preferred_localities: c.city ? [c.city] : [], preferred_neighborhoods: c.neighborhood ? [c.neighborhood] : [],
    best_content_types: ["תמונות", "סרטון סיור", "נקודות מכירה"], best_posting_times: ["ראשון 20:00", "שלישי 13:00", "חמישי 19:00"] as never,
    communication_style: c.audience_type === "luxury" ? "יוקרתי ומדויק" : c.audience_type === "investors" ? "ענייני ומבוסס נתונים" : "חם וקהילתי",
    community_strengths: [] as never, community_weaknesses: [] as never,
    confidence_score: clamp(50 + (intelByComm.get(c.id)?.community_health_score ?? 0) * 0.3),
  }));
  await supabase.from("community_dna_profiles").delete().eq("organization_id", orgId);
  for (let i = 0; i < dnaRows.length; i += 500) { const cc = dnaRows.slice(i, i + 500); if (cc.length) await supabase.from("community_dna_profiles").insert(cc as never); }

  // Property ↔ community matches + distribution plans.
  const matchRows: DB["property_community_matches"]["Insert"][] = [];
  const planRows: DB["distribution_plans"]["Insert"][] = [];
  const planItemSpecs: { propertyId: string; items: { communityId: string; match: number; reach: number; leads: number; deals: number; revenue: number; reason: string }[] }[] = [];

  for (const p of properties) {
    const aud = primaryAudience(p.type as string, p.price);
    const ranked = communities.map((c) => {
      const intel = intelByComm.get(c.id);
      const audienceScore = c.audience_type === aud ? 100 : (c.audience_type === "mixed" || c.audience_type === "buyers") ? 60 : 35;
      const locationScore = p.city && c.city ? (cityNorm(p.city) === cityNorm(c.city) ? 100 : 40) : 50;
      const ptScore = c.community_type === "real_estate" || c.community_type === "projects" ? 80 : c.community_type === aud ? 90 : 55;
      const engagement = clamp(intel?.activity_score ?? c.engagement_score);
      const historical = clamp((intel?.deal_generation_score ?? c.deal_score) * 0.6 + (intel?.lead_quality_score ?? c.lead_score) * 0.4);
      const compliance = clamp(100 - (intel?.spam_risk_score ?? 0) - (intel?.compliance_risk_score ?? 0));
      const risky = (intel?.intelligence_level === "risky") || compliance < 40;
      const matchScore = clamp(audienceScore * 0.28 + locationScore * 0.22 + ptScore * 0.12 + engagement * 0.16 + historical * 0.18 + compliance * 0.04 - (risky ? 25 : 0));
      const reach = Math.round((c.members_count || 200) * (engagement / 100) * 0.3);
      const leads = Math.max(0, Math.round(reach * (historical / 1000)));
      const deals = leads >= 8 ? 1 : 0;
      const revenue = deals * 35000;
      return { community: c, matchScore, audienceScore, locationScore, ptScore, engagement, historical, compliance, leadPotential: clamp(historical), dealPotential: clamp(historical * 0.7), reach, leads, deals, revenue,
        reason: `${audienceScore >= 100 ? "התאמת קהל מלאה" : "התאמת קהל חלקית"}${locationScore >= 100 ? " · אותו אזור" : ""}${risky ? " · קהילה בסיכון" : ""}` };
    }).sort((a, b) => b.matchScore - a.matchScore);

    const top = ranked.slice(0, 20);
    let rank = 0;
    for (const r of top) {
      rank++;
      matchRows.push({
        organization_id: orgId, property_id: p.id, community_id: r.community.id, match_score: r.matchScore,
        audience_score: r.audienceScore, location_score: r.locationScore, property_type_score: r.ptScore, budget_score: 60,
        engagement_score: r.engagement, historical_score: r.historical, lead_potential_score: r.leadPotential, deal_potential_score: r.dealPotential,
        compliance_score: r.compliance, confidence_score: clamp(60 + r.matchScore * 0.3), recommended_rank: rank, reason: r.reason,
        expected_reach: r.reach, expected_leads: r.leads, expected_deals: r.deals, expected_revenue: r.revenue, status: "suggested",
      });
    }
    const planTop = top.slice(0, 6);
    if (planTop.length) {
      const reach = planTop.reduce((s, r) => s + r.reach, 0);
      const leads = planTop.reduce((s, r) => s + r.leads, 0);
      const deals = planTop.reduce((s, r) => s + r.deals, 0);
      const revenue = planTop.reduce((s, r) => s + r.revenue, 0);
      planRows.push({
        organization_id: orgId, property_id: p.id, status: "ready_for_review",
        distribution_score: clamp(planTop[0].matchScore), expected_reach: reach, expected_leads: leads, expected_matches: planTop.length, expected_deals: deals, expected_revenue: revenue,
        recommended_strategy: aud === "luxury" ? "פרסום פרימיום ממוקד" : aud === "commercial" ? "ערוצים עסקיים" : "הפצה קהילתית רחבה",
        recommended_frequency: "2-3 פעמים בשבוע", recommended_time_window: "ערב 19:00-21:00",
        summary: `${planTop.length} קהילות מומלצות · צפי ${leads} לידים · חשיפה ${reach.toLocaleString()}.`,
      });
      planItemSpecs.push({ propertyId: p.id, items: planTop.map((r) => ({ communityId: r.community.id, match: r.matchScore, reach: r.reach, leads: r.leads, deals: r.deals, revenue: r.revenue, reason: r.reason })) });
    }
  }

  await supabase.from("property_community_matches").delete().eq("organization_id", orgId);
  for (let i = 0; i < matchRows.length; i += 500) { const cc = matchRows.slice(i, i + 500); if (cc.length) await supabase.from("property_community_matches").insert(cc as never); }

  // Plans (regen) + items.
  await supabase.from("distribution_plans").delete().eq("organization_id", orgId);
  const planIdByProp = new Map<string, string>();
  for (let i = 0; i < planRows.length; i += 200) {
    const chunk = planRows.slice(i, i + 200);
    const { data } = await supabase.from("distribution_plans").insert(chunk as never).select("id,property_id");
    for (const pr of data ?? []) planIdByProp.set(pr.property_id, pr.id);
  }
  const itemRows: DB["distribution_plan_items"]["Insert"][] = [];
  for (const spec of planItemSpecs) {
    const planId = planIdByProp.get(spec.propertyId); if (!planId) continue;
    let order = 0;
    for (const it of spec.items) {
      order++;
      itemRows.push({ organization_id: orgId, distribution_plan_id: planId, community_id: it.communityId, recommended_order: order, recommended_posting_time: "ערב", recommended_frequency: "שבועי", expected_reach: it.reach, expected_leads: it.leads, expected_deals: it.deals, expected_revenue: it.revenue, status: "suggested", reason: it.reason });
    }
  }
  for (let i = 0; i < itemRows.length; i += 500) { const cc = itemRows.slice(i, i + 500); if (cc.length) await supabase.from("distribution_plan_items").insert(cc as never); }

  // Opportunity signals.
  const oppRows: DB["distribution_opportunity_signals"]["Insert"][] = [];
  for (const c of communities) {
    const intel = intelByComm.get(c.id);
    if (intel?.intelligence_level === "elite" || (intel?.roi_score ?? 0) >= 70) oppRows.push({ organization_id: orgId, signal_type: "high_roi_community", community_id: c.id, locality: c.city, title: `${c.name} · ROI גבוה`, description: "קהילה עם החזר גבוה — הגבר הפצה", impact_score: intel?.roi_score ?? 70, expected_leads: 5, urgency_score: 60, confidence_score: 70 });
    if (intel?.intelligence_level === "dead" || (intel?.activity_score ?? 100) < 20) oppRows.push({ organization_id: orgId, signal_type: "inactive_community", community_id: c.id, locality: c.city, title: `${c.name} · לא פעילה`, description: "קהילה לא פעילה — שקול הסרה", impact_score: 40, urgency_score: 40, confidence_score: 65 });
    if (intel && (intel.spam_risk_score >= 50 || intel.compliance_risk_score >= 50)) oppRows.push({ organization_id: orgId, signal_type: "risky_community", community_id: c.id, locality: c.city, title: `${c.name} · סיכון תאימות`, description: "סיכון ספאם/תאימות — הימנע מהפצה", impact_score: 50, urgency_score: 55, confidence_score: 60 });
  }
  // Locality distribution gaps + property promotion.
  const commByCity = new Map<string, number>();
  for (const c of communities) { const k = cityNorm(c.city); commByCity.set(k, (commByCity.get(k) ?? 0) + 1); }
  for (const [k, demand] of demandByCity) { if (demand >= 60 && (commByCity.get(k) ?? 0) === 0) { const label = k.charAt(0).toUpperCase() + k.slice(1); oppRows.push({ organization_id: orgId, signal_type: "missing_community", locality: label, title: `${label} · חסרות קהילות`, description: "ביקוש גבוה ללא קהילות מאושרות — הוסף קהילות", impact_score: demand, urgency_score: 60, confidence_score: 68 }); } }
  for (const pr of planRows.sort((a, b) => (b.distribution_score ?? 0) - (a.distribution_score ?? 0)).slice(0, 6)) { if ((pr.distribution_score ?? 0) >= 60) oppRows.push({ organization_id: orgId, signal_type: "property_promotion_opportunity", property_id: pr.property_id ?? null, title: "נכס מומלץ להפצה", description: pr.summary ?? "", impact_score: pr.distribution_score ?? 0, expected_leads: pr.expected_leads ?? 0, urgency_score: 65, confidence_score: 70 }); }

  await supabase.from("distribution_opportunity_signals").delete().eq("organization_id", orgId);
  for (let i = 0; i < oppRows.length; i += 500) { const cc = oppRows.slice(i, i + 500); if (cc.length) await supabase.from("distribution_opportunity_signals").insert(cc as never); }

  return { communities: communities.length, matches: matchRows.length, plans: planRows.length, opportunities: oppRows.length };
}

// ── Generate the daily assisted-distribution batch ───────────────────────────
export async function generateDailyBatch(): Promise<{ items: number }> {
  const { userId, orgId } = await ctx();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: items } = await supabase.from("distribution_plan_items")
    .select("id,distribution_plan_id,community_id,expected_reach,expected_leads,expected_deals,reason,distribution_plans(property_id)")
    .eq("status", "suggested").order("expected_leads", { ascending: false }).limit(40);
  if (!items?.length) return { items: 0 };

  // Resolve property + community details.
  const propIds = [...new Set(items.map((i) => (i as unknown as { distribution_plans?: { property_id?: string } }).distribution_plans?.property_id).filter((x): x is string => !!x))];
  const commIds = [...new Set(items.map((i) => i.community_id))];
  const [propsRes, commRes, mpRes] = await Promise.all([
    supabase.from("properties").select("id,title,type,city,neighborhood,price,rooms,size_sqm").in("id", propIds.length ? propIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("community_profiles").select("id,name,audience_type,platform,city,source_url").in("id", commIds.length ? commIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("property_marketing_profiles").select("property_id,recommended_publishing_times").in("property_id", propIds.length ? propIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const propById = new Map((propsRes.data ?? []).map((p) => [p.id, p]));
  const commById = new Map((commRes.data ?? []).map((c) => [c.id, c]));
  const timesByProp = new Map((mpRes.data ?? []).map((m) => [m.property_id, (m.recommended_publishing_times as string[] | null) ?? []]));

  // Upsert today's batch.
  const { data: batch } = await supabase.from("daily_distribution_batches").upsert({ organization_id: orgId, user_id: userId, batch_date: today, status: "ready" } as never, { onConflict: "organization_id,user_id,batch_date" }).select("id").single();
  if (!batch?.id) return { items: 0 };
  await supabase.from("daily_distribution_items").delete().eq("batch_id", batch.id);

  // Take top ~10 distinct (property, community) items for today.
  const chosen = items.slice(0, 10);
  const dailyRows: DB["daily_distribution_items"]["Insert"][] = [];
  let reachSum = 0, leadsSum = 0, dealsSum = 0;
  for (const it of chosen) {
    const propId = (it as unknown as { distribution_plans?: { property_id?: string } }).distribution_plans?.property_id;
    const p = propId ? propById.get(propId) : null;
    const c = commById.get(it.community_id);
    if (!p || !c) continue;
    const forPost: PropertyForPost = { title: p.title, type: p.type as string, city: p.city, neighborhood: p.neighborhood, price: p.price, rooms: p.rooms, sqm: p.size_sqm };
    const angle = chooseAngle(forPost, c.audience_type);
    const content = buildPostContent(forPost, { name: c.name, audienceType: c.audience_type, city: c.city, platform: c.platform }, angle);
    const times = timesByProp.get(propId!) ?? [];
    reachSum += it.expected_reach; leadsSum += it.expected_leads; dealsSum += it.expected_deals;
    dailyRows.push({
      organization_id: orgId, batch_id: batch.id, user_id: userId, property_id: propId ?? null, community_id: c.id,
      distribution_plan_id: it.distribution_plan_id, distribution_plan_item_id: it.id, platform: c.platform, community_url: c.source_url,
      property_title: p.title, community_name: c.name, recommended_time: times[0] ?? "ערב 20:00",
      priority_score: clamp(it.expected_leads * 10 + 40), expected_reach: it.expected_reach, expected_leads: it.expected_leads, expected_deals: it.expected_deals,
      post_text: content.postText, post_title: content.headline, suggested_cta: content.cta, suggested_hashtags: content.hashtags,
      copy_payload: { angle: content.angle, tone: content.tone } as never, status: "pending",
    });
  }
  for (let i = 0; i < dailyRows.length; i += 500) { const cc = dailyRows.slice(i, i + 500); if (cc.length) await supabase.from("daily_distribution_items").insert(cc as never); }
  await supabase.from("daily_distribution_batches").update({ total_items: dailyRows.length, expected_reach: reachSum, expected_leads: leadsSum, expected_deals: dealsSum, summary: `${dailyRows.length} פריטים להפצה היום · צפי ${leadsSum} לידים.` } as never).eq("id", batch.id);
  return { items: dailyRows.length };
}

export async function markDailyItem(itemId: string, status: string, opts?: { url?: string; reason?: string }): Promise<void> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "manual_published") { patch.manual_published_at = new Date().toISOString(); if (opts?.url) patch.manual_post_url = opts.url; }
  if (status === "skipped") patch.skipped_reason = opts?.reason ?? null;
  if (status === "failed") patch.failure_reason = opts?.reason ?? null;
  const { data: item } = await supabase.from("daily_distribution_items").update(patch as never).eq("id", itemId).select("batch_id,community_id,property_id,distribution_plan_item_id").single();
  if (!item) return;
  // Recompute batch counters.
  const { data: siblings } = await supabase.from("daily_distribution_items").select("status").eq("batch_id", item.batch_id);
  const counts = { published: 0, skipped: 0, failed: 0 };
  for (const s of siblings ?? []) { if (s.status === "manual_published") counts.published++; else if (s.status === "skipped") counts.skipped++; else if (s.status === "failed") counts.failed++; }
  const total = (siblings ?? []).length;
  const done = counts.published + counts.skipped + counts.failed;
  await supabase.from("daily_distribution_batches").update({ published_items: counts.published, skipped_items: counts.skipped, failed_items: counts.failed, status: done >= total ? "completed" : "in_progress" } as never).eq("id", item.batch_id);
  if (status === "manual_published") {
    await supabase.from("community_activity_logs").insert({ organization_id: orgId, community_id: item.community_id, activity_type: "post_manual_published", entity_type: "property", entity_id: item.property_id, title: "פורסם ידנית" } as never);
    if (item.distribution_plan_item_id) await supabase.from("distribution_plan_items").update({ status: "manual_published" } as never).eq("id", item.distribution_plan_item_id);
  }
}

// ── Read models ──────────────────────────────────────────────────────────────
export interface DistributionBoard {
  communities: (CommunityRow & { intel: IntelRow | null })[];
  reviewQueue: CommunityRow[];
  approved: (CommunityRow & { intel: IntelRow | null })[];
  opportunities: DB["distribution_opportunity_signals"]["Row"][];
  plans: { propertyId: string; title: string; score: number; reach: number; leads: number; communities: number }[];
}

export async function getDistributionBoard(): Promise<DistributionBoard> {
  const supabase = await createClient();
  const [commRes, intelRes, oppRes, planRes] = await Promise.all([
    supabase.from("community_profiles").select("*").order("members_count", { ascending: false }).limit(300),
    supabase.from("community_intelligence_profiles").select("*").limit(300),
    supabase.from("distribution_opportunity_signals").select("*").eq("status", "new").order("impact_score", { ascending: false }).limit(40),
    supabase.from("distribution_plans").select("property_id,distribution_score,expected_reach,expected_leads,expected_matches").order("distribution_score", { ascending: false }).limit(30),
  ]);
  const intelByComm = new Map((intelRes.data ?? []).map((i) => [i.community_id, i]));
  const communities = (commRes.data ?? []).map((c) => ({ ...c, intel: intelByComm.get(c.id) ?? null }));
  const plans = planRes.data ?? [];
  const titles = new Map<string, string>();
  if (plans.length) { const { data } = await supabase.from("properties").select("id,title,city").in("id", plans.map((p) => p.property_id)); for (const p of data ?? []) titles.set(p.id, `${p.title}${p.city ? ` · ${p.city}` : ""}`); }
  return {
    communities,
    reviewQueue: communities.filter((c) => ["discovered", "suggested"].includes(c.approval_status)),
    approved: communities.filter((c) => APPROVED.has(c.approval_status)),
    opportunities: oppRes.data ?? [],
    plans: plans.map((p) => ({ propertyId: p.property_id, title: titles.get(p.property_id) ?? "נכס", score: p.distribution_score, reach: p.expected_reach, leads: p.expected_leads, communities: p.expected_matches })),
  };
}

export interface DailyWorkspace {
  batch: DB["daily_distribution_batches"]["Row"] | null;
  items: DB["daily_distribution_items"]["Row"][];
}

export async function getDailyWorkspace(): Promise<DailyWorkspace> {
  const { userId } = await ctx();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: batch } = await supabase.from("daily_distribution_batches").select("*").eq("user_id", userId).eq("batch_date", today).maybeSingle();
  if (!batch) return { batch: null, items: [] };
  const { data: items } = await supabase.from("daily_distribution_items").select("*").eq("batch_id", batch.id).order("priority_score", { ascending: false });
  return { batch, items: items ?? [] };
}
