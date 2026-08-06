# Platform Output Variants

`size-variants.ts` + `visual-gen-math.ts`. Sizes: Instagram square 1080×1080, Instagram portrait 1080×1350, Story/Reel 1080×1920, Facebook 1200×630, WhatsApp 1080×1080 (configurable); optional original high-res master. Each `PlatformSize` carries `{ width, height, aspect, platform }`.

**Rules:** fit:cover / deterministic reflow — no letterboxing, no black borders, no stretched logo, no cropped critical text/face/price/CTA. `renderSizeVariants` returns per-format PNG bytes + dimensions/aspect metadata.

**Current status:** the size table, aspect computation and cover-resize wrapper are implemented and unit-tested. Full per-aspect **deterministic text/logo/CTA reflow** driven by the design execution plan is specified as the seam (`design-system-engine` supplies zones per aspect) and is the next implementation step — pure center-safe cover crop is in place today; per-aspect reflow is **not yet complete** (listed in gaps).
