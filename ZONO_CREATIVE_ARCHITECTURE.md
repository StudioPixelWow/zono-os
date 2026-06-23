# ZONO Creative Generator — Architecture Analysis & Rebuild Plan

> Status: **analysis + plan only. No code changed.** Approve before implementation.

---

## PHASE 1 — CURRENT FLOW (traced from code)

Entry: property detail → "צור פוסט פרסום" → `/creative/new?propertyId=…`
(`src/app/(app)/creative/new/page.tsx`) → redirects to
`/creative-studio/property/<id>` (`…/[entityType]/[entityId]/page.tsx`).

| # | Concern | Where (file · symbol) | What it actually is |
|---|---------|----------------------|---------------------|
| 1 | Property data | `[entityType]/[entityId]/page.tsx` → `getPropertyById` (`lib/properties/repository.ts`); prefilled into `quickPrefill` | Real DB read (RLS) |
| 2 | Property images | same page → `getPropertyMedia(id).coverUrl` → `quickPrefill.propertyImage` | Real media, single cover |
| 3 | Agency logo | `quick-creative-service.ts · resolveBrandSnapshot` → `organizations.logo_url` + `getEffectiveBrand` | Real asset |
| 4 | Agent image | `resolveBrandSnapshot` → `users.avatar_url` + `getEffectiveBrand.profileImage` | Real asset |
| 5 | Agent name / phone | `resolveBrandSnapshot` → `users.full_name` / `users.phone` (+ brand identity override) | Real data |
| 6 | Marketing copy | `final-creative-engine.ts · generateCopy / conceptCopy` | **Deterministic Hebrew templates** (no AI text) |
| 7 | Visual concept | `final-creative-engine.ts · directConcepts → selectConcepts + artDirectionFor` | Deterministic, **4 distinct concepts** |
| 8 | Template/“design” | `CreativeStudioView.tsx · FinalAdRenderer` branches on `ad.composition` (editorial / urgency_banner / lifestyle / data_panel / price_hero) | Coded HTML/CSS layouts |
| 9 | AI image generation | `visual-providers · generateFinalImage` (Gemini Nano Banana / OpenAI) | **Used only for testimonial/sold posts. SKIPPED for property ads** |
| 10 | Final PNG export | `CreativeStudioView.tsx · exportFinalAdPng` (client, `html-to-image`, 1080²) | Deterministic DOM → PNG |
| 11 | Validation | `quality/orchestrator.ts · runQualityPipeline` (candidate scoring) + `final-creative-engine · validateFinalAd` (7 scores incl. `finalPostReadiness`) | Deterministic scoring |
| 12 | Storage | `zono_quick_creative_requests` (input, brand_snapshot) + `zono_quick_creative_outputs` (`render_data.ad`, scores, `creative_selection_metadata`, `image_status`) | JSONB render-object |

### Verdict: is it AI creatives or templates?
Neither, exactly. For property ads it is a **deterministic asset-composition renderer**: real photo + real brand assets + deterministic Hebrew, arranged by coded layouts. This is the *correct* foundation (it guarantees real assets and correct RTL Hebrew — the two hard requirements). The AI image model is intentionally not used for property ads.

---

## PROBLEMS FOUND (why it still feels like a card)

1. **Art Direction is computed but never consumed.** `artDirectionFor()` produces `visualStory / heroElement / focalPoint / depthLayers / lighting / backgroundTreatment / imageCrop`, but `FinalAdRenderer` reads only `composition` + `palette`. The campaign intent never reaches pixels → flat output. **This is the #1 root cause.**
2. **No Brand DNA layer.** Brand assets are resolved, but there is no *personality* (RE/MAX bold/price-forward vs luxury quiet/image-first vs developer project-led). Every agency therefore renders the same → “generic”.
3. **Design System is implicit & coupled.** The 5 compositions are inline in the renderer and hard-mapped 1:1 to a concept trigger. There is no formal token system (type scale, spacing rhythm, safe zones, allowed effects) and no independent “design family” axis. The user's 5 named families (Premium Clean / Luxury Dark / Editorial / High Conversion / Developer Launch) don't exist as a system.
4. **Quality gate not enforced.** `finalPostReadiness` is computed and shown as a badge, but property outputs are **not rejected below 90** — weak creatives still display.
5. **Low visual craft.** Renderer uses flat gradients and simple blocks: no cinematic image grade, no depth/glass/glow layers, modest type hierarchy, no spacing rhythm → reads as a “card”.
6. **Market context unused.** Not fed into the brief.
7. **Export fragility.** Client `html-to-image` depends on storage CORS for the real photo; not a guaranteed server pipeline.
8. **Single image only.** `getPropertyMedia` returns one cover; no multi-image / collage option.

---

## PHASE 2 — PROPOSED ARCHITECTURE (layers, each one job)

Keep the deterministic foundation. Add the missing layers, decouple design, and — critically — make the renderer *consume* art direction. Each layer = pure function with explicit input → output, all client-safe except asset/market reads.

```
Inputs:  PropertyFacts · RealAssets · AgencyBrand · AgentData · MarketContext
  │
  ▼ CreativeBriefEngine        facts(+market) → brief (audience, angle, emotion, benefit, headline/sub/CTA, why)
  ▼ BrandDNAEngine             agency+agent+refs → brandDNA (personality, palette, type dir, density, luxury, CTA tone, logo/agent rules)
  ▼ MarketingConceptEngine     brief+brandDNA → 4 STRATEGIC concepts (trigger, promise, headline, CTA, visual dir, why-convert)
  ▼ ArtDirectionEngine         concept+brandDNA → art direction (story, hero, focal, composition, hierarchy, crop, bg, depth, light, type scale, zone placements, feel)
  ▼ DesignSystemEngine         artDirection+brandDNA → resolved design family + tokens (layout, type, spacing, ratio, safe areas, zones, effects, colors)
  ▼ AssetResolver              brand+property → resolved real assets OR blockers (gate)
  ▼ DeterministicHebrewRenderer  designSpec+assets → finished square ad (consumes art direction: crop, depth, lighting, zones)
  ▼ QualityValidator           rendered spec → 8 scores; REJECT < 90
  ▼ FinalExportRenderer        approved ad → ready-to-post 1080² PNG
```

Mapping to existing code (reuse vs build):

| Layer | Exists today | Action |
|-------|--------------|--------|
| CreativeBriefEngine | `analyzeBrief` + `generateCopy` | **Extend**: add audience, benefit, market context, "why" |
| BrandDNAEngine | — (only asset resolve) | **Build new** `brand-dna-engine.ts` |
| MarketingConceptEngine | `directConcepts`/`selectConcepts` | **Keep**, feed brandDNA in |
| ArtDirectionEngine | `artDirectionFor` | **Keep + expand** output fields the renderer will consume |
| DesignSystemEngine | implicit compositions | **Build new** `design-system.ts` (5 families + tokens), decouple from trigger |
| AssetResolver | `resolveBrandSnapshot` + asset gate | **Formalize**: hard block on missing required assets |
| DeterministicHebrewRenderer | `FinalAdRenderer` | **Rebuild** to consume art direction + design tokens; add craft (grade/depth/hierarchy) |
| QualityValidator | `validateFinalAd` + `runQualityPipeline` | **Enforce** ≥90 gate for property ads; add emotionalImpact score |
| FinalExportRenderer | `exportFinalAdPng` (client) | **Keep**, add server fallback later |

---

## PHASES 3–11 — LAYER CONTRACTS

**3 · CreativeBriefEngine** — decides *what to say* (no design).
In: property details, city/neighborhood/price/rooms/sqm/floor/balcony/parking/storage/status, agent, agency, market context.
Out: `{ targetAudience, marketingAngle, emotionalTrigger, keyBenefit, headline, subheadline, cta, reason }`.

**4 · BrandDNAEngine** — decides *how the agency feels* (prevents sameness).
In: logo, colors, style, agent profile, reference ads.
Out: `{ personality: "bold_sales"|"quiet_luxury"|"developer"|"balanced", palette, typographyDirection, visualDensity, luxuryLevel, ctaTone, logoPlacement, agentPlacement }`.
Heuristics: colors+style → personality; e.g. high-contrast/red → bold_sales; muted/dark+gold → quiet_luxury; project w/o strong agent → developer.

**5 · MarketingConceptEngine** — 4 *strategic* concepts (not cosmetic).
Per concept: `{ name, psychologicalTrigger, mainPromise, headline, cta, visualDirection, whyConvert }`. Triggers chosen by relevance from {Price Advantage, Family Lifestyle, Urgency, Premium Living, New Listing, Exclusive, Smart Investment}.

**6 · ArtDirectionEngine** — senior creative director per concept.
Out (renderer MUST consume all): `{ visualStory, heroElement, focalPoint, composition, hierarchy[], imageCrop: "wide"|"tight"|"top"|"editorial", backgroundTreatment: "grade"|"duotone"|"blur_layer"|"solid", depthLayers: bool, lighting: "cinematic"|"soft"|"high_contrast", typeScale, ctaPlacement, pricePlacement, logoPlacement, agentPlacement, emotionalFeel }`.

**7 · DesignSystemEngine** — 5 premium families, decoupled from trigger.
`Premium Clean · Luxury Dark · Editorial Real Estate · High Conversion Sales · Developer Launch`. Each defines tokens: `{ layout, typeScale, spacing, imageRatio, safeAreas, zones{logo,agent,price,cta,features}, allowedColors, allowedEffects }`. Family is chosen by **BrandDNA personality + concept**, not by trigger alone.

**8 · AssetResolver** — real assets only; hard gate.
Required: real property image, agency logo, agent name, phone, price, details (agent image only if family requires). Missing required → **block + warning**, do not render.

**9 · DeterministicHebrewRenderer** — our HTML/SVG/Canvas; AI never writes Hebrew.
Exact source strings, RTL, right-aligned, correct punctuation, no mutation/reversal, icons on correct side, features right-to-left. **Now also reads art direction** (crop, depth, lighting, treatment, zone placements) + design tokens.

**10 · QualityValidator** — reject before display.
Scores: AssetAuthenticity, HebrewAccuracy, RTLCorrectness, VisualHierarchy, **EmotionalImpact**, ConversionStrength, BrandConsistency, FinalPostReadiness. Reject if: card-like / fake assets / missing logo|phone|CTA / Hebrew error / broken RTL / weak hierarchy / photo not dominant / all concepts same / not square / **readiness < 90**.

**11 · Output** — ready-to-post 1080² ad with: real photo, logo, headline, subheadline, features, price, CTA, agent name+phone, agent image when relevant, brand colors. Must NOT look like a dashboard card / template preview / Canva / generic AI poster / background-with-text.

---

## PHASE 12 — IMPLEMENTATION PLAN

**1. Files to change**
- `src/lib/creative-studio/final-creative-engine.ts` — extend brief (audience/benefit/market/why); expand `ArtDirection` fields; route concept→family via BrandDNA.
- `src/lib/creative-studio/quick-creative-service.ts` — feed BrandDNA + market; enforce readiness ≥90 gate for property ads (hide/flag below).
- `src/app/(app)/creative-studio/CreativeStudioView.tsx` — **rebuild `FinalAdRenderer`** to consume art direction + design tokens; raise visual craft.
- `[entityType]/[entityId]/page.tsx` — pass all property media (not just cover) + market context into prefill.

**2. Components/modules to create**
- `src/lib/creative-studio/brand-dna-engine.ts` (pure).
- `src/lib/creative-studio/design-system.ts` (5 families + tokens, pure).
- Renderer sub-pieces: `ImageStage` (crop+grade+depth), `BrandFrame` (logo/agent zones), `TypographyBlock`, `PriceBlock`, `FeatureRail`, `CTABlock` — token-driven.

**3. Types**
- `BrandDNA`, `DesignFamily`, `DesignTokens`, expanded `ArtDirection`, `CreativeBrief` (+audience/benefit/market/why), `MarketContext`.

**4. DB/storage to verify**
- `zono_quick_creative_outputs.render_data.ad` already JSONB — store `brandDNA`, `designFamily`, full `artDirection`, scores. **No migration needed** (JSONB). Verify `organizations.logo_url`, `users.avatar_url/phone`, brand identity tables populated.
- Optional later: market context source table.

**5. Rendering approach**
- Keep deterministic HTML/CSS (square 1080). Renderer = DesignSystem tokens × ArtDirection × real assets. Add: cinematic image grade (scrim/duotone/contrast), depth layers (glass/glow/shape), real type hierarchy + spacing rhythm, safe-area zones.

**6. Validation approach**
- Extend `validateFinalAd` (+EmotionalImpact, +"all concepts same" cross-check at request level). In service, for `property_ad_post`: only surface outputs with `finalPostReadiness ≥ 90`; if none pass, show best + explicit "complete assets to reach post-ready".

**7. Preview UI**
- Show per-concept: family name, trigger, art-direction summary, 8 scores, readiness gate. Keep PNG export.

**8. Export pipeline**
- Keep client `html-to-image` 1080² now; add a server render fallback (later milestone) to remove CORS dependence.

**9. Testing checklist**
- 4 concepts are strategically distinct (different family/trigger/headline, not just color).
- Renderer visibly changes with `imageCrop`, `backgroundTreatment`, `depthLayers`, `lighting`.
- Real photo dominant; logo/agent/price/CTA present; Hebrew correct & RTL.
- Missing-asset gate blocks with warning.
- Readiness ≥90 enforced; PNG is 1080².
- BrandDNA changes (bold vs luxury vs developer) visibly change output.
- Scoped `tsc` + `eslint` clean; commit.

---

### Build order (milestones, each verifiable + committable)
1. `brand-dna-engine.ts` + types.
2. `design-system.ts` (5 families + tokens).
3. Expand ArtDirection + brief; wire concept→family.
4. Rebuild `FinalAdRenderer` to consume art direction + tokens + craft.
5. Enforce quality gate + EmotionalImpact + preview UI.
6. Verify + commit. (Server export = later.)
