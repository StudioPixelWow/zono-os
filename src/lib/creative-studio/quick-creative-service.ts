// ============================================================================
// ZONO — Quick Creative Templates · Service (server-only)
// ----------------------------------------------------------------------------
// Resolves the brand snapshot (agent photo/phone, office logo/name, DNA colors),
// generates 4 branded render-object variations per request, scores + persists.
// Approve/favorite/reject feed the learning loop. RLS-scoped. No invented content.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { isUuid } from "@/lib/utils";
import type { Json } from "@/lib/supabase/types";
import { buildQuickVariations, validateRequired, type BrandSnapshot, type QuickInput, type QuickType } from "./quick-creative-engine";
import { buildCreativeDirection } from "./creative-director/engine";
import { buildMasterCreativePrompt, VARIATION_STYLES } from "./master-prompt";
import { generateFinalImage, resolveImageProvider } from "./visual-providers";
import { validateCreative } from "./creative-director/validation";
import { getEffectiveBrand } from "@/lib/brand-identity/service";
import { detectPropertyAngle } from "./quality/zonoPropertyFirstEngine";
import { pullInspiration } from "./quality/zonoCreativeInspirationEngine";
import { runQualityPipeline, QUALITY_CONFIG } from "./quality/orchestrator";
import type { CandidateBrief } from "./quality/zonoCreativeSelectionEngine";
import { type FinalAdFacts, type FinalAdBrandAssets } from "./final-creative-engine";
import { directConceptsAI } from "./creative-thinking-ai";
import { deriveBrandDNA, brandGuidanceForConcept } from "./brand-dna-engine";
import { buildDesignExecutionPlan, type DesignExecutionPlan, type DesignFamily } from "./design-system-engine";
import { produceAdScene } from "./creative-production-engine";
import { finalLayoutQA } from "./layout-integrity";
import { scoreWow, type WowScore } from "./wow-score";
import type { FinalAdData, ConceptTrigger } from "./final-creative-engine";

/** ART DIRECTION + CONCEPT ENGINE (hybrid): turn one property into 4 strategically
 *  DIFFERENT advertising concepts (distinct psychological trigger → angle, color
 *  system, composition, copy + AI creative direction + text-free AI environment).
 *  Real assets + Hebrew stay deterministic. Each concept is injected as a
 *  finished, ready-to-post square ad spec. */
/** One finished, layout-validated final-ad creative (concept + DEP + render_data). */
interface FinalAdBuilt { trigger: string; triggerLabel: string; ad: FinalAdData; designPlan: DesignExecutionPlan; render: Record<string, unknown>; scores: { finalPostReadiness: number; warnings: string[]; blockers: string[] }; wow: WowScore; provider: string }

// Each concept explores TWO premium master templates; the WOW engine picks the
// stronger one (the "redesign / try again" loop). Templates are property-first.
const TEMPLATE_OPTIONS: Record<ConceptTrigger, DesignFamily[]> = {
  luxury: ["penthouse_collection", "luxury_editorial"],
  family: ["boutique_residence", "premium_clean"],
  investment: ["architectural_showcase", "editorial_real_estate"],
  price_advantage: ["urban_prestige", "high_conversion_sales"],
  urgency: ["urban_prestige", "high_conversion_sales"],
};
const DARK_TEMPLATES: DesignFamily[] = ["penthouse_collection", "luxury_dark", "urban_prestige"];

/** PROPERTY AD path: build EXACTLY the 4 required, strategically-distinct
 *  concepts (family / investment / luxury / price_advantage). Each gets its own
 *  DEP (distinct design family), runs through layout integrity, and is deduped so
 *  no trigger/family combination repeats. Returns one entry per unique concept. */
async function buildFinalAds(input: QuickInput, brand: BrandSnapshot): Promise<FinalAdBuilt[]> {
  const facts: FinalAdFacts = {
    propertyImage: input.propertyImage ?? null, city: input.city ?? null, neighborhood: input.neighborhood ?? null,
    address: input.address ?? null, propertyType: input.propertyType ?? null, price: input.price ?? null,
    rooms: input.rooms ?? null, sizeSqm: input.sizeSqm ?? null, floor: input.floor ?? null, parking: input.parking ?? null,
    storage: Boolean(input.storage), balcony: Boolean(input.balcony), elevator: Boolean(input.elevator), exclusive: Boolean(input.exclusive),
    isNew: /חדש|חדשה|קבלן|בנייה חדשה|מחיר שיווק/.test(input.importantText ?? ""),
    urgent: /אחרון|אחרונה|דחוף|מהר|לא ת?חזור|נעלמ/.test(input.importantText ?? ""),
    importantText: input.importantText ?? null, customCta: input.customCta ?? null,
  };
  const brandAssets: FinalAdBrandAssets = {
    agentName: brand.agentName ?? null, agentPhone: brand.agentWhatsapp ?? null, agentPhoto: brand.agentPhoto ?? null,
    officeName: brand.officeName ?? null, officeLogo: brand.officeLogo ?? null, colors: brand.colors, luxury: brand.luxury,
  };
  const t0 = Date.now();
  const { approvedConcepts, provider } = await directConceptsAI(facts, brandAssets);
  if (!approvedConcepts.length) return [];
  const generationMs = Date.now() - t0;
  const brandDNA = deriveBrandDNA(brandAssets);
  const aiSceneLikely = resolveImageProvider().provider !== "mock";

  // CREATIVE-DIRECTOR PIPELINE: for each concept, EXPLORE its candidate master
  // templates, WOW-score each (6 axes), and keep the strongest layout — the
  // "score → redesign → try again" loop. Then enforce uniqueness on trigger AND
  // design family so no concept/template repeats in one generation.
  const seenTrigger = new Set<string>(); const seenFamily = new Set<string>();
  const built: FinalAdBuilt[] = [];
  for (const ac of approvedConcepts) {
    const c = ac.plan;
    if (seenTrigger.has(c.trigger)) continue;
    const guidance = brandGuidanceForConcept(brandDNA, c.ad.trigger);
    const assets = { hasPropertyImage: Boolean(c.ad.propertyImage), hasLogo: Boolean(c.ad.logoUrl), hasAgentPhoto: Boolean(c.ad.agentPhoto), hasPhone: Boolean(c.ad.agentPhone) };
    const options = TEMPLATE_OPTIONS[c.trigger] ?? ["luxury_editorial", "premium_clean"];
    // Score every candidate template for this concept; rank best-first.
    const scored = options.map((tpl) => {
      const dep = buildDesignExecutionPlan(c, brandDNA, guidance, assets, tpl);
      const wow = scoreWow({
        template: dep.family, hasPropertyImage: assets.hasPropertyImage, propertyDominant: dep.flags.propertyImageDominant,
        hasAiScene: aiSceneLikely, hasLogo: assets.hasLogo, agentShown: dep.flags.agentShown, agentSmall: true,
        hasPrice: Boolean(c.ad.price), featureCount: c.ad.features.length, headlineLen: (c.ad.headline ?? "").length,
        luxuryLevel: brand.luxury ?? 50, paletteDark: DARK_TEMPLATES.includes(dep.family),
        layoutApproved: dep.layout?.approved !== false, effectsCount: dep.effects.length,
      });
      return { dep, wow };
    }).sort((a, b) => b.wow.overall - a.wow.overall);
    // Pick the best template whose family isn't already used (keeps 4 distinct).
    const pick = scored.find((s) => !seenFamily.has(s.dep.family)) ?? scored[0];
    seenTrigger.add(c.trigger); seenFamily.add(pick.dep.family);
    const designPlan = pick.dep;
    const adTrace = c.ad.trace ? { ...c.ad.trace, generationMs, thinkingProvider: provider } : undefined;
    const ad: FinalAdData = { ...c.ad, trace: adTrace };
    const wowCandidates = scored.map((s) => ({ template: s.dep.family, familyLabel: s.dep.familyLabel, overall: s.wow.overall, approved: s.wow.approved }));
    const render: Record<string, unknown> = {
      format: "feed_1_1", width: c.ad.width, height: c.ad.height,
      ad: { ...ad, template: c.ad.composition, scores: c.scores, brandDNA, brandGuidance: guidance, designPlan, wow: pick.wow, wowCandidates },
    };
    built.push({ trigger: c.trigger, triggerLabel: c.triggerLabel, ad, designPlan, render, scores: { finalPostReadiness: c.scores.finalPostReadiness, warnings: c.scores.warnings, blockers: c.scores.blockers }, wow: pick.wow, provider });
  }
  // Badge the single strongest concept (the chosen "winner") — observability.
  if (built.length) {
    const top = built.reduce((a, b) => (b.wow.overall > a.wow.overall ? b : a));
    for (const b of built) (b.render.ad as Record<string, unknown>).isTopConcept = b === top;
  }
  return built;
}

type QuickVar = ReturnType<typeof buildQuickVariations>[number];
function providedFeatures(i: QuickInput): string[] {
  const f: string[] = [];
  if (i.rooms) f.push(`${i.rooms} חדרים`); if (i.sizeSqm) f.push(`${i.sizeSqm} מ״ר`); if (i.floor) f.push(`קומה ${i.floor}`);
  if (i.parking) f.push("חניה"); if (i.storage) f.push("מחסן"); if (i.balcony) f.push("מרפסת"); if (i.elevator) f.push("מעלית");
  return f;
}
/** Run every variation through the proven Creative Director framework + validation. */
function directorFields(type: QuickType, input: QuickInput, brand: BrandSnapshot, v: QuickVar, idx = 0): Record<string, unknown> {
  const dir = buildCreativeDirection({
    companyName: brand.officeName || brand.agentName || "ZONO", primaryColor: brand.colors[0] || "#0F3D2E", textColor: brand.colors[1] || "#FFFFFF",
    format: v.render.format, headline: v.headline, subheadline: v.subheadline, lines: (v.body || "").split(/\n+/).filter(Boolean).slice(0, 3), trust: input.address ?? undefined, cta: v.cta,
    creativeType: type, hasPropertyImage: Boolean(input.propertyImage), luxury: brand.luxury, urgency: 50, agentName: brand.agentName,
    city: input.city ?? null, neighborhood: input.neighborhood ?? null, providedFeatures: providedFeatures(input),
  });
  const val = validateCreative({ direction: dir, headline: v.headline, copy: v.body, cta: v.cta, providedFeatures: providedFeatures(input), hasPropertyImage: Boolean(input.propertyImage), brandColors: brand.colors });
  // Strong, brand-aware Nano-Banana master prompt — each of the 4 variations
  // gets a distinct strategic style (#P3-6/8/9).
  const master = buildMasterCreativePrompt({
    style: VARIATION_STYLES[idx % VARIATION_STYLES.length], brand, headline: v.headline, subheadline: v.subheadline,
    bodyLines: (v.body || "").split(/\n+/).filter(Boolean), cta: v.cta, format: v.render.format,
    facts: providedFeatures(input), hasPropertyImage: Boolean(input.propertyImage), city: input.city ?? null, neighborhood: input.neighborhood ?? null,
  });
  return {
    internal_prompt: master.nanoBananaPrompt, creative_strategy: master.styleLabel, visual_hook: master.visualDirection, scroll_stop_reason: dir.scrollStopReason,
    creative_director_metadata: { layout: dir.layoutRecommendation, typography: dir.typographyRecommendation, blacklistHits: val.blacklistHits, fakeRealEstateHits: val.fakeRealEstateHits, passed: val.passed, notes: val.notes } as unknown,
    scroll_stop_score: val.scrollStopScore, creative_director_score: val.creativeDirectorScore, anti_ai_score: val.antiAiScore, rtl_readability_score: val.rtlReadabilityScore,
  };
}

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  return { userId: user.id, orgId: profile.org_id, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;
export type QuickOutputRow = Record<string, unknown>;

export interface BrandResolved { snapshot: BrandSnapshot; warnings: string[]; agentId: string | null; officeId: string | null }

export async function resolveBrandSnapshot(opts: { entityType?: string; entityId?: string; agentId?: string | null }): Promise<BrandResolved> {
  const { orgId, userId, supabase } = await ctx();
  let warnings: string[] = [];
  // agent = explicit agent entity (only if a real UUID), else the current user.
  // Guards against URL-encoded names/slugs reaching uuid columns (#P2-8).
  const safeEntityId = isUuid(opts.entityId) ? opts.entityId : undefined;
  const agentId = opts.entityType === "agent" && safeEntityId ? safeEntityId : (opts.agentId ?? userId);
  let agentName: string | null = null; let agentPhoto: string | null = null; let agentWhatsapp: string | null = null;
  try { const { data } = await supabase.from("users").select("full_name,avatar_url,phone").eq("org_id", orgId).eq("id", agentId as string).maybeSingle(); const u = data as { full_name?: string; avatar_url?: string; phone?: string } | null; agentName = u?.full_name ?? null; agentPhoto = u?.avatar_url ?? null; agentWhatsapp = u?.phone ?? null; } catch { /* ignore */ }

  let officeName: string | null = null; let officeLogo: string | null = null;
  try { const { data } = await supabase.from("organizations").select("name,logo_url").eq("id", orgId).maybeSingle(); const o = data as { name?: string; logo_url?: string } | null; officeName = o?.name ?? null; officeLogo = o?.logo_url ?? null; } catch { /* ignore */ }

  let colors: string[] = []; let luxury = 50; let modern = 50; let dnaActive = false; let brandIdentityActive = false;
  try {
    const et = opts.entityType ?? "agent"; const eid = safeEntityId ?? (agentId as string);
    const { data } = await supabase.from("zono_marketing_dna_profiles").select("primary_colors,accent_colors,luxury_score,modern_score").eq("entity_type", et).eq("entity_id", eid).maybeSingle();
    const d = data as Record<string, unknown> | null;
    if (d) { dnaActive = true; const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === "string") as string[] : []); colors = [...arr(d.primary_colors), ...arr(d.accent_colors)].slice(0, 3); luxury = typeof d.luxury_score === "number" ? d.luxury_score as number : 50; modern = typeof d.modern_score === "number" ? d.modern_score as number : 50; }
  } catch { /* ignore */ }
  // Brand Identity OS is the master source — override with it when present.
  try {
    const eb = await getEffectiveBrand(orgId, agentId);
    brandIdentityActive = eb.source !== "none";
    if (eb.primary) colors = [eb.primary, eb.secondary, eb.accent].filter((c): c is string => Boolean(c));
    if (eb.logo) officeLogo = eb.logo;
    if (eb.profileImage && !agentPhoto) agentPhoto = eb.profileImage;
    if (eb.agentName) agentName = eb.agentName;
    if (eb.whatsapp) agentWhatsapp = eb.whatsapp;
    if (eb.officeName) officeName = eb.officeName;
  } catch { /* brand identity optional */ }

  // Compute warnings ONCE from the FINAL resolved values — no false positives
  // when the data exists in Settings → Brand & Identity (#P2-7).
  warnings = [];
  if (!agentPhoto) warnings.push("חסרה תמונת סוכן");
  if (!officeLogo) warnings.push("חסר לוגו משרד");
  if (!colors.length) warnings.push("חסרים צבעי מותג");
  if (!dnaActive && !brandIdentityActive) warnings.push("אין Marketing DNA פעיל");

  return { snapshot: { agentName, agentPhoto, agentWhatsapp, officeName, officeLogo, colors, luxury, modern }, warnings, agentId: agentId ?? null, officeId: orgId };
}

export interface GenerateQuickInput {
  requestType: QuickType; input: QuickInput; format: string;
  entityType?: string; entityId?: string; propertyId?: string | null; dealId?: string | null;
}
export async function generateQuickCreative(g: GenerateQuickInput): Promise<{ requestId: string; created: number }> {
  const { orgId, userId, supabase } = await ctx();
  const missing = validateRequired(g.requestType, g.input);
  if (missing.length) throw new Error(`חסרים שדות חובה: ${missing.join(", ")}`);
  // RULE 1/5/6 — asset gate: a property ad must use a REAL property image; never
  // fabricate one. Block generation with a clear missing-asset message.
  if (g.requestType === "property_ad_post" && !g.input.propertyImage) {
    throw new Error("יש להעלות תמונת נכס לפני יצירת מודעה.");
  }

  const brand = await resolveBrandSnapshot({ entityType: g.entityType, entityId: g.entityId });
  const propertyId = g.propertyId ?? (g.entityType === "property" && isUuid(g.entityId) ? g.entityId : null);

  const { data: reqRow, error: reqErr } = await supabase.from("zono_quick_creative_requests").insert({
    org_id: orgId, agent_id: brand.agentId, office_id: orgId, property_id: propertyId, deal_id: g.dealId ?? null,
    request_type: g.requestType, status: "generated", input_data: g.input as unknown as Json,
    brand_snapshot: brand.snapshot as unknown as Json, marketing_dna_snapshot: { colors: brand.snapshot.colors, luxury: brand.snapshot.luxury, modern: brand.snapshot.modern } as Json, created_by: userId,
  }).select("id").single();
  if (reqErr || !reqRow) throw new Error(reqErr?.message ?? "יצירת הבקשה נכשלה");
  const requestId = (reqRow as { id: string }).id;

  // ── ZONO Creative Quality Engine ────────────────────────────────────────
  // Never show raw first-generation AI. Build MANY internal candidates, judge
  // them harshly, regenerate the weak, and surface only the strongest 4.
  const feats = providedFeatures(g.input);
  const inspiration = await pullInspiration(supabase, { orgId, agentId: brand.agentId, requestType: g.requestType, propertyType: g.input.propertyType ?? null });
  const numOr = (v: string | null | undefined): number | null => { const n = Number(v); return Number.isFinite(n) && v != null && v !== "" ? n : null; };
  const propertyFirst = detectPropertyAngle({
    requestType: g.requestType, propertyType: g.input.propertyType ?? null, city: g.input.city, neighborhood: g.input.neighborhood,
    price: numOr(g.input.price), rooms: numOr(g.input.rooms), sizeSqm: numOr(g.input.sizeSqm), floor: numOr(g.input.floor),
    balcony: Boolean(g.input.balcony), parking: Boolean(g.input.parking), storage: Boolean(g.input.storage), elevator: Boolean(g.input.elevator),
    hasPropertyImage: Boolean(g.input.propertyImage), importantText: g.input.importantText ?? null,
  });

  // ── PROPERTY AD: exactly 4 distinct, layout-validated concept creatives. ──
  // This path BYPASSES the variation×family candidate matrix (which could select
  // the same concept multiple times) and emits one row per unique concept.
  if (g.requestType === "property_ad_post") {
    const built = await buildFinalAds(g.input, brand.snapshot);
    if (built.length) {
      const qa = finalLayoutQA(built.map((b) => b.designPlan));
      const top = built.reduce((a, b) => (b.wow.overall > a.wow.overall ? b : a));
      const selMeta = { candidatesTotal: built.length, rounds: 1, threshold: QUALITY_CONFIG.minQualityScore, layoutApproved: qa.approved, layoutReasons: qa.reasons, duplicateFamilies: qa.duplicateFamilies, topConcept: top.trigger, topWow: top.wow.overall };
      const finalRows = built.map((b) => {
        const layoutOk = b.designPlan.layout?.approved !== false;
        const ready = b.scores.finalPostReadiness;
        const w = b.wow;
        const features = b.ad.features.map((ft) => (ft.value ? `${ft.value} ${ft.label}` : ft.label)).join(" · ");
        const isTop = b === top;
        return {
          org_id: orgId, request_id: requestId, agent_id: brand.agentId, office_id: orgId, property_id: propertyId, deal_id: g.dealId ?? null,
          output_type: g.requestType, variant_name: `${isTop ? "★ " : ""}קונספט · ${b.triggerLabel}`, format: "feed_1_1", title: `${b.triggerLabel} · ${b.ad.headline}`,
          render_data: b.render as unknown as Json, headline: b.ad.headline, subheadline: b.ad.subheadline, body_text: features, cta_text: b.ad.cta,
          brand_match_score: w.trust, readability_score: w.readability, conversion_score: w.attention, seller_lead_score: null, buyer_lead_score: null, overall_score: w.overall, status: "generated",
          quality_status: layoutOk && w.approved ? "passed" : "below_threshold",
          overall_quality_score: w.overall, wow_score: w.overall,
          critic_summary: `${isTop ? "★ קונספט מוביל. " : ""}${b.designPlan.familyLabel} · WOW ${w.overall} (יוקרה ${w.luxury}/אמון ${w.trust}/קריאות ${w.readability}/תשומת-לב ${w.attention}/פרימיום ${w.premiumFeel}/אימפקט ${w.visualImpact}). ${w.critique.director}`,
          quality_review_id: null, generation_round: 1, is_hidden_due_to_quality: false,
          used_inspiration_assets: inspiration.usedInspirationAssets as unknown as Json,
          property_primary_angle: propertyFirst.propertyPrimaryAngle,
          creative_selection_metadata: { ...selMeta, family: b.designPlan.family, depId: b.designPlan.depId, trigger: b.trigger, isTopConcept: isTop, wow: w, finalPostReadiness: ready, warnings: b.scores.warnings, blockers: b.scores.blockers, layout: b.designPlan.layout } as unknown as Json,
        };
      });
      const { data: insP } = await supabase.from("zono_quick_creative_outputs").insert(finalRows as never).select("id");
      const adIds = ((insP ?? []) as { id: string }[]).map((r) => r.id);
      await generateAdScenesForOutputs(supabase, orgId, adIds);
      return { requestId, created: finalRows.length };
    }
  }

  const variations = buildQuickVariations(g.requestType, g.input, brand.snapshot, g.format);
  // Candidate matrix: each strategic variation × each style family (≈16 candidates).
  const briefs: CandidateBrief[] = [];
  variations.forEach((v, vi) => {
    QUALITY_FAMILIES.forEach((family, fi) => {
      const df = directorFields(g.requestType, g.input, brand.snapshot, v, fi);
      const blocks = ((v.render as { blocks?: { component?: string; align?: string; emphasis?: string }[] } | null)?.blocks) ?? [];
      const outputDraft: Record<string, unknown> = {
        org_id: orgId, request_id: requestId, agent_id: brand.agentId, office_id: orgId, property_id: propertyId, deal_id: g.dealId ?? null,
        output_type: g.requestType, variant_name: v.variantName, format: g.format, title: `${v.variantName} · ${v.headline}`,
        render_data: v.render as unknown as Json, headline: v.headline, subheadline: v.subheadline, body_text: v.body, cta_text: v.cta,
        brand_match_score: v.scores.brandMatch, readability_score: v.scores.readability, conversion_score: v.scores.conversion,
        seller_lead_score: v.scores.sellerLead, buyer_lead_score: v.scores.buyerLead, overall_score: v.scores.overall, status: "generated",
        ...df,
      };
      briefs.push({
        candidateId: `c-${vi}-${fi}`, family, style: family,
        headline: v.headline, subheadline: v.subheadline, body: v.body, cta: v.cta,
        featureChips: feats, providedFeatures: feats, propertyType: g.input.propertyType ?? null,
        hasPrice: Boolean(g.input.price), hasPropertyImage: Boolean(g.input.propertyImage),
        hasAgentPhoto: Boolean(brand.snapshot.agentPhoto), hasOfficeLogo: Boolean(brand.snapshot.officeLogo),
        brandColorCount: brand.snapshot.colors.filter(Boolean).length, propertyStrengthScore: propertyFirst.propertyStrengthScore,
        blocks, base: { scrollStop: df.scroll_stop_score as number, antiAi: df.anti_ai_score as number, creativeDirector: df.creative_director_score as number, rtlReadability: df.rtl_readability_score as number },
        internalPrompt: df.internal_prompt as string, creativeStrategy: df.creative_strategy as string, visualHook: df.visual_hook as string,
        propertyPrimaryAngle: propertyFirst.propertyPrimaryAngle, renderData: v.render, outputDraft,
      });
    });
  });

  const quality = await runQualityPipeline({ db: supabase, orgId, requestId, entityType: g.entityType ?? null, entityId: isUuid(g.entityId) ? g.entityId : null, briefs, inspiration });
  // Show the selected candidates (fallback: top scored if everything was blocked).
  const winners = quality.selected.length ? quality.selected
    : [...quality.rejected].sort((a, b) => b.scores.overall_quality_score - a.scores.overall_quality_score).slice(0, QUALITY_CONFIG.finalCount);

  const selectionMeta = { candidatesTotal: quality.candidatesTotal, rounds: quality.rounds, threshold: QUALITY_CONFIG.minQualityScore };
  const adScoresOf = (c: typeof winners[number]) => {
    const rd = (c.brief.outputDraft as { render_data?: { ad?: { scores?: { finalPostReadiness?: number; warnings?: string[]; blockers?: string[] }; angleLabel?: string } } }).render_data;
    return rd?.ad?.scores ? { finalPostReadiness: rd.ad.scores.finalPostReadiness ?? null, warnings: rd.ad.scores.warnings ?? [], blockers: rd.ad.scores.blockers ?? [], angleLabel: rd.ad.angleLabel ?? null } : null;
  };
  const rows = winners.map((c) => {
    const adScores = adScoresOf(c);
    return {
      ...(c.brief.outputDraft as Record<string, unknown>),
      quality_status: c.scores.overall_quality_score >= QUALITY_CONFIG.minQualityScore && !c.scores.hard_blocked ? "passed" : "below_threshold",
      overall_quality_score: c.scores.overall_quality_score, wow_score: c.scores.wow_score,
      critic_summary: c.critic.critic_summary, quality_review_id: quality.reviewIdByCandidate[c.brief.candidateId] ?? null,
      generation_round: c.generationRound, is_hidden_due_to_quality: false,
      used_inspiration_assets: inspiration.usedInspirationAssets as unknown as Json,
      property_primary_angle: c.brief.propertyPrimaryAngle,
      creative_selection_metadata: { ...selectionMeta, family: c.brief.family, wow: c.scores.wow_score, ...(adScores ?? {}) } as unknown as Json,
    };
  });
  const { data: inserted } = await supabase.from("zono_quick_creative_outputs").insert(rows as never).select("id");
  const ids = ((inserted ?? []) as { id: string }[]).map((r) => r.id);
  // CREATIVE PRODUCTION ENGINE: property ads get an AI advertising SCENE (Gemini
  // hero-integrated) composited under the locked real assets + Hebrew. Other types
  // keep the existing final-image path. Both best-effort; never fabricate.
  if (g.requestType === "property_ad_post") await generateAdScenesForOutputs(supabase, orgId, ids);
  else await generateImagesForOutputs(supabase, orgId, ids);
  return { requestId, created: rows.length };
}

const QUALITY_FAMILIES = VARIATION_STYLES;

/** CREATIVE PRODUCTION ENGINE: for each property-ad output, produce the AI
 *  advertising SCENE (Gemini hero-integrated) and stamp it on the output, so the
 *  renderer composites locked assets + Hebrew on top. Best-effort; never throws;
 *  never fabricates — no provider/failure leaves the deterministic renderer. */
async function generateAdScenesForOutputs(supabase: DB, orgId: string, outputIds: string[]): Promise<void> {
  if (!outputIds.length) return;
  await Promise.allSettled(outputIds.map(async (id) => {
    try {
      const { data } = await supabase.from("zono_quick_creative_outputs").select("render_data").eq("org_id", orgId).eq("id", id).maybeSingle();
      const rd = (data as { render_data?: { ad?: FinalAdData } } | null)?.render_data;
      const ad = rd?.ad;
      if (!rd || !ad) return;
      const scene = await produceAdScene(ad);
      if (scene.status === "no_provider") {
        await supabase.from("zono_quick_creative_outputs").update({ image_status: "no_provider" }).eq("org_id", orgId).eq("id", id);
        return;
      }
      if (scene.status === "failed" || !scene.b64) {
        await supabase.from("zono_quick_creative_outputs").update({ image_status: "failed", image_error: (scene.error ?? "scene failed").slice(0, 500) }).eq("org_id", orgId).eq("id", id);
        return;
      }
      const ext = scene.mime?.includes("png") ? "png" : scene.mime?.includes("webp") ? "webp" : "jpg";
      const path = `${orgId}/scene/${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(VISUAL_BUCKET).upload(path, Buffer.from(scene.b64, "base64"), { contentType: scene.mime ?? "image/png", upsert: true });
      if (upErr) { await supabase.from("zono_quick_creative_outputs").update({ image_status: "failed", image_error: `upload: ${upErr.message}`.slice(0, 500) }).eq("org_id", orgId).eq("id", id); return; }
      const { data: pub } = supabase.storage.from(VISUAL_BUCKET).getPublicUrl(path);
      const sceneUrl = pub.publicUrl;
      const nextAd = { ...ad, sceneUrl, sceneStatus: scene.status, sceneMode: scene.mode };
      await supabase.from("zono_quick_creative_outputs").update({
        image_url: sceneUrl, image_provider: scene.provider, image_status: scene.status, image_error: null,
        render_data: { ...rd, ad: nextAd } as never,
      }).eq("org_id", orgId).eq("id", id);
    } catch (e) {
      console.error(`[cpe][scene] failed for ${id}:`, e instanceof Error ? e.message : e);
      try { await supabase.from("zono_quick_creative_outputs").update({ image_status: "failed", image_error: String(e).slice(0, 500) }).eq("org_id", orgId).eq("id", id); } catch { /* ignore */ }
    }
  }));
}

/** Generate the final AI image for many outputs in parallel; never throws. */
async function generateImagesForOutputs(supabase: DB, orgId: string, outputIds: string[]): Promise<void> {
  if (!outputIds.length) return;
  const info = resolveImageProvider();
  // No real provider — stamp a clear status so the UI shows the warning, and
  // log loudly. We do NOT fabricate an image.
  if (info.provider === "mock") {
    console.warn(`[quick-creative][image] MOCK PROVIDER ACTIVE — no real image generated (${info.reason}). outputs=${outputIds.length}`);
    await supabase.from("zono_quick_creative_outputs").update({ image_status: "no_provider" }).eq("org_id", orgId).in("id", outputIds);
    return;
  }
  await Promise.allSettled(outputIds.map((id) => genImageForOutput(supabase, orgId, id).catch((e) => {
    console.error(`[quick-creative][image] generation failed for ${id}:`, e instanceof Error ? e.message : e);
  })));
}

export async function listQuickOutputs(opts: { entityType?: string; entityId?: string; propertyId?: string | null }): Promise<QuickOutputRow[]> {
  const { orgId, supabase } = await ctx();
  let q = supabase.from("zono_quick_creative_outputs").select("*").eq("org_id", orgId).neq("status", "deleted");
  // Normal users never see quality-hidden outputs.
  q = q.not("is_hidden_due_to_quality", "is", true);
  // scope to this entity's creatives where possible
  if (opts.entityType === "property" && isUuid(opts.entityId)) q = q.eq("property_id", opts.entityId);
  else if (opts.entityType === "agent" && isUuid(opts.entityId)) q = q.eq("agent_id", opts.entityId);
  const { data } = await q.order("is_favorite", { ascending: false }).order("created_at", { ascending: false }).limit(60);
  return (data ?? []) as QuickOutputRow[];
}

/** Admin/debug: every candidate (selected + rejected) with scores + critic. */
export async function listCreativeCandidates(opts: { entityType?: string; entityId?: string }): Promise<Record<string, unknown>[]> {
  const { orgId, supabase } = await ctx();
  let q = supabase.from("zono_creative_candidates").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(80);
  if (opts.entityType && isUuid(opts.entityId)) q = q.eq("entity_type", opts.entityType).eq("entity_id", opts.entityId);
  const { data } = await q;
  return (data ?? []) as Record<string, unknown>[];
}

export async function setQuickFavorite(outputId: string, value: boolean): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("zono_quick_creative_outputs").update({ is_favorite: value }).eq("org_id", orgId).eq("id", outputId);
}
export async function approveQuickOutput(outputId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_quick_creative_outputs").update({ is_approved: true, status: "approved" }).eq("org_id", orgId).eq("id", outputId).select("output_type,variant_name,agent_id,property_id").single();
  const row = data as { output_type: string; variant_name: string; agent_id: string | null; property_id: string | null } | null;
  if (row) await learn(supabase, orgId, row, "quick_approved", userId);
}
export async function rejectQuickOutput(outputId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  const { data } = await supabase.from("zono_quick_creative_outputs").update({ is_approved: false, status: "rejected" }).eq("org_id", orgId).eq("id", outputId).select("output_type,variant_name,agent_id,property_id").single();
  const row = data as { output_type: string; variant_name: string; agent_id: string | null; property_id: string | null } | null;
  if (row) await learn(supabase, orgId, row, "quick_rejected", userId);
}
export async function duplicateQuickOutput(outputId: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_quick_creative_outputs").select("*").eq("org_id", orgId).eq("id", outputId).maybeSingle();
  const o = data as Record<string, unknown> | null;
  if (!o) throw new Error("הפלט לא נמצא");
  await supabase.from("zono_quick_creative_outputs").insert({
    org_id: orgId, request_id: o.request_id, agent_id: o.agent_id, office_id: o.office_id, property_id: o.property_id, deal_id: o.deal_id,
    output_type: o.output_type, variant_name: `${o.variant_name as string} (עותק)`, format: o.format, title: `${o.title as string} (עותק)`,
    render_data: o.render_data as Json, headline: o.headline, subheadline: o.subheadline, body_text: o.body_text, cta_text: o.cta_text,
    brand_match_score: o.brand_match_score, readability_score: o.readability_score, conversion_score: o.conversion_score, seller_lead_score: o.seller_lead_score, buyer_lead_score: o.buyer_lead_score, overall_score: o.overall_score, status: "generated",
  } as never);
}
export async function editQuickText(outputId: string, patch: { headline?: string; subheadline?: string; body_text?: string; cta_text?: string }): Promise<void> {
  const { orgId, supabase } = await ctx();
  // also reflect into render_data blocks
  const { data } = await supabase.from("zono_quick_creative_outputs").select("render_data").eq("org_id", orgId).eq("id", outputId).maybeSingle();
  const rd = (data as { render_data?: Record<string, unknown> } | null)?.render_data;
  const update: Record<string, unknown> = { ...patch };
  if (rd && Array.isArray((rd as { blocks?: unknown[] }).blocks)) {
    const blocks = ((rd as { blocks: Record<string, unknown>[] }).blocks).map((b) => {
      if (b.component === "headline" && patch.headline !== undefined) return { ...b, text: patch.headline };
      if (b.component === "whatsapp_cta" && patch.cta_text !== undefined) return { ...b, text: patch.cta_text };
      return b;
    });
    update.render_data = { ...rd, blocks } as unknown as Json;
  }
  await supabase.from("zono_quick_creative_outputs").update(update as never).eq("org_id", orgId).eq("id", outputId);
}
/** Replace the property/hero image inside render_data. */
export async function replaceQuickImage(outputId: string, imageUrl: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("zono_quick_creative_outputs").select("render_data").eq("org_id", orgId).eq("id", outputId).maybeSingle();
  const rd = (data as { render_data?: Record<string, unknown> } | null)?.render_data;
  if (rd && Array.isArray((rd as { blocks?: unknown[] }).blocks)) {
    const blocks = ((rd as { blocks: Record<string, unknown>[] }).blocks).map((b) => b.component === "image_placeholder" ? { ...b, imageUrl } : b);
    await supabase.from("zono_quick_creative_outputs").update({ render_data: { ...rd, blocks } as unknown as Json, preview_url: imageUrl, thumbnail_url: imageUrl }).eq("org_id", orgId).eq("id", outputId);
  }
}
export async function regenerateQuickRequest(requestId: string): Promise<{ created: number }> {
  const { orgId, supabase } = await ctx();
  const { data: req } = await supabase.from("zono_quick_creative_requests").select("*").eq("org_id", orgId).eq("id", requestId).maybeSingle();
  const rq = req as Record<string, unknown> | null;
  if (!rq) throw new Error("הבקשה לא נמצאה");
  const out = await supabase.from("zono_quick_creative_outputs").select("format").eq("org_id", orgId).eq("request_id", requestId).limit(1).maybeSingle();
  const format = (out.data as { format?: string } | null)?.format ?? "feed_4_5";
  // archive prior non-approved
  await supabase.from("zono_quick_creative_outputs").update({ status: "archived" }).eq("org_id", orgId).eq("request_id", requestId).eq("status", "generated").eq("is_approved", false).eq("is_favorite", false);
  const r = await generateQuickCreativeFromRequest(supabase, orgId, rq, format);
  return r;
}
async function generateQuickCreativeFromRequest(supabase: DB, orgId: string, rq: Record<string, unknown>, format: string): Promise<{ created: number }> {
  const brandSnap = (rq.brand_snapshot ?? {}) as BrandSnapshot;
  const input = (rq.input_data ?? {}) as QuickInput;
  const variations = buildQuickVariations(rq.request_type as QuickType, input, brandSnap, format);
  const rows = variations.map((v) => ({
    org_id: orgId, request_id: rq.id, agent_id: rq.agent_id, office_id: rq.office_id, property_id: rq.property_id, deal_id: rq.deal_id,
    output_type: rq.request_type, variant_name: v.variantName, format, title: `${v.variantName} · ${v.headline}`,
    render_data: v.render as unknown as Json, headline: v.headline, subheadline: v.subheadline, body_text: v.body, cta_text: v.cta,
    brand_match_score: v.scores.brandMatch, readability_score: v.scores.readability, conversion_score: v.scores.conversion,
    seller_lead_score: v.scores.sellerLead, buyer_lead_score: v.scores.buyerLead, overall_score: v.scores.overall, status: "generated",
    ...directorFields(rq.request_type as QuickType, input, brandSnap, v),
  }));
  const { data: inserted } = await supabase.from("zono_quick_creative_outputs").insert(rows as never).select("id");
  const ids = ((inserted ?? []) as { id: string }[]).map((r) => r.id);
  await generateImagesForOutputs(supabase, orgId, ids);
  return { created: rows.length };
}

const VISUAL_BUCKET = "generated-zono-visuals";
/**
 * Generate the FINAL ad image for a quick-creative output via Gemini Nano Banana
 * — using the variation's master prompt + the property photo as reference.
 * Uploads the real image to storage and stores it on the output (#P3 final image).
 */
export async function generateQuickCreativeImage(outputId: string): Promise<{ imageUrl: string; provider: string }> {
  const { orgId, supabase } = await ctx();
  return genImageForOutput(supabase, orgId, outputId);
}

/**
 * Core: build prompt → call real image provider → upload to storage → save
 * image_url. Emits a step-by-step debug block (mandatory debug check). Stamps
 * image_status so the UI can distinguish generated / no_provider / failed.
 */
async function genImageForOutput(supabase: DB, orgId: string, outputId: string): Promise<{ imageUrl: string; provider: string }> {
  const info = resolveImageProvider();
  const { data: o } = await supabase
    .from("zono_quick_creative_outputs")
    .select("id,internal_prompt,render_data,request_id")
    .eq("org_id", orgId).eq("id", outputId).maybeSingle();
  const out = o as { id: string; internal_prompt: string | null; render_data: unknown; request_id: string | null } | null;
  if (!out) throw new Error("התוצר לא נמצא");
  const prompt = out.internal_prompt || "Premium Hebrew RTL real-estate social ad.";

  // Reference photo: the property image from the originating request, if any.
  let refUrl: string | null = null;
  if (out.request_id) {
    const { data: req } = await supabase.from("zono_quick_creative_requests").select("input_data").eq("org_id", orgId).eq("id", out.request_id).maybeSingle();
    const input = (req as { input_data?: { propertyImage?: string } } | null)?.input_data;
    if (input?.propertyImage) refUrl = input.propertyImage;
  }

  const log = (k: string, v: unknown) => console.log(`[quick-creative][image][${outputId}] ${k}:`, v);
  log("selected provider", info.provider);
  log("provider reason", info.reason);
  log("has API key", info.hasKey);
  log("prompt length", prompt.length);
  if (info.provider === "mock") {
    console.warn(`[quick-creative][image][${outputId}] MOCK PROVIDER ACTIVE — no real image generated`);
    await supabase.from("zono_quick_creative_outputs").update({ image_status: "no_provider" }).eq("org_id", orgId).eq("id", outputId);
    throw new Error(`MOCK_PROVIDER:${info.reason}`);
  }

  try {
    log("calling provider", true);
    const img = await generateFinalImage(prompt, refUrl);
    log("provider response received", true);
    const bytes = Buffer.from(img.b64, "base64");
    const ext = img.mime.includes("png") ? "png" : img.mime.includes("webp") ? "webp" : "jpg";
    const path = `${orgId}/quick/${outputId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(VISUAL_BUCKET).upload(path, bytes, { contentType: img.mime, upsert: true });
    if (upErr) { log("uploaded to storage", false); throw new Error(`העלאת התמונה נכשלה: ${upErr.message}`); }
    log("uploaded to storage", true);
    const { data: pub } = supabase.storage.from(VISUAL_BUCKET).getPublicUrl(path);
    const imageUrl = pub.publicUrl;
    log("storage path", path);

    // Persist image_url + inject into the render image placeholder.
    let nextRd = out.render_data as unknown;
    try {
      const rd = out.render_data as { blocks?: Record<string, unknown>[] } | null;
      if (rd?.blocks) nextRd = { ...rd, blocks: rd.blocks.map((b) => (b.component === "image_placeholder" ? { ...b, imageUrl } : b)) };
    } catch { /* keep original */ }
    await supabase.from("zono_quick_creative_outputs").update({ image_url: imageUrl, image_provider: img.provider, image_status: "generated", image_error: null, render_data: nextRd as never }).eq("org_id", orgId).eq("id", outputId);
    log("generated_image_url saved", true);
    log("generated_image_url", imageUrl);
    return { imageUrl, provider: img.provider };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("provider response received", false);
    log("generated_image_url saved", false);
    log("error", msg);
    await supabase.from("zono_quick_creative_outputs").update({ image_status: "failed", image_error: msg.slice(0, 500) }).eq("org_id", orgId).eq("id", outputId);
    throw e;
  }
}

async function learn(supabase: DB, orgId: string, row: { output_type: string; variant_name: string; agent_id: string | null; property_id: string | null }, feedbackType: string, userId: string) {
  try {
    const entityType = row.property_id ? "property" : "agent";
    const entityId = row.property_id ?? row.agent_id ?? orgId;
    await supabase.from("zono_marketing_feedback").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, feedback_source: "quick_creative", feedback_type: feedbackType, feedback_value: `${row.output_type}:${row.variant_name}`, created_by: userId });
  } catch { /* best-effort */ }
}
