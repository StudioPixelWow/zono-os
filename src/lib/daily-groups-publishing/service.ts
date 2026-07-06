// ============================================================================
// 📣 ZONO — Daily FB Groups Publishing — service (server-only). PHASE 49.0.
// Reads TODAY'S DUE Facebook-group posts from the EXISTING distribution queue and
// composes the daily publishing plan (grouped by property). It REUSES:
//   • distributionPostsRepository.listQueue  — the scheduled posting queue
//   • manualPublishService.listAssistant     — copy-ready text + destination + checklist
//   • distributionRepo.listGroups            — group name/url/category/city/members
// It adds NO tables, NO publishing, NO scraping, NO browser automation. Read-only.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { distributionPostsRepository } from "@/lib/distribution/distribution-posts-repository";
import { manualPublishService } from "@/lib/distribution/manual-publish-service";
import { distributionRepo } from "@/lib/distribution/repository";
import { assembleDailyGroupsPublishing } from "./assemble";
import type { DailyGroupsPublishingPlan, PublishInputRow } from "./types";

type Rec = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Compose today's assisted Facebook-groups publishing plan (grouped by property). */
export async function getDailyGroupsPublishingPlan(): Promise<DailyGroupsPublishingPlan> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);
  const toISO = endOfToday.toISOString();

  // Reuse the existing queue + publish-assistant + group library. Everything below
  // is a READ; the merge only shapes data for the popup.
  const [posts, assistant, groups] = await Promise.all([
    distributionPostsRepository.listQueue({ to: toISO, limit: 500 }).catch(() => []),
    manualPublishService.listAssistant({ to: toISO, limit: 500 }).catch(() => []),
    distributionRepo.listGroups({ limit: 1000 }).catch(() => []),
  ]);
  if (!posts.length) return assembleDailyGroupsPublishing([], today);

  const cardByPost = new Map(assistant.map((a) => [a.postId, a]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // Resolve property titles/images for the posts due today (org-scoped via RLS).
  const propIds = [...new Set(posts.map((p) => p.property_id).filter((x): x is string => !!x))];
  const propById = new Map<string, { title: string | null; city: string | null; image: string | null }>();
  if (propIds.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("properties").select("id,title,city,primary_image_url").in("id", propIds);
    for (const p of (data ?? []) as unknown as Rec[]) {
      propById.set(String(p.id), { title: s(p.title), city: s(p.city), image: s(p.primary_image_url) });
    }
  }

  const rows: PublishInputRow[] = posts.map((p) => {
    const a = cardByPost.get(p.id);
    const g = p.group_id ? groupById.get(p.group_id) ?? null : null;
    const prop = p.property_id ? propById.get(p.property_id) ?? null : null;
    const fallbackText = [p.post_text, (p.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n");
    return {
      postId: p.id,
      propertyId: p.property_id,
      propertyTitle: prop?.title ?? null,
      propertyCity: prop?.city ?? null,
      propertyImage: prop?.image ?? null,
      groupId: p.group_id,
      groupName: a?.groupName ?? g?.name ?? null,
      groupUrl: a?.groupUrl ?? g?.group_url ?? p.external_destination_url ?? null,
      category: g?.category ?? null,
      city: g?.city ?? null,
      membersCount: g?.members_count ?? 0,
      requiresMembership: a?.requiresMembership ?? true,
      title: a?.title ?? p.post_title,
      text: a?.text ?? fallbackText,
      hashtags: a?.hashtags ?? p.hashtags ?? [],
      cta: a?.cta ?? p.cta,
      imageUrl: a?.imageUrl ?? p.image_url,
      scheduledAt: p.scheduled_at,
      status: p.status,
      externalPostUrl: p.external_post_url,
    };
  });

  return assembleDailyGroupsPublishing(rows, today);
}
