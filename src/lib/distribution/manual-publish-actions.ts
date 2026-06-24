"use server";

// ============================================================================
// ZONO — Manual publishing server actions (Phase 6). The agent publishes by hand
// (no Meta API yet); these actions record the result in Supabase. Every write is
// org-scoped via the repository. Nothing here contacts Facebook.
// ============================================================================
import { revalidatePath } from "next/cache";
import { manualPublishService, type AssistantPost, type ProviderStatusView } from "./manual-publish-service";
import { distributionPostsRepository } from "./distribution-posts-repository";
import type { QueueFilters } from "./distribution-posts-repository";
import type { DestinationKind } from "./distribution-provider";
import { getSessionContext } from "@/lib/auth/session";

const PATH = "/distribution";
const ok = () => { revalidatePath(PATH); return {}; };

function isValidUrl(u: string): boolean {
  try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; }
}

/** Read the Publish Assistant list (server action for client refresh). */
export async function getPublishAssistantAction(filters: QueueFilters = {}): Promise<{ posts: AssistantPost[] }> {
  return { posts: await manualPublishService.listAssistant(filters) };
}

/** 1. Prepare a post for manual publishing (copy/asset/checklist + provider snapshot). */
export async function prepareManualPublishAction(input: { postId: string }): Promise<{ error?: string; post?: AssistantPost }> {
  if (!input.postId) return { error: "פוסט חסר" };
  const post = await manualPublishService.prepare(input.postId);
  if (!post) return { error: "הפוסט לא נמצא" };
  revalidatePath(PATH);
  return { post };
}

/** 2. Mark a post as published manually (optionally with the external URL). */
export async function markPostPublishedAction(input: { postId: string; externalPostUrl?: string }): Promise<{ error?: string }> {
  if (!input.postId) return { error: "פוסט חסר" };
  if (input.externalPostUrl && !isValidUrl(input.externalPostUrl)) return { error: "קישור הפוסט אינו תקין" };
  const post = await distributionPostsRepository.getById(input.postId);
  if (!post) return { error: "הפוסט לא נמצא" };
  const done = await distributionPostsRepository.markPublishedManually(input.postId, input.externalPostUrl ?? null);
  return done ? ok() : { error: "סימון הפרסום נכשל" };
}

/** 3. Mark a post as failed (manual flow). */
export async function markPostFailedAction(input: { postId: string; reason?: string }): Promise<{ error?: string }> {
  if (!input.postId) return { error: "פוסט חסר" };
  const done = await distributionPostsRepository.markManualFailed(input.postId, input.reason || "פרסום ידני נכשל");
  return done ? ok() : { error: "סימון הכשל נכשל" };
}

/** 4. Save / update the external Facebook post URL. */
export async function saveExternalPostUrlAction(input: { postId: string; url: string }): Promise<{ error?: string }> {
  if (!input.postId) return { error: "פוסט חסר" };
  if (!input.url || !isValidUrl(input.url)) return { error: "קישור אינו תקין" };
  const done = await distributionPostsRepository.saveExternalUrl(input.postId, input.url);
  return done ? ok() : { error: "שמירת הקישור נכשלה" };
}

/** 5. Refresh the (compliant) provider connection status. Stub → not_connected. */
export async function refreshProviderStatusAction(input: { kind?: DestinationKind } = {}): Promise<{ status?: ProviderStatusView; error?: string }> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return { error: "לא מחובר" };
  const status = await manualPublishService.providerStatus(profile.org_id, input.kind ?? "facebook_group");
  return { status };
}
