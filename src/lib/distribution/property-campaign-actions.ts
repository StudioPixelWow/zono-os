"use server";
// ============================================================================
// ZONO — Phase 3 (P0 #1): Property → Groups campaign orchestrator.
// A THIN server action that activates the property→campaign entry point by
// sequencing the EXISTING distribution pipeline — it adds no business logic and
// no schema. Reuse-only: recommendGroups, createCampaign,
// generateCampaignVariationsAction, selectGroups, buildQueue. Dark by default
// behind GROUPS_CAMPAIGN_FROM_PROPERTY_ENABLED.
// ============================================================================
import { distributionRepo } from "./repository";
import { generateCampaignVariationsAction } from "./variation-actions";
import { recommendGroups } from "./groups-service";
import { distributionSchedulerService } from "./distribution-scheduler-service";
import type { ScheduleConfig } from "./scheduler-planner";
import { GROUPS_CAMPAIGN_FROM_PROPERTY_ENABLED } from "./feature-flags";

export interface LaunchCampaignResult {
  ok: boolean;
  campaignId?: string;
  groups?: number;
  variations?: number;
  queued?: number;
  error?: string;
}

// Conservative pilot defaults — the existing scheduler/planner enforces windowing,
// spacing, per-day caps and de-dupe. No publishing happens here.
const DEFAULT_MAX_GROUPS = 10;
const START_OFFSET_DAYS = 3;

/**
 * Launch a Facebook Groups campaign for a property in one call, reusing the
 * existing pipeline end-to-end: recommend groups → create campaign (linked to the
 * property) → generate+store variations → select the recommended groups → build
 * the posting queue. Returns counts; never publishes.
 */
export async function launchGroupsCampaignFromProperty(propertyId: string): Promise<LaunchCampaignResult> {
  if (!GROUPS_CAMPAIGN_FROM_PROPERTY_ENABLED) return { ok: false, error: "התכונה מושבתת" };
  if (!propertyId) return { ok: false, error: "מזהה נכס חסר" };

  // 1) Recommend groups for the property (real heuristic engine).
  const reco = await recommendGroups(propertyId);
  const groupIds = reco.recommendations.slice(0, DEFAULT_MAX_GROUPS).map((r) => r.groupId);
  if (!groupIds.length) return { ok: false, error: "לא נמצאו קבוצות מומלצות לנכס" };

  // 2) Create the campaign, linked to the property.
  const campaign = await distributionRepo.createCampaign({
    name: `קמפיין קבוצות · ${reco.propertyTitle ?? "נכס"}`,
    propertyId,
  });
  if (!campaign) return { ok: false, error: "יצירת הקמפיין נכשלה" };

  // 3) Generate + persist content variations (marks the top set is_selected).
  const gen = await generateCampaignVariationsAction({ campaignId: campaign.id });
  if (gen.error) return { ok: false, campaignId: campaign.id, error: gen.error };

  // 4) Select the recommended groups onto the campaign.
  await distributionRepo.selectGroups(campaign.id, groupIds);

  // 5) Use the selected variations for scheduling.
  const variations = await distributionRepo.listVariations(campaign.id);
  const variationIds = variations.filter((v) => v.is_selected).map((v) => v.id);
  if (!variationIds.length) return { ok: false, campaignId: campaign.id, error: "לא נוצרו וריאציות נבחרות" };

  // 6) Build the posting queue via the existing scheduler (validates, plans,
  //    de-dupes, inserts scheduled distribution_posts — no publishing).
  const startDate = new Date(Date.now() + START_OFFSET_DAYS * 86_400_000).toISOString();
  const schedule: ScheduleConfig = {
    campaignId: campaign.id,
    startDate,
    windowStartHour: 9,
    windowEndHour: 21,
    delayMinutes: 90,
    maxPostsPerDay: 3,
    groupIds,
    variationIds,
  };
  const queue = await distributionSchedulerService.buildQueue(schedule);

  return {
    ok: queue.ok,
    campaignId: campaign.id,
    groups: groupIds.length,
    variations: variationIds.length,
    queued: queue.created,
    error: queue.ok ? undefined : (queue.errors[0] ?? "בניית התור נכשלה"),
  };
}
