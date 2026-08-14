// ============================================================================
// ZONO Agent Website — BRAND TOKENS (pure, client-safe, deterministic).
// ----------------------------------------------------------------------------
// Turns a resolved EffectiveBrand (office colors + agent overrides) into the
// semantic design tokens the premium template consumes. STRUCTURE stays ZONO;
// IDENTITY (these tokens) changes per agent/office. Brand color is used for
// accents/CTA/active/markers only — the base stays white / neutral, so every
// site reads Premium + architectural regardless of the brand hue.
//
// Includes a small WCAG contrast engine (none existed in the repo) so a brand
// color that is too light is never used directly for text/CTA — an accessible
// variant is generated instead (spec §27).
// ============================================================================
import type { EffectiveBrand } from "@/lib/brand-identity/engine";

const HEX6 = /^#?([0-9a-fA-F]{6})$/;

/** Parse #rrggbb (or rrggbb) → [r,g,b] 0-255, or null when not a valid hex. */
export function parseHex(input: string | null | undefined): [number, number, number] | null {
  if (!input) return null;
  const m = HEX6.exec(input.trim());
  if (!m) return null;
  const h = m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** sRGB channel → linear. */
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };

/** Relative luminance (WCAG 2.1). */
export function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two rgb triples (1..21). */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: [number, number, number] = [255, 255, 255];
const INK: [number, number, number] = [15, 23, 42]; // #0f172a

/** Mix an rgb toward a target by amt (0..1). */
const mix = (c: [number, number, number], t: [number, number, number], amt: number): [number, number, number] =>
  [c[0] + (t[0] - c[0]) * amt, c[1] + (t[1] - c[1]) * amt, c[2] + (t[2] - c[2]) * amt];

/** Pick the readable foreground (white or ink) for a given background. */
export function onColor(bg: [number, number, number]): string {
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, INK) ? "#ffffff" : toHex(...INK);
}

/**
 * Return a version of `color` that has at least `min` contrast against white
 * (the site base surface), by progressively darkening toward ink. Used for text
 * links / small accents on white so a pale brand color never becomes unreadable.
 */
export function accessibleOnWhite(color: [number, number, number], min = 4.5): [number, number, number] {
  let c = color;
  for (let i = 0; i < 12 && contrastRatio(c, WHITE) < min; i++) c = mix(c, INK, 0.12);
  return c;
}

export interface BrandTokens {
  /** CSS custom properties to spread on the site root via style={...}. */
  vars: Record<string, string>;
  /** Convenience mirrors for logic (e.g. map marker color). */
  primary: string;
  onPrimary: string;
  hasBrandColor: boolean;
  logo: string | null;
  profileImage: string | null;
}

const DEFAULT_PRIMARY = "#0f4c81"; // ZONO neutral architectural blue — used only when the office set no color

/**
 * Build the full semantic token set the template needs. Spec §26/§3:
 *   --brand-primary/-hover/-secondary/-accent/-soft/-background/-surface
 *   --brand-text/-muted/-border/-on-primary
 * Base surfaces stay white / off-white; brand hue drives accents only.
 * secondary is generated from primary when the office has no secondary (§18).
 */
export function buildBrandTokens(brand: Pick<EffectiveBrand, "primary" | "secondary" | "accent" | "logo" | "profileImage">): BrandTokens {
  const rawPrimary = parseHex(brand.primary);
  const hasBrandColor = !!rawPrimary;
  const primaryRgb = rawPrimary ?? parseHex(DEFAULT_PRIMARY)!;

  // Accessible primary for text/links: the CTA fill can be the true brand color
  // (its on-color adapts); the *link/text* accent uses the a11y-safe variant.
  const linkRgb = accessibleOnWhite(primaryRgb, 4.5);
  const secondaryRgb = parseHex(brand.secondary) ?? mix(primaryRgb, INK, 0.28); // derive when missing
  const accentRgb = parseHex(brand.accent) ?? mix(primaryRgb, WHITE, 0.12);

  const primary = toHex(...primaryRgb);
  const hover = toHex(...mix(primaryRgb, INK, 0.14));
  const secondary = toHex(...secondaryRgb);
  const accent = toHex(...accentRgb);
  const soft = toHex(...mix(primaryRgb, WHITE, 0.9)); // pale brand tint for chips/section accents
  const link = toHex(...linkRgb);
  const onPrimary = onColor(primaryRgb);

  // Immersive HERO anchor. A light brand (e.g. gold) must never fill a big hero
  // band as a flat pale block with white text — it reads cheap and fails contrast.
  // Use the office's dark secondary when it is genuinely dark; otherwise derive a
  // deep tone from the primary. The hero then renders as a premium dark band with
  // the bright brand color used for accents (numbers, CTA) — luxury, on-brand,
  // and always readable in white. Dark brands (navy) keep looking like a dark hero.
  const heroAnchor = luminance(secondaryRgb) < 0.22 ? secondaryRgb : mix(primaryRgb, INK, 0.76);
  const heroTint = mix(heroAnchor, primaryRgb, 0.24);

  const vars: Record<string, string> = {
    "--brand-primary": primary,
    "--brand-primary-hover": hover,
    "--brand-secondary": secondary,
    "--brand-accent": accent,
    "--brand-soft": soft,
    "--brand-link": link,
    "--brand-background": "#ffffff",
    "--brand-surface": "#f8f9fb",
    "--brand-text": "#0f172a",
    "--brand-muted": "#64748b",
    "--brand-border": "#e8eaf0",
    "--brand-on-primary": onPrimary,
    // Immersive hero band (deep, brand-tinted) + always-white ink on it.
    "--brand-hero": toHex(...heroAnchor),
    "--brand-hero-2": toHex(...heroTint),
    "--brand-on-hero": "#ffffff",
    // Bridge to the existing brokerage-site theme vars so shared components
    // (PropertyCard, SiteHero) inherit the same accent without a second system.
    "--site-accent": link,
    "--site-accent-2": secondary,
  };

  return { vars, primary, onPrimary, hasBrandColor, logo: brand.logo ?? null, profileImage: brand.profileImage ?? null };
}

/** Format a phone into a wa.me-safe digit string (with IL country default). */
export function waLink(whatsapp: string | null | undefined, phone?: string | null): string | null {
  const raw = (whatsapp || phone || "").replace(/[^0-9]/g, "");
  if (!raw) return null;
  // Local IL 0xxxxxxxxx → 972xxxxxxxxx
  const intl = raw.startsWith("0") ? "972" + raw.slice(1) : raw;
  return `https://wa.me/${intl}`;
}

export { clamp01, toHex };
