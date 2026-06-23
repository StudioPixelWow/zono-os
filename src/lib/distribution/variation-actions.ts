"use server";

// Persist Distribution AI Engine output. Generates 20 scored variations, marks
// the top 4 selected, and writes ALL 20 into distribution_variations (the table
// is not yet in the generated Database type → `as never` casts).
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  generateDistributionVariations,
  type DistInput,
  type DistResult,
} from "./variation-engine";

export interface GenerateVariationsInput extends DistInput {
  campaignId?: string | null;
  propertyId?: string | null;
}

export interface GenerateVariationsResult {
  ok: boolean;
  saved: number;
  result: DistResult;
  error?: string;
}

export async function generateAndStoreVariations(
  input: GenerateVariationsInput,
): Promise<GenerateVariationsResult> {
  const result = generateDistributionVariations(input, 20);

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
      headline: v.headline,
      body: `${v.hook}\n\n${v.body}`,
      cta: v.cta,
      hashtags: v.hashtags,
      wow_score: v.wowScore,
      engagement_score: v.engagementScore,
      prediction_score: v.leadScore, // Lead Score → prediction_score
      is_selected: v.selected,
      created_by: userId ?? null,
      metadata: {
        hook: v.hook,
        hook_kind: v.hookKind,
        angle_label: v.angleLabel,
        lead_score: v.leadScore,
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
