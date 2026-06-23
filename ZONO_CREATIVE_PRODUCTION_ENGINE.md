# ZONO — Creative Production Engine (CPE) · Architecture

> Design only. No code. Goal: stop producing "property card + better layout" and start
> producing **advertising-campaign creatives** — AI owns the art; real assets + Hebrew
> stay locked.

---

## The core reconciliation (read first)

An AI image model **cannot**, reliably:
- reproduce your **exact logo** (it will redraw/distort it),
- render **correct Hebrew** (it hallucinates letters / breaks RTL),
- keep a **real agent face** unaltered (it morphs faces),
- guarantee the **real property photo** is pixel-true (it repaints it).

So "let the AI create the advertisement" is split into two responsibilities:

- **AI owns the SCENE** — art direction, environment, lighting, depth, atmosphere, color
  grade, premium composition, dramatic treatment of the property photo. This is where the
  "campaign" feeling comes from, and it's what we were missing.
- **The Composite Layer owns the TRUTH** — exact logo, exact agent photo, exact Hebrew
  copy, exact price/CTA — overlaid deterministically per the Design Execution Plan zones.

Result: `AI scene (drama) + locked real assets/Hebrew (truth) = real advertisement`.
The deterministic renderer is **not removed** — it becomes the **Composite Layer** (always)
and the **full fallback** (when no image provider/key). "Renderer = fallback" only in the
sense that the *background* is no longer flat — it's the AI scene.

```
Property → Brief → Marketing Concept → Art Direction → Brand DNA → Design System
        → CREATIVE PRODUCTION ENGINE → [GPT Image | Gemini] → AI scene
        → Composite Layer (locked photo/logo/agent/Hebrew per DEP) → Final Advertisement
                                                   └─ (no provider) → deterministic renderer only
```

---

## 1. Inputs
- `approvedConcept` (trigger, promise, headline/sub/cta — Hebrew, locked)
- `artDirection` (visual story, focal point, crop, lighting, depth, treatment, emotional feel, `aiEnvironment` spec)
- `brandDNA` (personality, palette, luxury level, density, logo/agent rules)
- `designExecutionPlan` (family, zone rects, type scale, flags, safe margins)
- **Real assets** (URLs, never altered downstream): property image, agency logo, agent photo, agent name, phone, price, features, city/neighborhood
- `productionMode` (`ai_scene` | `ai_hero_integrated` | `deterministic`)
- `provider` (`gpt-image` | `gemini` | `none`)

## 2. Outputs
- `sceneImageUrl` — AI-generated **background/scene** (text-free, asset-free), stored in storage
- `compositePlan` — which real assets overlay where (from DEP zones)
- `finalCreative` — the composited 1080² (or 1200²) advertisement (rendered + exportable PNG)
- `productionTrace` — prompt sent, provider, model, seed, duration, scene URL, fallback flag, QA scores
- `status` — `ai_produced` | `composited` | `deterministic_fallback` | `blocked_missing_asset`

## 3. GPT Image workflow (`gpt-image-1`)
- Build a **scene prompt** from concept + art direction (English, advertising language — see §"prompt").
- Two sub-modes:
  - **scene-only**: `images.generate` → premium art-directed background/environment with negative space reserved (per DEP) for the locked hero + text. We composite the real photo + assets on top.
  - **hero-integrated** (`images.edit` + mask): supply the **real property photo** + a mask of the area to extend/relight; the model paints a cinematic environment *around* the untouched photo. The photo pixels in the masked-OUT region stay real.
- Size 1024×1024 (upscale to 1080) or 1024×1536 for story. `n=1`. Strong negative prompt (§5).
- Never request text/logo/people in the prompt.

## 4. Gemini workflow (`gemini-2.5-flash-image`, "Nano Banana")
- Multimodal: accepts **reference images** + text, returns an image — strong at *preserving a supplied photo* while restyling the surroundings.
- **hero-integrated** (preferred for property ads): pass the real property photo as reference + the scene prompt → Gemini keeps the property recognizable and builds the premium environment/lighting/atmosphere around it.
- **scene-only**: no reference → pure art-directed background.
- `responseModalities:["IMAGE"]`. Same negative prompt. Paid model → on 429/no-key, fall back.

## 5. Asset protection rules (hard, non-negotiable)
- The model may **only** influence: atmosphere, lighting, background, textures, depth, framing, color grade, premium effects.
- The model may **never** generate or alter: the property building/interior identity, any **text** (any language), any **logo/brand mark**, any **person/face**, price, phone.
- Global negative prompt on every call: `no text, no hebrew, no english, no numbers, no captions, no watermark, no people, no faces, no agent, no logo, no brand mark, no apartment redesign, no invented rooms, no UI, no app, no card`.
- The real property photo is the source of truth; if hero-integrated mode drifts (QA fails property-truth), fall back to scene-only + locked photo overlay.
- If a required real asset is missing → **block** (no fabrication), surface the missing-asset warning.

## 6. Logo rules
- The agency logo is **always** the real file, composited by the Composite Layer in the DEP `logo` zone. Never sent to the image model, never redrawn. If absent → text office-name fallback (not a recreated mark) or block per policy.

## 7. Agent photo rules
- Shown **only** when `designPlan.flags.agentShown` (BrandDNA + concept decide). Real photo composited in the `agent` zone; if `agentPhotoShown` is false or no photo → initials chip. The image model never receives or generates a face.

## 8. Hebrew text rules
- **All** rendered Hebrew comes from the deterministic copy engine (validated, RTL, system font) and is drawn by the Composite Layer — **never** by the image model. Headline/sub/price/CTA/features/agent are overlay text, not pixels from AI. This permanently eliminates fake-Hebrew risk.

## 9. Quality validation rules (gate before showing)
Scores (reject < threshold): `assetAuthenticity`, `hebrewAccuracy`, `rtlCorrectness`, `visualHierarchy`, `emotionalImpact`, `conversionStrength`, `brandConsistency`, **`advertisingImpact`** (new — is it a campaign, not a card?), `propertyTruth` (did hero-integrated keep the real property?), `finalPostReadiness ≥ 90`.
- Auto-reject if: AI scene leaked any text/logo/face (vision check), property not recognizable, scene flat/templatey, all 4 concepts look alike, not square.
- On reject: retry scene once, else **fall back to deterministic renderer** (still a valid finished ad) and flag it.

## 10. Production flow
1. Receive approvedConcept + artDirection + brandDNA + DEP + real assets.
2. Resolve provider (env). No provider/key → **deterministic renderer** (current behavior) and stop.
3. Build the **production-grade scene prompt** (advertising language, not UI): visual drama, composition, emotional trigger of the concept, perceived value, lighting, depth, negative space for overlays.
4. Call provider (hero-integrated for property ads; scene-only otherwise). Best-effort, timeout-guarded.
5. Upload `sceneImageUrl` to storage; stamp productionTrace.
6. **Composite Layer**: place real photo (if not hero-integrated), logo, agent, and all Hebrew/price/CTA per DEP zones over the AI scene.
7. Run QA scores; gate ≥90 + advertisingImpact + propertyTruth. Retry once or fall back.
8. Persist final creative + scene URL + trace; export 1080² PNG.

---

## What changes vs today
- **ArtDirection already emits `aiEnvironment.imageModelPrompt`** (text-free) — CPE upgrades it from "background" to a full **advertising scene prompt** (drama/composition/emotion/perceived-value) per concept.
- **visual-providers** (gemini/openai) already exist — CPE adds the hero-integrated (image+mask / reference) path + scene upload + QA gate.
- **DepCanvas** stays as the **Composite Layer** (draws locked assets + Hebrew over the AI scene) and the **no-provider fallback**.
- New: `advertisingImpact` + `propertyTruth` validators; a vision QA check that the AI scene contains no text/logo/face.

## Locked decisions (approved)
1. **Primary provider:** **Gemini Nano Banana** (`gemini-2.5-flash-image`) — best at keeping the supplied real photo. GPT Image (`gpt-image-1`) = secondary fallback.
2. **Hero mode:** **`ai_hero_integrated` with auto-fallback** — Gemini relights/extends a cinematic scene around the real property photo; if QA `propertyTruth` fails (property unrecognizable / drifted), auto-fall-back to `ai_scene` + locked real-photo overlay; if no provider/key, deterministic renderer.
3. **Spend:** **all 4 concepts** get a full AI scene (×4 paid Gemini calls per generation). Requires `ZONO_IMAGE_PROVIDER=gemini` + `GEMINI_API_KEY` on Vercel; without them every concept falls back to the deterministic renderer (no error, just not AI-produced).
