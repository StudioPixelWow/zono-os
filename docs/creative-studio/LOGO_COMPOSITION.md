# Deterministic Logo Composition

`logo-composite.ts` (server-only sharp) + `visual-gen-math.ts` (pure). The image model **never** draws the logo.

- Prefer `logo_transparent_url`; choose light/dark variant by **background contrast** (`chooseLogoVariant` via WCAG relative luminance).
- Aspect ratio preserved; `maxWidthPx`/`maxHeightPx` caps respected.
- Placement follows the layout execution plan's **safe zones** (`safeLogoPlacement` nudges the logo clear of property/face/price/CTA regions) rather than a fixed center-bottom.
- On any failure (missing logo, bad URL, failed download, sharp error) the base image is returned unchanged — compositing never blocks delivery.
- Output PNG, high resolution.

**Tested (pure):** 35% width, centered, 3% margin, max-size caps, contrast variant choice, luminance ordering, collision detection, safe-zone avoidance. **Pixel-match of the composited logo to the source asset** requires a runtime sharp render and is verified in integration (deferred to an environment with sharp installed + a sample render).
