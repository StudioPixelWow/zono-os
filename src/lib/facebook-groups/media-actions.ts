"use server";
// Server-action wrapper so the Campaign Wizard (client) can load a property's
// real media for the picker. Reuses the one shared resolver — no duplicate logic.
import { listPropertyCampaignMedia, type CampaignMediaItem } from "./campaign-media";

export async function listPropertyCampaignMediaAction(propertyId: string): Promise<CampaignMediaItem[]> {
  if (!propertyId) return [];
  return listPropertyCampaignMedia(propertyId);
}
