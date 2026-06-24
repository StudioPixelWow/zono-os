// ============================================================================
// ZONO — Facebook Groups Distribution Engine service (server-only).
// Group registry CRUD + classification, real performance recompute (from posts
// + attributed leads), property→group recommendations, post/lead recording with
// duplicate prevention + compliance. User-controlled publishing only.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  classifyGroup, regionForCity, scoreGroupPerformance, scoreGroupLeads,
  recommendGroupsForProperty, contentHash, checkCompliance,
  type GroupRecommendation, type RecoGroupInput,
} from "./groups-engine";

async function ctx() {
  const { profile, user } = await getSessionContext();
  if (!profile?.org_id) throw new Error("אין הרשאה.");
  const db = await createClient();
  return { db, orgId: profile.org_id, userId: user?.id ?? null };
}

const daysSince = (iso: string | null | undefined): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

export interface GroupRow {
  id: string; name: string; city: string | null; region: string | null; category: string | null;
  propertyTypes: string[]; membersCount: number; status: string; privacyLevel: string;
  performanceScore: number; leadScore: number; spamRiskScore: number;
  totalPosts: number; totalLeads: number; lastPostAt: string | null; lastLeadAt: string | null;
  groupUrl: string | null;
}

function mapGroup(r: Record<string, unknown>): GroupRow {
  return {
    id: r.id as string, name: r.name as string, city: (r.city as string) ?? null, region: (r.region as string) ?? null,
    category: (r.category as string) ?? null, propertyTypes: (r.property_types as string[]) ?? [],
    membersCount: Number(r.members_count ?? 0), status: (r.status as string) ?? "active",
    privacyLevel: (r.privacy_level as string) ?? "public",
    performanceScore: Number(r.performance_score ?? 0), leadScore: Number(r.lead_score ?? 0),
    spamRiskScore: Number(r.spam_risk_score ?? 0), totalPosts: Number(r.total_posts ?? 0),
    totalLeads: Number(r.total_leads ?? 0), lastPostAt: (r.last_post_at as string) ?? null,
    lastLeadAt: (r.last_lead_at as string) ?? null, groupUrl: (r.group_url as string) ?? null,
  };
}

export async function getGroupRegistry(): Promise<GroupRow[]> {
  const { db, orgId } = await ctx();
  const { data } = await db.from("distribution_groups" as never)
    .select("*").eq("org_id", orgId).order("performance_score", { ascending: false }).limit(500);
  return ((data ?? []) as Record<string, unknown>[]).map(mapGroup);
}

export interface AddGroupInput {
  name: string; groupUrl?: string | null; city?: string | null; membersCount?: number;
  privacyLevel?: string; notes?: string | null; propertyTypes?: string[];
}
export async function addGroup(input: AddGroupInput): Promise<{ id: string }> {
  const { db, orgId, userId } = await ctx();
  const cls = classifyGroup(input.name, input.notes, input.city);
  const { data, error } = await db.from("distribution_groups" as never).insert({
    org_id: orgId, name: input.name, group_url: input.groupUrl ?? null, city: input.city ?? null,
    region: cls.region, category: cls.category, language: "he",
    property_types: input.propertyTypes?.length ? input.propertyTypes : cls.propertyTypes,
    members_count: input.membersCount ?? 0, privacy_level: input.privacyLevel ?? "public",
    rules_notes: input.notes ?? null, classification_source: "auto", created_by: userId,
  } as never).select("id").single();
  if (error) throw new Error(error.message);
  return { id: (data as unknown as { id: string }).id };
}

/** Recompute real performance + lead scores for every group from posts + leads. */
export async function recomputeGroupScores(): Promise<{ groups: number }> {
  const { db, orgId } = await ctx();
  const groups = await getGroupRegistry();
  for (const g of groups) {
    const [{ data: posts }, { data: leads }] = await Promise.all([
      db.from("distribution_group_posts" as never).select("reach,reactions,comments,posted_at").eq("org_id", orgId).eq("group_id", g.id).limit(500),
      db.from("distribution_group_leads" as never).select("created_at").eq("org_id", orgId).eq("group_id", g.id).limit(500),
    ]);
    const postRows = (posts ?? []) as { reach?: number; reactions?: number; comments?: number; posted_at?: string }[];
    const leadRows = (leads ?? []) as { created_at?: string }[];
    const totalPosts = postRows.length;
    const totalLeads = leadRows.length;
    const engaged = postRows.filter((p) => (p.reactions ?? 0) + (p.comments ?? 0) > 0).length;
    const avgResponseRate = totalPosts ? engaged / totalPosts : null;
    const lastPostAt = postRows.map((p) => p.posted_at).filter(Boolean).sort().slice(-1)[0] ?? g.lastPostAt;
    const lastLeadAt = leadRows.map((l) => l.created_at).filter(Boolean).sort().slice(-1)[0] ?? g.lastLeadAt;
    const stats = {
      totalPosts, totalLeads, avgResponseRate, membersCount: g.membersCount, spamRiskScore: g.spamRiskScore,
      daysSinceLastLead: daysSince(lastLeadAt), daysSinceLastPost: daysSince(lastPostAt),
    };
    await db.from("distribution_groups" as never).update({
      performance_score: scoreGroupPerformance(stats), lead_score: scoreGroupLeads(stats),
      total_posts: totalPosts, total_leads: totalLeads, avg_response_rate: avgResponseRate,
      last_post_at: lastPostAt ?? null, last_lead_at: lastLeadAt ?? null,
    } as never).eq("id", g.id).eq("org_id", orgId);
  }
  return { groups: groups.length };
}

export interface PropertyGroupReco { recommendations: GroupRecommendation[]; propertyTitle: string | null }
export async function recommendGroups(propertyId: string): Promise<PropertyGroupReco> {
  const { db, orgId } = await ctx();
  const { data: prop } = await db.from("properties" as never)
    .select("name,title,city,property_type").eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  const p = prop as Record<string, unknown> | null;
  const groups = await getGroupRegistry();
  const recoInput: RecoGroupInput[] = groups.map((g) => ({
    id: g.id, name: g.name, city: g.city, region: g.region, propertyTypes: g.propertyTypes,
    performanceScore: g.performanceScore, leadScore: g.leadScore, membersCount: g.membersCount,
    spamRiskScore: g.spamRiskScore, status: g.status, daysSinceLastPost: daysSince(g.lastPostAt),
  }));
  const recommendations = recommendGroupsForProperty(
    { city: (p?.city as string) ?? null, region: regionForCity((p?.city as string) ?? null), propertyType: (p?.property_type as string) ?? null },
    recoInput,
  );
  return { recommendations, propertyTitle: (p?.title as string) ?? (p?.name as string) ?? null };
}

export interface RecordPostInput { groupId: string; propertyId?: string | null; campaignId?: string | null; postUrl?: string | null; content?: string | null; reach?: number; reactions?: number; comments?: number }
export async function recordGroupPost(input: RecordPostInput): Promise<{ id: string; duplicate: boolean; warnings: string[] }> {
  const { db, orgId, userId } = await ctx();
  const hash = input.content ? contentHash(input.content) : null;
  // Duplicate prevention: same content already posted to this group.
  let duplicate = false;
  if (hash) {
    const { data: dup } = await db.from("distribution_group_posts" as never)
      .select("id").eq("org_id", orgId).eq("group_id", input.groupId).eq("content_hash", hash).limit(1);
    duplicate = ((dup ?? []) as unknown[]).length > 0;
  }
  const { data: g } = await db.from("distribution_groups" as never)
    .select("privacy_level,spam_risk_score,last_post_at").eq("id", input.groupId).eq("org_id", orgId).maybeSingle();
  const gr = g as Record<string, unknown> | null;
  const compliance = checkCompliance({
    privacyLevel: (gr?.privacy_level as string) ?? "public", daysSinceLastPost: daysSince(gr?.last_post_at as string),
    spamRiskScore: Number(gr?.spam_risk_score ?? 0), duplicateExists: duplicate,
  });
  if (duplicate) return { id: "", duplicate: true, warnings: compliance.warnings };

  const { data, error } = await db.from("distribution_group_posts" as never).insert({
    org_id: orgId, group_id: input.groupId, property_id: input.propertyId ?? null, campaign_id: input.campaignId ?? null,
    post_url: input.postUrl ?? null, status: "posted", posted_by: userId, reach: input.reach ?? null,
    reactions: input.reactions ?? null, comments: input.comments ?? null, content_hash: hash,
  } as never).select("id").single();
  if (error) throw new Error(error.message);
  await db.from("distribution_groups" as never).update({ last_post_at: new Date().toISOString() } as never).eq("id", input.groupId).eq("org_id", orgId);
  return { id: (data as unknown as { id: string }).id, duplicate: false, warnings: compliance.warnings };
}

export interface RecordLeadInput { groupId: string; postId?: string | null; propertyId?: string | null; contactName?: string | null; contactPhone?: string | null; note?: string | null }
export async function recordGroupLead(input: RecordLeadInput): Promise<{ id: string }> {
  const { db, orgId, userId } = await ctx();
  const { data, error } = await db.from("distribution_group_leads" as never).insert({
    org_id: orgId, group_id: input.groupId, post_id: input.postId ?? null, property_id: input.propertyId ?? null,
    contact_name: input.contactName ?? null, contact_phone: input.contactPhone ?? null, note: input.note ?? null,
    status: "new", created_by: userId,
  } as never).select("id").single();
  if (error) throw new Error(error.message);
  await db.from("distribution_groups" as never).update({ last_lead_at: new Date().toISOString() } as never).eq("id", input.groupId).eq("org_id", orgId);
  return { id: (data as unknown as { id: string }).id };
}

export interface GroupsAnalytics {
  totalGroups: number; activeGroups: number; totalPosts: number; totalLeads: number;
  topByLeads: GroupRow[]; topByPerformance: GroupRow[]; needsAttention: GroupRow[];
}
export async function getGroupsAnalytics(): Promise<GroupsAnalytics> {
  const groups = await getGroupRegistry();
  return {
    totalGroups: groups.length,
    activeGroups: groups.filter((g) => g.status === "active").length,
    totalPosts: groups.reduce((s, g) => s + g.totalPosts, 0),
    totalLeads: groups.reduce((s, g) => s + g.totalLeads, 0),
    topByLeads: [...groups].sort((a, b) => b.totalLeads - a.totalLeads).filter((g) => g.totalLeads > 0).slice(0, 8),
    topByPerformance: [...groups].sort((a, b) => b.performanceScore - a.performanceScore).slice(0, 8),
    needsAttention: groups.filter((g) => g.spamRiskScore >= 60 || (g.totalPosts >= 3 && g.totalLeads === 0)).slice(0, 8),
  };
}
