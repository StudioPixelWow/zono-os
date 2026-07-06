"use server";
// ============================================================================
// 📣 ZONO — Daily FB Groups Publishing — server actions. PHASE 49.0.
// The broker publishes BY HAND on Facebook; these actions only RECORD the outcome
// and let the broker reschedule/skip. Nothing here contacts Facebook, scrapes, or
// automates a browser. The "mark published" / "save URL" / "mark failed" actions
// are REUSED from the existing manual-publish flow (manual-publish-actions.ts).
// ============================================================================
import { revalidatePath } from "next/cache";
import { distributionPostsRepository } from "@/lib/distribution/distribution-posts-repository";
import { getDailyGroupsPublishingPlan } from "./service";
import type { DailyGroupsPublishingPlan } from "./types";

function revalidate() {
  revalidatePath("/facebook");
  revalidatePath("/distribution");
  revalidatePath("/distribution/daily");
  revalidatePath("/today");
  revalidatePath("/");
}

/** Load today's assisted publishing plan (called by the daily popup on open). */
export async function getDailyGroupsPublishingPlanAction(): Promise<{ plan?: DailyGroupsPublishingPlan; error?: string }> {
  try {
    return { plan: await getDailyGroupsPublishingPlan() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "טעינת שולחן הפרסום נכשלה" };
  }
}

/** Reschedule a queued post to a later date (broker deferred it). Reuses updateSchedule. */
export async function rescheduleGroupPostAction(input: { postId: string; scheduledAt: string }): Promise<{ error?: string }> {
  if (!input.postId) return { error: "פוסט חסר" };
  const t = Date.parse(input.scheduledAt);
  if (!Number.isFinite(t)) return { error: "תאריך אינו תקין" };
  const done = await distributionPostsRepository.updateSchedule(input.postId, new Date(t).toISOString());
  if (!done) return { error: "שינוי המועד נכשל" };
  revalidate();
  return {};
}

/** Skip a queued post for today (broker chose not to publish it). */
export async function skipGroupPostAction(input: { postId: string; reason?: string }): Promise<{ error?: string }> {
  if (!input.postId) return { error: "פוסט חסר" };
  const done = await distributionPostsRepository.markSkipped(input.postId, input.reason || "דולג ידנית");
  if (!done) return { error: "הדילוג נכשל" };
  revalidate();
  return {};
}
