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
import { DistributionHome } from "./_home/DistributionHome";

export const dynamic = "force-dynamic";

const EMPTY_CENTER: DistributionCenterData = {
  stats: { groups: 0, activeGroups: 0, campaigns: 0, activeCampaigns: 0, posts: 0, publishedPosts: 0, scheduledPosts: 0, leads: 0, newLeads: 0, impressions: 0, clicks: 0, comments: 0, conversionRate: 0 },
  groups: [], campaigns: [], posts: [], leads: [], analytics: [], automations: [],
};

export default async function DistributionPage() {
  let today = emptyControlData(false);
  let center: DistributionCenterData = EMPTY_CENTER;
  try { today = await getPublishingControlData(); } catch (e) { console.error("[distribution] today load failed:", e); }
  try { center = await getDistributionCenter(); } catch (e) { console.error("[distribution] center load failed:", e); }
  return <DistributionHome today={today} center={center} />;
}
