"use server";
// Server-action wrapper so the Campaign Wizard (client) can load a property's
// real media for the picker. Reuses the one shared resolver — no duplicate logic.
import { listPropertyCampaignMedia, type CampaignMediaItem } from "./campaign-media";
import { getCreativeFacebookReadiness, ensureCreativeFacebookReady, type FbReadiness, type EnsureResult } from "./creative-readiness";

export async function listPropertyCampaignMediaAction(propertyId: string): Promise<CampaignMediaItem[]> {
  if (!propertyId) return [];
  return listPropertyCampaignMedia(propertyId);
}

/** Is a selected Studio creative publish-ready for Facebook groups? (read-only) */
export async function creativeFacebookReadinessAction(outputId: string): Promise<FbReadiness> {
  if (!outputId) return { status: "invalid", canAutoPromote: false, reason: "no_id" };
  return getCreativeFacebookReadiness(outputId);
}

/** "הכן לפרסום בפייסבוק" — promote the selected creative (managers only). */
export async function prepareCreativeForFacebookAction(outputId: string): Promise<EnsureResult> {
  if (!outputId) return { ready: false, reason: "no_id" };
  return ensureCreativeFacebookReady(outputId);
}
