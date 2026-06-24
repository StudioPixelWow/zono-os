"use server";

// ============================================================================
// ZONO — Distribution AI variation persistence (Phase 10.1 launch-blocker fix).
// Generates scored variations, marks the top 4 selected, and writes them into
// distribution_variations. The DATABASE is the single source of truth — after a
// save the UI reads the rows back via generateCampaignVariationsAction, never
// from in-memory output. (distribution_* tables aren't in the generated Database
// type → `as never` casts.)
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { distributionRepo } from "./repository";
import {
  generateDistributionVariations,
  type DistInput, type DistResult, type CampaignVariationView, type AudienceKey,
} from "./variation-engine";

export interface GenerateVariationsInput extends DistInput {
  campaignId?: string | null;
  propertyId?: string | null;
  count?: number;
}

export interface GenerateVariationsResult {
  ok: boolean;
  saved: number;
  result: DistResult;
  error?: string;
}

/** Low-level: generate `count` variations and INSERT them into distribution_variations. */
export async function generateAndStoreVariations(
  input: GenerateVariationsInput,
): Promise<GenerateVariationsResult> {
  const result = generateDistributionVariations(input, input.count ?? 20);

  try {
    const { profile } = await getSessionContext();
    const orgId = profile?.org_id;
    const userId = profile?.id;
    if (!orgId) return { ok: false, saved: 0, result, error: "no_org" };

    const supabase = await createClient();
    const rows = result.variations.map((v) => ({
      org_id: orgId,
      campaign_id: input.campaignId ?? null,
      property_id: input.propertyId ?? null,
      angle: v.angle,
      tone: v.tone,
      hook: v.hook,                      // dedicated hook column (Phase 3)
      headline: v.headline,
      body: v.body,
      cta: v.cta,
      hashtags: v.hashtags,
      wow_score: v.wowScore,
      engagement_score: v.engagementScore,
      lead_score: v.leadScore,           // dedicated lead_score column (Phase 3)
      prediction_score: v.leadScore,     // back-compat with older readers
      is_selected: v.selected,           // top 4 = true
      created_by: userId ?? null,
      metadata: {
        hook_kind: v.hookKind,
        angle_label: v.angleLabel,
        composite_score: v.compositeScore,
        rank: v.index,
        audience: String(input.audience),
        location: [input.neighborhood, input.city].filter(Boolean).join(", "),
        property_type: input.propertyType ?? null,
      },
    }));

    const { error } = await supabase
      .from("distribution_variations" as never)
      .insert(rows as never);
    if (error) return { ok: false, saved: 0, result, error: error.message };

    return { ok: true, saved: rows.length, result };
  } catch (e) {
    return { ok: false, saved: 0, result, error: e instanceof Error ? e.message : "unknown" };
  }
}

// Map the campaign's stored Hebrew audience label back to an AudienceKey for the
// engine's angle ordering (best-effort; unknown falls back to default ordering).
const AUDIENCE_FROM_HE: Record<string, AudienceKey> = {
  "משפחות": "families", "משקיעים": "investors", "צעירים": "young",
  "יוקרה": "luxury", "מסחרי": "commercial", "מוכרים": "sellers",
};

interface PropertyLiteRow { title: string | null; city: string | null; neighborhood: string | null; type: string | null; price: number | null; rooms: number | null; size_sqm: number | null }

/** Map a stored DB row → the display DTO the UI renders. */
function toView(v: Awaited<ReturnType<typeof distributionRepo.listVariations>>[number], index: number): CampaignVariationView {
  const meta = (v.metadata ?? {}) as Record<string, unknown>;
  return {
    id: v.id, index: index + 1, angle: v.angle ?? "", angleLabel: (meta.angle_label as string) ?? v.angle ?? "",
    tone: v.tone ?? "", headline: v.headline ?? "", hook: v.hook ?? "", body: v.body ?? "", cta: v.cta ?? "",
    hashtags: v.hashtags ?? [], wow: v.wow_score, engagement: v.engagement_score,
    prediction: v.lead_score || v.prediction_score, selected: v.is_selected,
  };
}

export interface GenerateCampaignVariationsResult {
  error?: string;
  saved?: number;
  campaignName?: string;
  variations?: CampaignVariationView[];
}

/**
 * MAIN entry for the "Generate AI Variations" button. Derives the brief from the
 * campaign (+ its linked property), REPLACES any prior variations for the
 * campaign, persists the fresh set (top 4 auto-selected), then READS THEM BACK
 * from Supabase and returns the DB rows. The DB is the single source of truth.
 */
export async function generateCampaignVariationsAction(input: { campaignId: string; count?: number }): Promise<GenerateCampaignVariationsResult> {
  if (!input.campaignId) return { error: "קמפיין חסר" };
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return { error: "לא מחובר" };

  const campaign = await distributionRepo.getCampaign(input.campaignId);
  if (!campaign) return { error: "הקמפיין לא נמצא" };

  // Enrich from the linked property when present.
  const supabase = await createClient();
  let property: PropertyLiteRow | null = null;
  if (campaign.property_id) {
    const { data } = await supabase.from("properties")
      .select("title,city,neighborhood,type,price,rooms,size_sqm")
      .eq("id", campaign.property_id).maybeSingle();
    property = (data as PropertyLiteRow | null) ?? null;
  }

  const distInput: DistInput = {
    title: property?.title ?? campaign.name,
    audience: AUDIENCE_FROM_HE[campaign.audience ?? ""] ?? (campaign.audience ?? "families"),
    city: campaign.cities?.[0] ?? property?.city ?? null,
    neighborhood: property?.neighborhood ?? null,
    propertyType: property?.type ?? null,
    price: property?.price ?? null,
    rooms: property?.rooms ?? null,
    sqm: property?.size_sqm ?? null,
    agentName: profile.full_name ?? null,
    agentPhone: profile.phone ?? null,
  };

  // REPLACE: clear prior variations for this campaign so re-generating is clean.
  await supabase.from("distribution_variations" as never).delete()
    .eq("org_id", profile.org_id).eq("campaign_id", input.campaignId);

  const saved = await generateAndStoreVariations({
    ...distInput, campaignId: input.campaignId, propertyId: campaign.property_id, count: input.count ?? 20,
  });
  if (!saved.ok) return { error: saved.error || "שמירת הוריאציות נכשלה" };

  // READ BACK from Supabase — DB is the single source of truth.
  const rows = await distributionRepo.listVariations(input.campaignId);
  return { saved: saved.saved, campaignName: campaign.name, variations: rows.map(toView) };
}
