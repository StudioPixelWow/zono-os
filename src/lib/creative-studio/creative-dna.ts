// ============================================================================
// ZONO — Creative DNA (pure, client-safe)
// ----------------------------------------------------------------------------
// A "Creative DNA" profile distilled from premium real-estate reference ads
// (e.g. the Connection black/gold benchmark). We do NOT copy any reference —
// we encode the rules that make those ads convert: visual hierarchy, typography
// scale, where the logo / agent / CTA / price sit, how features are presented,
// the emotional triggers and conversion techniques. Every final ad follows this
// DNA; the property data only changes the content, never the craft.
// ============================================================================

export interface DnaZone {
  /** Layout zone name. */ zone: string;
  /** Where it lives in the square composition. */ position: string;
  /** What it must contain. */ contains: string;
}

export interface CreativeDnaProfile {
  format: { ratio: string; width: number; height: number };
  /** Ordered top→bottom visual hierarchy (strongest first). */ hierarchy: string[];
  /** Relative type scale (× of base), big headline → small print. */ typeScale: { headline: number; subheadline: number; price: number; featureValue: number; featureLabel: number; cta: number; agent: number };
  zones: DnaZone[];
  emotionalTriggers: string[];
  conversionTechniques: string[];
}

/** The benchmark DNA: bold headline band → hero photo → feature icon row →
 *  large price block → agent + logo + CTA strip. Square, RTL, premium. */
export const CREATIVE_DNA: CreativeDnaProfile = {
  format: { ratio: "1:1", width: 1080, height: 1080 },
  hierarchy: ["headline", "hero_image", "price", "cta", "feature_row", "subheadline", "agent_strip", "logo"],
  typeScale: { headline: 2.4, subheadline: 1.05, price: 3.0, featureValue: 1.25, featureLabel: 0.78, cta: 1.05, agent: 0.92 },
  zones: [
    { zone: "logo", position: "top corner (RTL: top-right)", contains: "real agency logo image only — never recreated as text" },
    { zone: "badge", position: "upper-start corner", contains: "single status badge (new / exclusive / opportunity) — at most one" },
    { zone: "headline", position: "top band over a dark scrim", contains: "one short, strong, sales headline (≤ 5 words)" },
    { zone: "subheadline", position: "directly under headline", contains: "location / one-line hook" },
    { zone: "hero_image", position: "center, dominant ~50% of canvas", contains: "ONE real property photo, cinematic crop, never a collage by default" },
    { zone: "feature_row", position: "horizontal band below hero", contains: "3–5 features as icon + value + label" },
    { zone: "price", position: "prominent block above the agent strip", contains: "exact price, large, with ₪ and a 'מחיר' label" },
    { zone: "agent_strip", position: "bottom bar", contains: "real agent photo + name + phone + CTA pill" },
  ],
  emotionalTriggers: ["scarcity (opportunity won't last)", "exclusivity (private / first to market)", "aspiration (premium lifestyle)", "trust (named agent + real photo)", "urgency (act now)"],
  conversionTechniques: ["one dominant message", "single clear CTA", "price shown with confidence", "scannable feature icons", "face of a real agent to build trust", "high contrast for scroll-stopping"],
};

/** Premium default brand kit (charcoal + gold) used only when the org has no
 *  brand colors — mirrors the benchmark's mood, never overrides real colors. */
export const PREMIUM_DEFAULT_KIT = { bg: "#0E0C12", bg2: "#1A1620", accent: "#E8A33D", accent2: "#F5C46B", text: "#FFFFFF", muted: "#C9C4D2", onAccent: "#141017" } as const;

export interface AdPalette { bg: string; bg2: string; accent: string; accent2: string; text: string; muted: string; onAccent: string }

/** Resolve a final-ad palette from real brand colors, falling back to the
 *  premium charcoal/gold kit. Real colors always win when present. */
export function resolveAdPalette(colors: (string | null | undefined)[]): AdPalette {
  const c = colors.filter((x): x is string => Boolean(x && /^#?[0-9a-fA-F]{3,8}$/.test(x.replace("#", "")))).map((x) => (x.startsWith("#") ? x : `#${x}`));
  const k = PREMIUM_DEFAULT_KIT;
  if (!c.length) return { ...k };
  const bg = c[0] ?? k.bg;
  return { bg, bg2: c[1] ?? k.bg2, accent: c[2] ?? c[1] ?? k.accent, accent2: c[2] ?? k.accent2, text: k.text, muted: k.muted, onAccent: k.onAccent };
}
