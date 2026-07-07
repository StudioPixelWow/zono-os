// ============================================================================
// 🌐 AI Brokerage Website — branding / theme (pure). 32.1 + 64.0 Luxury themes.
// Derives CSS variables (glass, gradient, ink, RTL) from the office brand colors
// AND a named luxury theme preset, so every generated ZONO site (office / agent /
// property / area / landing) inherits ONE premium design language. Themes affect
// gradient composition, glass, surface and text — not only accent colors. The
// office's own brand colors always take priority for the accent when set.
// ============================================================================
import type { SiteBranding } from "./types";

const HEX = /^#?[0-9a-fA-F]{6}$/;
const norm = (c: string, fb: string) => (HEX.test(c) ? (c.startsWith("#") ? c : `#${c}`) : fb);

/** The 8 luxury theme presets. Default = "luxury-light". */
export type SiteTheme =
  | "luxury-light" | "dark-prestige" | "urban-glass" | "boutique-agent"
  | "developer-project" | "investment" | "family" | "ultra-minimal";

export const SITE_THEMES: { key: SiteTheme; label: string }[] = [
  { key: "luxury-light", label: "Luxury Light" },
  { key: "dark-prestige", label: "Dark Prestige" },
  { key: "urban-glass", label: "Urban Glass" },
  { key: "boutique-agent", label: "Boutique Agent" },
  { key: "developer-project", label: "Developer Project" },
  { key: "investment", label: "Investment" },
  { key: "family", label: "Family" },
  { key: "ultra-minimal", label: "Ultra Minimal" },
];

export function isSiteTheme(v: unknown): v is SiteTheme {
  return typeof v === "string" && SITE_THEMES.some((t) => t.key === v);
}

/** Per-theme design tokens. `angle` + fallback accents drive the gradient; glass,
 *  ink, muted and surface shift the whole mood (light vs. dark vs. minimal). */
interface ThemePreset {
  accent: string; accent2: string; angle: number;
  glass: string; glassBorder: string;
  surface: string; ink: string; muted: string;
  radius: string; overlay: string; // hero photo overlay strength
}

const PRESETS: Record<SiteTheme, ThemePreset> = {
  "luxury-light": {
    accent: "#0ea5e9", accent2: "#6366f1", angle: 135,
    glass: "rgba(255,255,255,0.66)", glassBorder: "rgba(255,255,255,0.4)",
    surface: "#f7f8fb", ink: "#0f172a", muted: "#64748b", radius: "26px", overlay: "0.34",
  },
  "dark-prestige": {
    accent: "#c8a24a", accent2: "#9a7b2e", angle: 145,
    glass: "rgba(20,20,26,0.55)", glassBorder: "rgba(200,162,74,0.28)",
    surface: "#0c0c10", ink: "#f4f1e8", muted: "#a7a297", radius: "22px", overlay: "0.62",
  },
  "urban-glass": {
    accent: "#38bdf8", accent2: "#0ea5e9", angle: 120,
    glass: "rgba(240,247,255,0.5)", glassBorder: "rgba(56,189,248,0.28)",
    surface: "#eef4fb", ink: "#0b1727", muted: "#5b6b80", radius: "28px", overlay: "0.4",
  },
  "boutique-agent": {
    accent: "#b8735a", accent2: "#8c5140", angle: 130,
    glass: "rgba(255,251,248,0.7)", glassBorder: "rgba(184,115,90,0.24)",
    surface: "#faf5f1", ink: "#2a1c16", muted: "#7c6a60", radius: "30px", overlay: "0.36",
  },
  "developer-project": {
    accent: "#2563eb", accent2: "#1e3a8a", angle: 150,
    glass: "rgba(244,247,252,0.6)", glassBorder: "rgba(37,99,235,0.22)",
    surface: "#eef2f9", ink: "#0d1b34", muted: "#5a6b86", radius: "16px", overlay: "0.44",
  },
  "investment": {
    accent: "#10b981", accent2: "#0f766e", angle: 135,
    glass: "rgba(244,250,248,0.62)", glassBorder: "rgba(16,185,129,0.24)",
    surface: "#eef5f2", ink: "#0c1f1a", muted: "#5c7169", radius: "18px", overlay: "0.42",
  },
  "family": {
    accent: "#f59e0b", accent2: "#16a34a", angle: 125,
    glass: "rgba(255,253,247,0.72)", glassBorder: "rgba(245,158,11,0.24)",
    surface: "#fbf8f0", ink: "#26200f", muted: "#7a7057", radius: "32px", overlay: "0.34",
  },
  "ultra-minimal": {
    accent: "#111827", accent2: "#374151", angle: 160,
    glass: "rgba(255,255,255,0.78)", glassBorder: "rgba(17,24,39,0.1)",
    surface: "#ffffff", ink: "#0a0a0a", muted: "#6b7280", radius: "14px", overlay: "0.28",
  },
};

/**
 * Build the site CSS variables. Backward compatible: `themeVars(branding)` still
 * works and now defaults to Luxury Light. Pass a theme (or set `branding.theme`)
 * to switch the whole visual language. Office brand accents win when provided.
 */
export function themeVars(b: SiteBranding, theme?: SiteTheme): Record<string, string> {
  const brandTheme = (b as unknown as { theme?: unknown }).theme;
  const key: SiteTheme = theme ?? (isSiteTheme(brandTheme) ? brandTheme : "luxury-light");
  const p = PRESETS[key];
  // Office brand colors take priority for the accent; theme supplies the mood.
  const accent = norm(b.accent, p.accent);
  const accent2 = norm(b.accent2, p.accent2);
  return {
    "--site-theme": key,
    "--site-accent": accent,
    "--site-accent-2": accent2,
    "--site-gradient": `linear-gradient(${p.angle}deg, ${accent} 0%, ${accent2} 100%)`,
    "--site-glass": p.glass,
    "--site-glass-border": p.glassBorder,
    "--site-surface": p.surface,
    "--site-ink": p.ink,
    "--site-muted": p.muted,
    "--site-radius": p.radius,
    "--site-overlay": p.overlay,
  };
}
