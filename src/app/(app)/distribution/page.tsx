import { getDistributionBoard, getDailyWorkspace, type DistributionBoard, type DailyWorkspace } from "@/lib/distribution/service";
import { getDistributionCenter, type DistributionCenterData } from "@/lib/distribution/center-data";
import { COMPLIANCE_WARNINGS } from "@/lib/distribution/distribution-provider";
import { getPublishAssistantAction } from "@/lib/distribution/manual-publish-actions";
import type { AssistantPost } from "@/lib/distribution/manual-publish-service";
import { getCampaignCommentsAction } from "@/lib/distribution/distribution-comment-actions";
import type { CommentsBoard } from "@/lib/distribution/distribution-comment-service";
import { getDistributionAnalyticsAction } from "@/lib/distribution/distribution-analytics-actions";
import type { DistributionAnalytics } from "@/lib/distribution/analytics-scoring";
import { getDistributionAutomationsAction } from "@/lib/distribution/distribution-automation-actions";
import type { AutomationBoard } from "@/lib/distribution/distribution-automation-service";
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

const EMPTY_ANALYTICS: DistributionAnalytics = {
  summary: {
    totalCampaigns: 0, totalGroupsUsed: 0, scheduledPosts: 0, publishedPosts: 0, failedPosts: 0,
    importedComments: 0, detectedLeads: 0, hotLeads: 0, conversionRate: 0, avgLeadIntentScore: 0,
    publishingSuccessRate: 0,
  },
  campaigns: [], groups: [], cities: [], variations: [], angles: [], ctas: [],
  funnel: { published: 0, comments: 0, leads: 0, hotLeads: 0, converted: 0 },
  failed: { totalFailed: 0, byReason: [], byGroup: [] },
  recommendations: [],
  sufficiency: { enough: false, publishedPosts: 0, comments: 0, note: "אין מספיק נתונים אמיתיים עדיין." },
};

const EMPTY_AUTOMATION_BOARD: AutomationBoard = {
  activeAutomations: [],
  suggestedAutomations: [],
  alerts: [],
  followUpTasks: [],
  repostReminders: [],
  hotLeadAlerts: [],
  recommendations: [],
  counts: { active: 0, alerts: 0, tasks: 0, reposts: 0, hotLeads: 0, recommendations: 0 },
  enough: false,
};

export const dynamic = "force-dynamic";

const ACTIVE = ["active", "published", "ready", "under_offer", "in_contract"];

export default async function DistributionPage() {
  let board: DistributionBoard = { communities: [], reviewQueue: [], approved: [], opportunities: [], plans: [] };
  let daily: DailyWorkspace = { batch: null, items: [] };
  let properties: PropertyLite[] = [];
  let center: DistributionCenterData = EMPTY_CENTER;
  let assistantPosts: AssistantPost[] = [];
  let commentsBoard: CommentsBoard = {
    comments: [],
    counts: { comments: 0, hotLeads: 0, leads: 0, needsReply: 0, ignored: 0, converted: 0, conversionRate: 0 },
  };
  let analytics: DistributionAnalytics = EMPTY_ANALYTICS;
  let automationBoard: AutomationBoard = EMPTY_AUTOMATION_BOARD;

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
  try {
    const res = await getCampaignCommentsAction();
    commentsBoard = res.board;
  } catch (e) {
    console.error("[distribution] comments board load failed:", e);
  }
  try {
    const res = await getDistributionAnalyticsAction();
    analytics = res.analytics;
  } catch (e) {
    console.error("[distribution] analytics load failed:", e);
  }
  try {
    const res = await getDistributionAutomationsAction();
    automationBoard = res.board;
  } catch (e) {
    console.error("[distribution] automation board load failed:", e);
  }

  return (
    <DistributionCenterView
      board={board}
      daily={daily}
      properties={properties}
      center={center}
      assistantPosts={assistantPosts}
      commentsBoard={commentsBoard}
      analytics={analytics}
      automationBoard={automationBoard}
      complianceWarnings={COMPLIANCE_WARNINGS}
    />
  );
}
