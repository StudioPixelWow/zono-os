/**
 * Social Lead Capture service — server-only. Scores social interactions into
 * reviewable social leads, and (on an explicit reviewed action) converts a
 * social lead into a CRM lead + buyer twin + intelligence init + activity +
 * attribution + graph links. Deterministic. NO LLM, NO auto-replies, NO
 * auto-send, NO auto-contact-creation. Org-scoped.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import type { Database, LeadSource } from "@/lib/supabase/types";
import { detectIntent, INTENT_LABEL, recommendedAction, toLeadIntent, type SocialIntent } from "./engine";

type DB = Database["public"]["Tables"];
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id };
}

const platformToSource = (p: string | null): LeadSource =>
  p === "facebook" ? "facebook" : p === "instagram" ? "instagram" : "other";

// ── Recompute: score interactions → build social leads ───────────────────────
export interface SocialRecomputeSummary { interactions: number; leads: number }

export async function recomputeSocialLeads(): Promise<SocialRecomputeSummary> {
  const { orgId } = await ctx();
  const supabase = await createClient();

  const { data: interactions } = await supabase.from("social_interactions").select("*").limit(3000);
  if (!interactions?.length) return { interactions: 0, leads: 0 };

  const { data: existingLeads } = await supabase.from("social_leads").select("id,social_interaction_id");
  const leadByInteraction = new Map((existingLeads ?? []).map((l) => [l.social_interaction_id, l.id]));

  let created = 0;
  for (const it of interactions) {
    const r = detectIntent(it.message_text, it.interaction_type);
    await supabase.from("social_interactions").update({
      detected_intent: r.intent, intent_score: r.intentScore, intent_confidence: r.intentConfidence,
      lead_quality: r.leadQuality, urgency_score: r.urgencyScore, lead_probability: r.leadProbability,
      interaction_score: clamp(r.leadQuality * 0.6 + r.intentScore * 0.4), engagement_level: r.engagementLevel,
      lead_score: r.leadQuality, status: r.intent === "spam" ? "spam" : it.status === "new" ? "reviewed" : it.status,
    } as never).eq("id", it.id);

    // Build a social lead for qualifying interactions (never spam/negative).
    const qualifies = r.intent !== "spam" && r.intent !== "negative" && r.leadProbability >= 45;
    if (!qualifies) continue;
    if (leadByInteraction.has(it.id)) {
      await supabase.from("social_leads").update({
        intent: r.intent, lead_score: r.leadQuality, lead_quality_score: r.leadQuality, intent_confidence: r.intentConfidence,
        urgency_score: r.urgencyScore, priority_score: clamp(r.leadQuality * 0.6 + r.urgencyScore * 0.4),
        recommended_next_action: recommendedAction(r.intent),
        ai_summary: `${INTENT_LABEL[r.intent]} · איכות ${r.leadQuality} · ביטחון ${r.intentConfidence}%`, ai_next_action: recommendedAction(r.intent),
      } as never).eq("id", leadByInteraction.get(it.id)!);
      continue;
    }
    await supabase.from("social_leads").insert({
      organization_id: orgId, social_interaction_id: it.id, community_id: it.community_id, property_id: it.property_id,
      platform: it.platform, source_url: it.external_post_url ?? it.source_post_url, profile_url: it.profile_url ?? it.source_profile_url,
      person_name: it.person_name ?? it.source_user_name, intent: r.intent, lead_score: r.leadQuality,
      status: "new", lead_quality_score: r.leadQuality, priority_score: clamp(r.leadQuality * 0.6 + r.urgencyScore * 0.4),
      intent_confidence: r.intentConfidence, urgency_score: r.urgencyScore, recommended_next_action: recommendedAction(r.intent),
      ai_summary: `${INTENT_LABEL[r.intent]} · איכות ${r.leadQuality} · ביטחון ${r.intentConfidence}%`, ai_next_action: recommendedAction(r.intent),
    } as never);
    created++;
  }
  // Refresh community last_lead_at proxy via activity log (lightweight).
  return { interactions: interactions.length, leads: created };
}

// ── Review (status changes, assignment) ──────────────────────────────────────
export async function reviewSocialLead(id: string, status: string, opts?: { agentId?: string | null; reason?: string }): Promise<void> {
  const { userId } = await ctx();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status, reviewed_by: userId, reviewed_at: new Date().toISOString() };
  if (opts?.agentId !== undefined) patch.assigned_agent_id = opts.agentId;
  if (status === "rejected") patch.rejection_reason = opts?.reason ?? null;
  await supabase.from("social_leads").update(patch as never).eq("id", id);
}

// ── Conversion: social lead → CRM lead + buyer twin + intel + graph ──────────
export interface ConversionResult { leadId: string; buyerId?: string; sellerId?: string }

export async function convertSocialLeadToLead(socialLeadId: string): Promise<ConversionResult> {
  const { userId, orgId } = await ctx();
  const supabase = await createClient();
  const { data: sl } = await supabase.from("social_leads").select("*").eq("id", socialLeadId).maybeSingle();
  if (!sl) throw new Error("social lead not found");
  if (sl.converted_buyer_id) throw new Error("כבר הומר");

  const name = sl.person_name ?? "ליד חברתי";
  const intent = sl.intent as SocialIntent;
  const leadIntent = toLeadIntent(intent);
  const communityCity = sl.community_id ? (await supabase.from("community_profiles").select("city").eq("id", sl.community_id).maybeSingle()).data?.city ?? null : null;

  // 1) CRM lead.
  const { data: lead } = await supabase.from("leads").insert({
    org_id: orgId, full_name: name, source: platformToSource(sl.platform), intent: leadIntent === "seller" ? "seller" : leadIntent === "investor" ? "investor" : "buyer",
    stage: "new", message: sl.ai_summary, score: sl.lead_quality_score, property_id: sl.property_id, owner_id: sl.assigned_agent_id,
  } as never).select("id").single();
  if (!lead?.id) throw new Error("יצירת הליד נכשלה");

  // 2) Twin — INTENT-AWARE (Stage 0.5 fix): seller-intent creates a SELLER, not a buyer.
  const isSeller = leadIntent === "seller";
  let buyerId: string | null = null;
  let sellerId: string | null = null;
  const twinType: "buyer" | "seller" = isSeller ? "seller" : "buyer";
  if (isSeller) {
    const { data: seller } = await supabase.from("sellers").insert({
      org_id: orgId, full_name: name, owner_id: sl.assigned_agent_id,
    } as never).select("id").single();
    if (!seller?.id) throw new Error("יצירת המוכר נכשלה");
    sellerId = seller.id as string;
    await supabase.from("seller_intelligence_profiles").insert({ org_id: orgId, seller_id: sellerId } as never);
  } else {
    const { data: buyer } = await supabase.from("buyers").insert({
      org_id: orgId, full_name: name, owner_id: sl.assigned_agent_id, notes: `נוצר מליד חברתי (${sl.platform ?? "social"}) · ${INTENT_LABEL[intent]}`,
      temperature: sl.lead_quality_score >= 75 ? "hot" : sl.lead_quality_score >= 50 ? "warm" : "cold",
      preferred_areas: communityCity ? [communityCity] : [], readiness: sl.lead_quality_score,
    } as never).select("id").single();
    if (!buyer?.id) throw new Error("יצירת הקונה נכשלה");
    buyerId = buyer.id as string;
    // 3) Buyer Intelligence init (minimal twin row; full recompute is separate).
    await supabase.from("buyer_intelligence_profiles").insert({ org_id: orgId, buyer_id: buyerId } as never);
  }
  const twinId = (buyerId ?? sellerId) as string;

  // 4) Activity events.
  await logActivityEvent({ eventType: "social_lead.converted", entityType: twinType, entityId: twinId, title: "המרה מליד חברתי", description: sl.ai_summary, relatedEntityType: "lead", relatedEntityId: lead.id, metadata: { socialLeadId, community: sl.community_id, platform: sl.platform } });

  // 5) Attribution chain (Community → Social Lead → Lead → Buyer).
  if (sl.community_id) await supabase.from("community_lead_attribution").insert({
    organization_id: orgId, community_id: sl.community_id, lead_id: lead.id, property_id: sl.property_id,
    distribution_item_id: sl.distribution_item_id, source_interaction_id: sl.social_interaction_id,
    attribution_confidence: sl.intent_confidence, attribution_reason: `המרה מליד חברתי · ${INTENT_LABEL[intent]}`,
  } as never);
  await supabase.from("community_activity_logs").insert({ organization_id: orgId, community_id: sl.community_id, activity_type: "lead_created", entity_type: "lead", entity_id: lead.id, title: "ליד נוצר מקהילה" } as never);

  // 6) Knowledge Graph links.
  const rels: DB["entity_relationships"]["Insert"][] = [
    { org_id: orgId, source_entity_type: "lead", source_entity_id: lead.id, target_entity_type: twinType, target_entity_id: twinId, relationship_type: "converted_to", strength_score: 90, status: "active" } as never,
  ];
  if (sl.community_id) rels.push({ org_id: orgId, source_entity_type: "community", source_entity_id: sl.community_id, target_entity_type: "lead", target_entity_id: lead.id, relationship_type: "generated_lead", strength_score: clamp(sl.lead_quality_score), status: "active" } as never);
  if (sl.property_id) rels.push({ org_id: orgId, source_entity_type: twinType, source_entity_id: twinId, target_entity_type: "property", target_entity_id: sl.property_id, relationship_type: "interested_in", strength_score: 70, status: "active" } as never);
  await supabase.from("entity_relationships").insert(rels as never);

  // 7) Update social lead (converted_buyer_id only when a buyer was created) + link canonical lead.
  await supabase.from("social_leads").update({ status: "converted", lead_id: lead.id, converted_buyer_id: buyerId, reviewed_by: userId, reviewed_at: new Date().toISOString() } as never).eq("id", socialLeadId);
  await supabase.from("leads").update({ stage: "converted", converted_buyer_id: buyerId, converted_seller_id: sellerId } as never).eq("id", lead.id).eq("org_id", orgId);

  // 8) Open the converted twin's customer journey (real row; best-effort).
  try {
    const { ensureJourney } = await import("@/lib/journey-intelligence/service");
    await ensureJourney(twinType, twinId);
  } catch (e) {
    console.error("[social] journey ensure on conversion failed:", e);
  }

  return { leadId: lead.id, buyerId: buyerId ?? undefined, sellerId: sellerId ?? undefined };
}

// ── Follow-up generation ─────────────────────────────────────────────────────
export async function generateSocialFollowups(): Promise<{ created: number }> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const [{ data: leads }, { data: open }] = await Promise.all([
    supabase.from("social_leads").select("id,community_id,property_id,assigned_agent_id,lead_quality_score,intent,person_name").in("status", ["new", "reviewed", "qualified"]).order("priority_score", { ascending: false }).limit(60),
    supabase.from("social_followups").select("social_lead_id").eq("status", "open"),
  ]);
  const hasOpen = new Set((open ?? []).map((f) => f.social_lead_id));
  const now = Date.now();
  const rows: DB["social_followups"]["Insert"][] = [];
  for (const l of leads ?? []) {
    if (hasOpen.has(l.id)) continue;
    const priority = l.lead_quality_score >= 75 ? "high" : l.lead_quality_score >= 50 ? "medium" : "low";
    const hours = priority === "high" ? 4 : priority === "medium" ? 24 : 72;
    rows.push({ organization_id: orgId, social_lead_id: l.id, community_id: l.community_id, property_id: l.property_id, user_id: l.assigned_agent_id,
      due_at: new Date(now + hours * 3_600_000).toISOString(), priority, status: "open",
      title: `מעקב: ${l.person_name ?? "ליד חברתי"}`, reason: recommendedAction(l.intent as SocialIntent) });
  }
  if (rows.length) await supabase.from("social_followups").insert(rows as never);
  return { created: rows.length };
}

export async function setFollowupStatus(id: string, status: string): Promise<void> {
  await ctx();
  const supabase = await createClient();
  await supabase.from("social_followups").update({ status } as never).eq("id", id);
}

// ── Read models ──────────────────────────────────────────────────────────────
export type SocialLeadRow = DB["social_leads"]["Row"] & { communityName: string | null };

export interface SocialLeadsBoard {
  counts: { new: number; reviewed: number; qualified: number; converted: number; rejected: number };
  byStatus: Record<string, SocialLeadRow[]>;
  topOpportunities: SocialLeadRow[];
  intentBreakdown: { intent: string; label: string; count: number }[];
  sourceBreakdown: { platform: string; count: number }[];
  communityBreakdown: { community: string; count: number }[];
  agentRecommendations: { userId: string; name: string; score: number }[];
  followups: DB["social_followups"]["Row"][];
}

export async function getSocialLeadsBoard(): Promise<SocialLeadsBoard> {
  const supabase = await createClient();
  const [{ data: leads }, { data: agents }, { data: followups }] = await Promise.all([
    supabase.from("social_leads").select("*").order("priority_score", { ascending: false }).limit(500),
    supabase.from("agent_intelligence_profiles").select("user_id,agent_score,users(full_name)").order("agent_score", { ascending: false }).limit(5),
    supabase.from("social_followups").select("*").eq("status", "open").order("due_at", { ascending: true }).limit(30),
  ]);
  const rows = leads ?? [];
  const commIds = [...new Set(rows.map((r) => r.community_id).filter((x): x is string => !!x))];
  const commName = new Map<string, string>();
  if (commIds.length) { const { data } = await supabase.from("community_profiles").select("id,name").in("id", commIds); for (const c of data ?? []) commName.set(c.id, c.name); }
  const withNames: SocialLeadRow[] = rows.map((r) => ({ ...r, communityName: r.community_id ? commName.get(r.community_id) ?? null : null }));

  const byStatus: Record<string, SocialLeadRow[]> = { new: [], reviewed: [], qualified: [], converted: [], rejected: [] };
  for (const r of withNames) (byStatus[r.status] ??= []).push(r);

  const intentMap = new Map<string, number>(); const srcMap = new Map<string, number>(); const commMap = new Map<string, number>();
  for (const r of withNames) {
    if (r.intent) intentMap.set(r.intent, (intentMap.get(r.intent) ?? 0) + 1);
    if (r.platform) srcMap.set(r.platform, (srcMap.get(r.platform) ?? 0) + 1);
    if (r.communityName) commMap.set(r.communityName, (commMap.get(r.communityName) ?? 0) + 1);
  }

  return {
    counts: { new: byStatus.new.length, reviewed: byStatus.reviewed.length, qualified: byStatus.qualified.length, converted: byStatus.converted.length, rejected: byStatus.rejected.length },
    byStatus,
    topOpportunities: withNames.filter((r) => r.status !== "rejected" && r.status !== "converted").slice(0, 8),
    intentBreakdown: [...intentMap.entries()].map(([intent, count]) => ({ intent, label: INTENT_LABEL[intent as SocialIntent] ?? intent, count })).sort((a, b) => b.count - a.count),
    sourceBreakdown: [...srcMap.entries()].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count),
    communityBreakdown: [...commMap.entries()].map(([community, count]) => ({ community, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    agentRecommendations: (agents ?? []).map((a) => ({ userId: a.user_id, name: (a as unknown as { users?: { full_name: string } | null }).users?.full_name ?? "סוכן", score: a.agent_score })),
    followups: followups ?? [],
  };
}
