// ============================================================================
// ZONO — Distribution SCHEDULER service (server-only). Builds the real posting
// queue from selected groups × variations using the pure planner, after full
// validation, and persists the posts (status 'scheduled') via the posts
// repository. No Facebook calls, no fake publishing — this only PLANS and stores
// queue records. Smart scheduling (gradual roll-out, variation rotation, no
// adjacent duplicates, per-day cap, date-range) lives in scheduler-planner.ts.
// ============================================================================
import "server-only";
import { distributionRepo } from "./repository";
import { distributionPostsRepository } from "./distribution-posts-repository";
import { planSchedule, type ScheduleConfig, type PlannedPost } from "./scheduler-planner";
import type { DistVariationRow } from "./db-types";

export interface BuildQueueResult {
  ok: boolean;
  created: number;
  skippedDuplicates: number;
  planned: number;
  errors: string[];
}

export const distributionSchedulerService = {
  /** Validate a config and return any blocking errors (empty = valid). */
  async validate(config: ScheduleConfig): Promise<string[]> {
    const errors: string[] = [];
    if (!config.campaignId) errors.push("קמפיין חסר");
    if (!config.groupIds?.length) errors.push("לא נבחרו קבוצות");
    if (!config.variationIds?.length) errors.push("לא נבחרו וריאציות");
    if (!config.startDate || Number.isNaN(Date.parse(config.startDate))) errors.push("תאריך התחלה לא תקין");
    else if (Date.parse(config.startDate) < Date.now() - 60_000) errors.push("תאריך ההתחלה חייב להיות בעתיד");
    if (config.maxPostsPerDay <= 0) errors.push("מקסימום פוסטים ליום חייב להיות חיובי");
    if (config.delayMinutes <= 0) errors.push("ההשהיה בין פוסטים חייבת להיות חיובית");
    if (config.windowEndHour <= config.windowStartHour) errors.push("חלון הפרסום לא תקין");
    if (errors.length) return errors;

    // Campaign must exist (org-scoped).
    const campaign = await distributionRepo.getCampaign(config.campaignId);
    if (!campaign) { errors.push("הקמפיין לא נמצא"); return errors; }

    // Selected variations must exist for this campaign.
    const variations = await distributionRepo.listVariations(config.campaignId);
    const validIds = new Set(variations.map((v: DistVariationRow) => v.id));
    const missing = config.variationIds.filter((id) => !validIds.has(id));
    if (variations.length === 0) errors.push("אין וריאציות לקמפיין");
    else if (missing.length) errors.push(`וריאציות שלא נמצאו: ${missing.length}`);
    return errors;
  },

  /** Plan the schedule (pure preview — no writes). Caller can show it before saving. */
  async preview(config: ScheduleConfig): Promise<PlannedPost[]> {
    return planSchedule(config);
  },

  /** Validate → plan → de-dupe → insert scheduled posts. */
  async buildQueue(config: ScheduleConfig): Promise<BuildQueueResult> {
    const errors = await this.validate(config);
    if (errors.length) return { ok: false, created: 0, skippedDuplicates: 0, planned: 0, errors };

    const planned = planSchedule(config);
    if (!planned.length) return { ok: false, created: 0, skippedDuplicates: 0, planned: 0, errors: ["לא נוצרו שיבוצים — בדוק את חלון הפרסום וטווח התאריכים"] };

    // De-dupe: skip identical (campaign, group, variation, time) posts already queued.
    const fresh: PlannedPost[] = [];
    let skipped = 0;
    for (const p of planned) {
      const dup = await distributionPostsRepository.existsDuplicate(config.campaignId, p.groupId, p.variationId, p.scheduledAt);
      if (dup) { skipped++; continue; }
      fresh.push(p);
    }
    if (!fresh.length) return { ok: false, created: 0, skippedDuplicates: skipped, planned: planned.length, errors: ["כל הפוסטים כבר קיימים בתור"] };

    // Persist as scheduled posts. Carry the variation copy onto each post.
    const variations = await distributionRepo.listVariations(config.campaignId);
    const byId = new Map(variations.map((v) => [v.id, v]));
    const created = await distributionPostsRepository.createMany(fresh.map((p) => {
      const v = byId.get(p.variationId);
      return {
        campaignId: config.campaignId, groupId: p.groupId, variationId: p.variationId, scheduledAt: p.scheduledAt,
        status: "scheduled" as const, postTitle: v?.headline ?? null,
        postText: v ? [v.hook, v.body].filter(Boolean).join("\n\n") : null,
        cta: v?.cta ?? null, hashtags: v?.hashtags ?? [],
      };
    }));
    return { ok: created.length > 0, created: created.length, skippedDuplicates: skipped, planned: planned.length, errors: [] };
  },
};
