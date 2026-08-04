# Per-Aspect Overlay Reflow — Final

`src/lib/creative-studio/reflow.ts` — deterministic, pure, native-dep-free layout.
Only the photographic layer uses cover-crop; **every** overlay is recomposed
independently per format. `src/lib/creative-studio/reflow.qa.ts` verifies it and
renders a real PNG with `sharp`.

## Formats (6)
`ig_square 1080×1080`, `ig_portrait 1080×1350`, `story 1080×1920`,
`fb_landscape 1200×630`, `whatsapp 1080×1080`, `master 1080×1350`.

## Geometry
The focal photo area sits on **top**; the text/logo band sits on the **bottom**.
`computeGeometry()` derives, per format: a band fraction of the height, the band
top/bottom, a reserved logo rect at the band bottom, and a `focal` safe-zone that
ends **above** the band (so overlays can never collide with it). Story formats
also exclude the platform top/bottom UI strips (0–12% and 88–100%).

## Layout algorithm (`buildReflowPlan`)
1. Reserve the required bottom elements — CTA (+phone) and footer — computing
   their heights first.
2. Place the **headline** at the band top, capped so it cannot intrude on the
   reserved zone (falls back from 2 lines to 1 when space is tight).
3. Fill **optional** elements (secondary, price, facts, market source, identity)
   top-down, each only if it still fits above the reserved zone.
4. Anchor footer at the very bottom, CTA directly above it.
5. Reserve the logo rect at the band bottom.

RTL text is right-aligned (`align: "end"`). Text uses `measureText` (Hebrew
≈0.58×font, ASCII ≈0.52×, space 0.30×), `wrapText` (greedy, never splits a word)
and `fitText` (shrinks toward `MIN_FONT_PX = 22`).

## Deterministic QA (`reflowQA`)
Rejects: sub-minimum fonts, clipping past the canvas, horizontal overflow,
entering Story top/bottom UI, overlapping the focal area, and any element-vs-
element overlap.

## Result
`reflow.qa.ts`: **113 assertions, 0 failed** — all **54** format×fixture
combinations (6 formats × 9 fixtures: short, long, mixed-script, long address,
big price, no price, office, market, light background) are **QA-clean**, plus a
generated 1080×1350 PNG artifact verified via `sharp`.
