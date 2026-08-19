"use server";
// ============================================================================
// ZONO — Facebook Groups Campaign · ACTIVATION (server action). Campaign UX P0.
// Turns the builder's validated state into a REAL, persisted campaign by REUSING
// the existing distribution engine end-to-end — no second scheduler, no new
// tables, no mock activation:
//   createCampaign → selectGroups → generateVariations → buildQueue(distribution_posts)
// Every authoritative value (org, property access, schedule window/cadence) is
// derived/checked SERVER-SIDE; the browser supplies only property, groups,
// cadence and start date. On any partial failure the just-created campaign is
// cleaned up so no empty/orphan campaign is ever left behind. Publishing itself
// still runs through the EXISTING assisted-extension + reconciliation flow.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createCampaignAction, selectGroupsAction, deleteCampaignAction, updateCampaignStatusAction } from "@/lib/distribution/center-actions";
import { generateCampaignVariationsAction } from "@/lib/distribution/variation-actions";
import { createPostingQueueAction, previewPostingQueueAction } from "@/lib/distribution/distribution-actions";
import type { ScheduleConfig } from "@/lib/distribution/scheduler-planner";
import type { Frequency } from "./planner";
import { assertCampaignMediaListAllowed, type MediaRef } from "./campaign-media";

export interface ActivateInput {
  propertyId: string;
  propertyTitle?: string | null;
  groupIds: string[];
  frequency: Frequency;
  startDate: string;      // yyyy-mm-dd (first eligible day)
  media?: MediaRef | null;      // legacy single image (still accepted; = mediaList of one)
  mediaList?: MediaRef[] | null; // ordered 1..N images (validated server-side); empty = text-only
  postText?: string | null; // the caption the user WROTE + previewed (parity: this IS what publishes)
}

export type ActivateResult =
  | { ok: true; campaignId: string; created: number; groupCount: number; firstPublishAt: string | null; endDate: string }
  | { ok: false; error: string };

const DAY = 86_400_000;
const VALID_FREQ: Frequency[] = ["one_time", "three_weekly", "daily", "full_month", "custom"];

/** Server-derived schedule window/cadence for a cadence choice (browser never
 *  supplies the raw scheduler internals). Mirrors the builder's horizon. */
function horizonDays(f: Frequency): number {
  return f === "one_time" ? 1 : f === "full_month" ? 30 : 14;
}
function maxPerDay(f: Frequency): number {
  return f === "one_time" ? 1 : f === "daily" ? 3 : 2;
}

export async function activateFacebookCampaignAction(input: ActivateInput): Promise<ActivateResult> {
  // ── Server-trusted validation ──────────────────────────────────────────────
  const sc = await getSessionContext();
  const orgId = sc.profile?.org_id ?? null;
  if (!orgId) return { ok: false, error: "אין הרשאה. התחבר מחדש." };
  if (!input.propertyId) return { ok: false, error: "בחר נכס לקמפיין." };
  if (!Array.isArray(input.groupIds) || input.groupIds.length === 0) return { ok: false, error: "בחר לפחות קבוצה אחת." };
  if (!VALID_FREQ.includes(input.frequency)) return { ok: false, error: "תדירות לא תקינה." };

  // Verify the property belongs to THIS org (never trust the browser's id).
  const db = createServiceRoleClient();
  const { data: prop } = await db.from("properties" as never)
    .select("id,title").eq("id", input.propertyId).eq("org_id", orgId).maybeSingle();
  const property = prop as { id: string; title: string | null } | null;
  if (!property) return { ok: false, error: "הנכס לא נמצא או שאינו שייך למשרד." };

  // Validate selected media SERVER-SIDE (P0): every image must belong to THIS org
  // AND this property, order preserved, capped at FB_GROUPS_MAX_IMAGES. A tampered
  // payload (Property A + media from Property B/another org) is rejected before any
  // post is scheduled. Empty list = allowed (deliberate text-only). Backward compat:
  // a legacy single `media` is treated as a one-item list.
  const refs: MediaRef[] = (input.mediaList && input.mediaList.length > 0)
    ? input.mediaList
    : (input.media ? [input.media] : []);
  const mediaCheck = await assertCampaignMediaListAllowed(input.propertyId, refs);
  if (!mediaCheck.ok) return { ok: false, error: mediaCheck.error };
  const resolvedMedia = mediaCheck.media;                 // ordered ResolvedMediaItem[]
  const firstItem = resolvedMedia[0] ?? null;

  // PUBLISH-READINESS guard (P0): EVERY selected Creative Studio asset must have an
  // approved facebook_groups derivative before ANY post is scheduled — otherwise the
  // user would reach Today with a creative that cannot publish. We reuse the existing
  // promotion flow (auto-promotes when the caller is a manager); if any still can't be
  // prepared, we block honestly. Property photos are unaffected.
  const studioIds = resolvedMedia.map((m) => m.creativeOutputId).filter((v): v is string => !!v);
  if (studioIds.length > 0) {
    const { ensureCreativeFacebookReady } = await import("./creative-readiness");
    for (const outputId of studioIds) {
      const ready = await ensureCreativeFacebookReady(outputId);
      if (!ready.ready) return { ok: false, error: "אחד הקריאייטיבים שנבחרו עדיין לא מוכן לפרסום בפייסבוק. הכינו אותו לפרסום (או הסירו אותו) לפני הפעלת הקמפיין." };
    }
  }

  // Only ACTIVE (office-approved) groups of THIS org may be targeted. A tampered
  // browser payload with a `discovered`/disabled/other-org group id is rejected
  // server-side — a campaign can never be scheduled to unapproved destinations.
  const { data: activeRows } = await db.from("distribution_groups" as never)
    .select("id").eq("org_id", orgId).eq("status", "active").in("id", input.groupIds);
  const activeIds = new Set(((activeRows as { id: string }[] | null) ?? []).map((r) => r.id));
  const invalid = input.groupIds.filter((id) => !activeIds.has(id));
  if (invalid.length > 0) {
    return { ok: false, error: "חלק מהקבוצות שנבחרו אינן מאושרות לפרסום. ניתן לפרסם רק לקבוצות פעילות של המשרד." };
  }

  // Dates (server-derived). Start no earlier than tomorrow; end = start + horizon.
  const startMs = Math.max(new Date(`${input.startDate}T09:00:00`).getTime(), Date.now() + DAY);
  if (!Number.isFinite(startMs)) return { ok: false, error: "תאריך התחלה לא תקין." };
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(startMs + horizonDays(input.frequency) * DAY).toISOString();

  // ── 1) Campaign identity (reuses distribution_campaigns) ─────────────────────
  const name = `${property.title ?? "קמפיין"} · פייסבוק`;
  const campaign = await createCampaignAction({ name, propertyId: input.propertyId, campaignGoal: "facebook_groups" });
  if (campaign.error || !campaign.campaignId) return { ok: false, error: campaign.error ?? "יצירת הקמפיין נכשלה." };
  const campaignId = campaign.campaignId;

  try {
    // ── 2) Link the selected groups ──────────────────────────────────────────
    const sel = await selectGroupsAction({ campaignId, groupIds: input.groupIds });
    if (sel.error) throw new Error(sel.error);

    // ── 3) Generate + persist post content variations for this campaign ───────
    const vars = await generateCampaignVariationsAction({ campaignId, count: 8 });
    if (vars.error || !vars.variations?.length) throw new Error(vars.error ?? "יצירת תוכן הפוסטים נכשלה.");
    const variationIds = vars.variations.map((v) => v.id);

    // ── 4) Build the REAL schedule → distribution_posts (existing engine) ──────
    const config: ScheduleConfig = {
      campaignId, startDate: startIso, endDate: endIso,
      windowStartHour: 9, windowEndHour: 20, delayMinutes: 90,
      maxPostsPerDay: maxPerDay(input.frequency),
      groupIds: input.groupIds, variationIds,
      // Legacy single-image fields = the FIRST (cover) image, for backward compat.
      imageUrl: firstItem?.url ?? null, creativeOutputId: firstItem?.creativeOutputId ?? null,
      creativeVersion: firstItem?.creativeOutputId ? (firstItem.creativeVersion ?? 1) : null,
      // Ordered 1..N resolved media — the canonical multi-image list.
      imageUrls: resolvedMedia,
      propertyId: input.propertyId,
    };
    // Preview first (first-slot + planned count for the success screen), then persist.
    const preview = await previewPostingQueueAction(config);
    if (preview.error) throw new Error(preview.error);
    const firstPublishAt = (preview.planned ?? []).map((p) => p.scheduledAt).sort()[0] ?? null;

    const built = await createPostingQueueAction(config);
    if (built.error) throw new Error(built.error);
    if (!built.created || built.created <= 0) throw new Error("לא נוצרו פרסומים מתוזמנים. בדוק את בחירת הקבוצות והתאריכים.");

    // ── 4b) PREVIEW/PUBLISH PARITY (P0): persist the EXACT caption the user wrote
    //    and previewed onto every scheduled post's `post_text` — the same column
    //    the extension reads. Without this the wizard would preview one text while
    //    the extension published a differently-generated one. Best-effort: a caption
    //    write must not discard an already-built real schedule.
    const caption = input.postText?.trim();
    if (caption) {
      try { await db.from("distribution_posts" as never).update({ post_text: caption } as never).eq("org_id", orgId).eq("campaign_id", campaignId); }
      catch (e) { console.error(`[fb-activate] caption persist failed for ${campaignId}:`, e); }
    }

    // Promote the campaign to ACTIVE now that a live posting schedule exists.
    // The /distribution Home lists campaigns whose status ∈ {active,running,scheduled};
    // without this the campaign stays 'draft' from createCampaign and never appears as
    // active (the data-consistency bug). Best-effort: a status-label write failure must
    // NOT discard an already-built real schedule.
    const activated = await updateCampaignStatusAction({ id: campaignId, status: "active" });
    if (activated.error) console.error(`[fb-activate] campaign ${campaignId} status→active failed: ${activated.error}`);

    return {
      ok: true, campaignId, created: built.created, groupCount: input.groupIds.length,
      firstPublishAt, endDate: endIso,
    };
  } catch (e) {
    // Partial-failure cleanup: remove the just-created campaign so no empty/orphan
    // campaign is left behind. Never leave a half-activated campaign.
    await deleteCampaignAction({ id: campaignId }).catch(() => undefined);
    return { ok: false, error: e instanceof Error ? e.message : "הפעלת הקמפיין נכשלה. נסה שוב." };
  }
}
