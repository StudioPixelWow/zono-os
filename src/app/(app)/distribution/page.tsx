import { getDistributionBoard, getDailyWorkspace, type DistributionBoard, type DailyWorkspace } from "@/lib/distribution/service";
import { getDistributionCenter, type DistributionCenterData } from "@/lib/distribution/center-data";
import { COMPLIANCE_WARNINGS } from "@/lib/distribution/distribution-provider";
import { getPublishAssistantAction } from "@/lib/distribution/manual-publish-actions";
import type { AssistantPost } from "@/lib/distribution/manual-publish-service";
import { createClient } from "@/lib/supabase/server";
import { DistributionCenterView } from "./_center/DistributionCenterView";
import type { PropertyLite } from "./_center/variations";

const EMPTY_CENTER: DistributionCenterData = {
  stats: {
    groups: 0, activeGroups: 0, campaigns: 0, activeCampaigns: 0, posts: 0, publishedPosts: 0,
    scheduledPosts: 0, leads: 0, newLeads: 0, impressions: 0, clicks: 0, comments: 0, conversionRate: 0,
  },
  groups: [], campaigns: [], posts: [], leads: [], analytics: [], automations: [],
};

export const dynamic = "force-dynamic";

const ACTIVE = ["active", "published", "ready", "under_offer", "in_contract"];

export default async function DistributionPage() {
  let board: DistributionBoard = { communities: [], reviewQueue: [], approved: [], opportunities: [], plans: [] };
  let daily: DailyWorkspace = { batch: null, items: [] };
  let properties: PropertyLite[] = [];
  let center: DistributionCenterData = EMPTY_CENTER;
  let assistantPosts: AssistantPost[] = [];

  try {
    board = await getDistributionBoard();
  } catch (e) {
    console.error("[distribution] board load failed:", e);
  }
  try {
    center = await getDistributionCenter();
  } catch (e) {
    console.error("[distribution] center load failed:", e);
  }
  try {
    daily = await getDailyWorkspace();
  } catch (e) {
    console.error("[distribution] daily load failed:", e);
  }
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("properties")
      .select("id,title,city,neighborhood,type,price,rooms,size_sqm,primary_image_url,status")
      .in("status", ACTIVE as never)
      .order("updated_at", { ascending: false })
      .limit(60);
    properties = (data ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      city: p.city,
      neighborhood: p.neighborhood,
      type: p.type as string | null,
      price: p.price,
      rooms: p.rooms,
      sqm: p.size_sqm,
      imageUrl: p.primary_image_url,
    }));
  } catch (e) {
    console.error("[distribution] properties load failed:", e);
  }
  try {
    const res = await getPublishAssistantAction();
    assistantPosts = res.posts;
  } catch (e) {
    console.error("[distribution] publish assistant load failed:", e);
  }

  return (
    <DistributionCenterView
      board={board}
      daily={daily}
      properties={properties}
      center={center}
      assistantPosts={assistantPosts}
      complianceWarnings={COMPLIANCE_WARNINGS}
    />
  );
}
