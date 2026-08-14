// ============================================================================
// ZONO — Office brand theme (PURE, client-safe). Produces a SCOPED set of
// `--office-*` CSS custom properties for a branded-office layer over the ZONO
// design system. RULE: STRUCTURE = ZONO (never touch --color-brand / --zono-*),
// IDENTITY = OFFICE (these namespaced vars, consumed only by hero/CTA/badges/
// active states). Reuses the existing WCAG contrast engine so a light brand
// color (e.g. Landsman yellow) is auto-darkened for text/CTA and never fails
// contrast. No global recolor.
// ============================================================================
import { parseHex, accessibleOnWhite, onColor, toHex } from "@/lib/agent-website/brand-tokens";

const WHITE: [number, number, number] = [255, 255, 255];
const INK: [number, number, number] = [15, 23, 42];
const mix = (c: [number, number, number], t: [number, number, number], amt: number): [number, number, number] =>
  [c[0] + (t[0] - c[0]) * amt, c[1] + (t[1] - c[1]) * amt, c[2] + (t[2] - c[2]) * amt];

export interface OfficeTheme {
  /** CSS custom properties to spread on a scoped wrapper via style={...}. */
  vars: Record<string, string>;
  /** True only when the office actually set a valid brand color. */
  hasBrand: boolean;
}

/**
 * ZONO-purple defaults for every --office-* var. The UI always reads var(--office-*)
 * and gets ZONO purple by default; a real office brand overrides these. This keeps
 * components brand-agnostic and guarantees a coherent look before any brand is set.
 */
export const OFFICE_THEME_DEFAULTS: Record<string, string> = {
  "--office-accent": "#7c3aed",
  "--office-accent-ink": "#ffffff",
  "--office-accent-strong": "#6d28d9",
  "--office-accent-deep": "#4c1d95",
  "--office-secondary": "#111827",
  "--office-accent-2": "#8b5cf6",
  "--office-badge": "#f3eeff",
  "--office-badge-ink": "#6d28d9",
  "--office-ring": "#7c3aed",
};

/**
 * Build the scoped office theme. When the office has no valid primary color the
 * result is empty (hasBrand:false) and the UI falls back to the ZONO palette —
 * we never invent a brand color.
 */
export function buildOfficeTheme(
  primary: string | null,
  secondary: string | null,
  accent: string | null,
): OfficeTheme {
  const p = parseHex(primary);
  if (!p) return { vars: {}, hasBrand: false };

  const onP = onColor(p);                       // readable fg on the raw brand fill
  const textAccent = accessibleOnWhite(p, 4.5); // a11y-safe accent for text/icons on white
  const s = parseHex(secondary) ?? INK;
  const a = parseHex(accent) ?? p;
  const softBadge = mix(p, WHITE, 0.86);        // pale chip/badge background
  const strongGrad = mix(p, INK, 0.34);         // deep end for the hero gradient

  return {
    hasBrand: true,
    vars: {
      "--office-accent": toHex(...p),               // brand fill (CTA, hero band)
      "--office-accent-ink": onP,                   // readable text on the fill
      "--office-accent-strong": toHex(...textAccent), // text/icon accent on white surfaces
      "--office-accent-deep": toHex(...strongGrad), // hero gradient dark stop
      "--office-secondary": toHex(...s),
      "--office-accent-2": toHex(...a),
      "--office-badge": toHex(...softBadge),        // pale badge/chip background
      "--office-badge-ink": toHex(...textAccent),   // readable text on the pale badge
      "--office-ring": toHex(...p),                 // selected/active ring
    },
  };
}
