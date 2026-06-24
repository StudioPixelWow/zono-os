"use server";

// ============================================================================
// ZONO — Distribution analytics server actions (Phase 8). All read/compute from
// real Supabase records via the analytics service; recalc actions persist the
// derived scores. No mock numbers, no static charts.
// ============================================================================
import { revalidatePath } from "next/cache";
import { distributionAnalyticsService } from "./distribution-analytics-service";
import type { DistributionAnalytics, Recommendation } from "./analytics-scoring";

const PATH = "/distribution";

/** Read the full analytics payload (server action for client refresh). */
export async function getDistributionAnalyticsAction(): Promise<{ analytics: DistributionAnalytics }> {
  return { analytics: await distributionAnalyticsService.get() };
}

export async function recalculateGroupScoresAction(): Promise<{ error?: string; updated?: number }> {
  const { updated } = await distributionAnalyticsService.recalculateGroupScores();
  revalidatePath(PATH);
  return { updated };
}

export async function recalculateCampaignScoresAction(): Promise<{ error?: string; updated?: number }> {
  const { updated } = await distributionAnalyticsService.recalculateCampaignScores();
  revalidatePath(PATH);
  return { updated };
}

export async function recalculateVariationScoresAction(): Promise<{ error?: string; updated?: number }> {
  const { updated } = await distributionAnalyticsService.recalculateVariationScores();
  revalidatePath(PATH);
  return { updated };
}

export async function getDistributionRecommendationsAction(): Promise<{ recommendations: Recommendation[]; enough: boolean; note: string }> {
  return distributionAnalyticsService.recommendations();
}
