// ============================================================================
// ZONO — /distribution · Facebook Marketing HOME (route). Deployment+UX fix.
// This route now renders the NEW consolidated DistributionHome (Today + active
// campaigns + attention + groups + one dominant "קמפיין חדש" CTA), sourcing the
// SAME canonical data as /distribution/daily (getPublishingControlData) plus the
// campaign/group stats (getDistributionCenter). The old fragmented admin center
// is no longer the customer landing; advanced tooling lives at /publishing-control.
// ============================================================================
import { getPublishingControlData, emptyControlData } from "@/lib/distribution/publishing-control-data";
import { getDistributionCenter, type DistributionCenterData } from "@/lib/distribution/center-data";
import { getPropertyMarketingCoverage, type PropertyMarketingCoverage } from "@/lib/distribution/property-coverage";
import { getOrgExtensionReadiness } from "@/lib/distribution/extension-service";
import { computeExtensionReadiness } from "@/lib/distribution/extension-readiness";
import { DistributionHome } from "./_home/DistributionHome";
import { getPortfolioMarketingAutopilot, type PortfolioAutopilot } from "@/lib/marketing-autopilot/autopilot";
import { getMarketingWeekReview, type WeekReview } from "@/lib/marketing-autopilot/plan-view";

export const dynamic = "force-dynamic";

const EMPTY_CENTER: DistributionCenterData = {
  stats: { groups: 0, activeGroups: 0, campaigns: 0, activeCampaigns: 0, posts: 0, publishedPosts: 0, scheduledPosts: 0, leads: 0, newLeads: 0, impressions: 0, clicks: 0, comments: 0, conversionRate: 0 },
  groups: [], campaigns: [], posts: [], leads: [], analytics: [], automations: [],
};

const EMPTY_COVERAGE: PropertyMarketingCoverage = { summary: { marketable: 0, covered: 0, marketingNow: 0, scheduled: 0, neverPublished: 0, noFuture: 0, attention: 0 }, properties: [] };

export default async function DistributionPage() {
  let today = emptyControlData(false);
  let center: DistributionCenterData = EMPTY_CENTER;
  let coverage: PropertyMarketingCoverage = EMPTY_COVERAGE;
  let readiness = computeExtensionReadiness({ status: "not_installed", lastCheckedAt: null });
  try { today = await getPublishingControlData(); } catch (e) { console.error("[distribution] today load failed:", e); }
  try { center = await getDistributionCenter(); } catch (e) { console.error("[distribution] center load failed:", e); }
  try { coverage = await getPropertyMarketingCoverage(); } catch (e) { console.error("[distribution] coverage load failed:", e); }
  try { readiness = await getOrgExtensionReadiness(); } catch (e) { console.error("[distribution] readiness load failed:", e); }
  let marketingWeek: PortfolioAutopilot | null = null;
  try { marketingWeek = await getPortfolioMarketingAutopilot({ limit: 200 }); } catch (e) { console.error("[distribution] autopilot load failed:", e); }
  let weekReview: WeekReview | null = null;
  try { weekReview = await getMarketingWeekReview({ limit: 200 }); } catch (e) { console.error("[distribution] week review load failed:", e); }
  return <DistributionHome today={today} center={center} coverage={coverage} readiness={readiness} marketingWeek={marketingWeek} weekReview={weekReview} />;
}
