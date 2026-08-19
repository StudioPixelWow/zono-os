/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Marketing Autopilot 2.0 · PREPARE (server-only). Turns the deterministic
// per-property WeeklyPlan (from the 1.0 brain) into a fully-PREPARED draft snapshot
// the human can review + edit + approve: real caption (reused copy generator),
// real active groups, real media/creative, the real net-new matched-buyer audience,
// and the real interested customers needing follow-up. Every value comes from live
// org-scoped state — nothing is invented, no external send happens here. Reuses
// getPropertyMarketingAutopilot as the source of truth for state + which items exist.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generatePostVariations, type PropertyFacts } from "@/lib/facebook-groups/content";
import { getPropertyMarketingAutopilot } from "./autopilot";
import {
  buildSummary, stableItemId, emptyAudit, PLAN_SOURCE_VERSION,
  type MarketingPlanSnapshot, type PlanItem, type PlanItemType,
} from "./plan-core";

const STRONG_MATCH = 70;
const MAX_GROUPS_PER_POST = 3;
const MAX_EXPANSION_GROUPS = 4;

const AUTOPILOT_TO_PLAN: Record<string, PlanItemType> = {
  facebook_publish: "facebook_publish",
  group_expansion: "group_expansion",
  creative_refresh: "creative_refresh",
  buyer_bundle: "buyer_bundle",
  interest_followup: "interest_followup",
};

function defaultStartDate(nowMs: number): string {
  return new Date(nowMs + 3 * 86_400_000).toISOString().slice(0, 10);
}

/** Build the fully-prepared DRAFT snapshot (not yet persisted). */
export async function buildPreparedSnapshot(
  orgId: string, propertyId: string, opts: { isManager: boolean; userId: string | null; db?: any },
): Promise<MarketingPlanSnapshot | null> {
  const db: any = opts.db ?? createServiceRoleClient();
  const nowMs = Date.now();

  const a = await getPropertyMarketingAutopilot(orgId, propertyId, { isManager: opts.isManager, db });
  if (!a) return null;

  // ── Prepared building blocks (bounded, org-scoped) ────────────────────────
  const { data: propRow } = await db.from("properties")
    .select("id,title,city,price,rooms,size_sqm,floor,type,description,primary_image_url,status")
    .eq("id", propertyId).eq("org_id", orgId).maybeSingle();

  const facts: PropertyFacts = {
    title: (propRow?.title as string)?.trim() || "נכס",
    price: propRow?.price ?? null, city: propRow?.city ?? null, neighborhood: null,
    rooms: propRow?.rooms ?? null, area: propRow?.size_sqm ?? null,
    floor: propRow?.floor != null ? String(propRow.floor) : null,
    type: (propRow?.type as string) ?? null, amenities: [],
    summary: (propRow?.description as string) ?? null, hasPhotos: !!propRow?.primary_image_url,
  };
  const caption = generatePostVariations(facts, 1)[0]?.text ?? facts.title;

  // Active groups + which were already used → suggested targets.
  const { data: groupRows } = await db.from("distribution_groups")
    .select("id,name").eq("org_id", orgId).eq("status", "active").order("performance_score", { ascending: false }).limit(60);
  const activeGroups = ((groupRows ?? []) as any[]).map((g) => ({ id: g.id as string, name: (g.name as string) ?? "קבוצה" }));

  const { data: campRows } = await db.from("distribution_campaigns").select("id").eq("org_id", orgId).eq("property_id", propertyId).limit(50);
  const campaignIds = ((campRows ?? []) as any[]).map((c) => c.id);
  const usedGroupIds = new Set<string>();
  if (campaignIds.length) {
    const { data: postRows } = await db.from("distribution_posts").select("group_id,publish_state").eq("org_id", orgId).in("campaign_id", campaignIds).limit(400);
    for (const p of (postRows ?? []) as any[]) if (p.publish_state === "published" && p.group_id) usedGroupIds.add(p.group_id);
  }
  const freshGroups = activeGroups.filter((g) => !usedGroupIds.has(g.id));

  // Approved creative (media + readiness already computed by autopilot evidence).
  const { data: creativeRow } = await db.from("zono_quick_creative_outputs")
    .select("id,is_approved,status,image_url,preview_url").eq("org_id", orgId).eq("property_id", propertyId)
    .order("created_at", { ascending: false }).limit(5);
  const approvedCreative = ((creativeRow ?? []) as any[]).find((c) => c.is_approved || c.status === "approved") ?? null;

  const media = propRow?.primary_image_url
    ? { kind: "property_primary", id: propertyId, url: propRow.primary_image_url as string }
    : approvedCreative && (approvedCreative.image_url || approvedCreative.preview_url)
      ? { kind: "creative_output", id: approvedCreative.id as string, url: (approvedCreative.image_url || approvedCreative.preview_url) as string }
      : null;

  // Strong matched buyers, net-new (not already sent this property).
  const { data: matchRows } = await db.from("match_intelligence_profiles")
    .select("buyer_id,compatibility_score").eq("org_id", orgId).eq("property_id", propertyId)
    .eq("match_status", "active").gte("compatibility_score", STRONG_MATCH).order("compatibility_score", { ascending: false }).limit(300);
  const strongBuyerIds = ((matchRows ?? []) as any[]).map((m) => m.buyer_id as string);
  const { data: sentRows } = await db.from("customer_property_recommendations")
    .select("contact_id,status").eq("org_id", orgId).eq("contact_type", "buyer").eq("property_id", propertyId);
  const sentSet = new Set(((sentRows ?? []) as any[]).map((r) => r.contact_id as string));
  const interestedIds = ((sentRows ?? []) as any[]).filter((r) => r.status === "interested").map((r) => r.contact_id as string);
  const netNewBuyers = strongBuyerIds.filter((id) => !sentSet.has(id));

  // ── Compose plan items from the autopilot skeleton ────────────────────────
  const typeCounter: Record<string, number> = {};
  const items: PlanItem[] = [];
  const dayLabels = ["יום א׳", "יום ב׳", "יום ג׳", "יום ה׳", "יום ו׳"];

  a.plan.forEach((w) => {
    const type = AUTOPILOT_TO_PLAN[w.type];
    if (!type) return;
    const idx = typeCounter[type] ?? 0;
    typeCounter[type] = idx + 1;
    const itemId = stableItemId(type, idx);
    const when = dayLabels[items.length] ?? null;

    if (type === "facebook_publish" || type === "group_expansion") {
      const source = type === "group_expansion" ? freshGroups : (freshGroups.length ? freshGroups : activeGroups);
      const pick = source.slice(0, type === "group_expansion" ? MAX_EXPANSION_GROUPS : MAX_GROUPS_PER_POST);
      items.push({
        itemId, type, title: w.title, why: w.reason, who: pick.length ? `${pick.length} קבוצות` : "אין קבוצות פעילות", when,
        status: "draft", requiresApproval: true,
        facebook: { caption, media, mediaList: media ? [media] : [], creativeOutputId: approvedCreative?.id ?? null, groupIds: pick.map((g) => g.id), groupNames: pick.map((g) => g.name), frequency: "three_weekly", startDate: defaultStartDate(nowMs) },
      });
    } else if (type === "buyer_bundle") {
      items.push({
        itemId, type, title: w.title, why: w.reason, who: `${netNewBuyers.length} לקוחות מתאימים`, when,
        status: "draft", requiresApproval: true,
        buyer: { recipientIds: netNewBuyers, removedIds: [], estimatedRecipients: netNewBuyers.length, channelSummary: "וואטסאפ / אימייל לפי הסכמת הלקוח" },
      });
    } else if (type === "interest_followup") {
      items.push({
        itemId, type, title: w.title, why: w.reason, who: `${interestedIds.length || Number(a.evidence.interestedNoViewing) || 0} מתעניינים`, when,
        status: "draft", requiresApproval: false,
        followup: { customerIds: interestedIds, count: interestedIds.length || Number(a.evidence.interestedNoViewing) || 0 },
      });
    } else if (type === "creative_refresh") {
      items.push({
        itemId, type, title: w.title, why: w.reason, who: "Creative Studio", when,
        status: "draft", requiresApproval: false,
        creative: { currentOutputId: approvedCreative?.id ?? null, refreshRecommended: true, publishReady: a.evidence.selectedCreativeReady as boolean | null },
      });
    }
  });

  const audit = emptyAudit();
  audit.preparedBy = opts.userId; audit.preparedAt = new Date().toISOString();

  return {
    planId: "", // filled by repo on insert
    propertyId, propertyTitle: a.title, propertyImageUrl: a.imageUrl,
    marketingState: a.state, stateLabel: a.stateLabel, sourceVersion: PLAN_SOURCE_VERSION,
    items, summary: buildSummary(items), audit,
  };
}
