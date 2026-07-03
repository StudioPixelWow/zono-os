// ============================================================================
// 🌐 AI Brokerage Website — branding / theme (pure). 32.1. Part: DESIGN SYSTEM.
// Derives CSS variables (glass, gradient, RTL) from the office brand colors so
// each site is customized without changing architecture.
// ============================================================================
import type { SiteBranding } from "./types";

const HEX = /^#?[0-9a-fA-F]{6}$/;
const norm = (c: string, fb: string) => (HEX.test(c) ? (c.startsWith("#") ? c : `#${c}`) : fb);

export function themeVars(b: SiteBranding): Record<string, string> {
  const accent = norm(b.accent, "#0ea5e9");
  const accent2 = norm(b.accent2, "#6366f1");
  return {
    "--site-accent": accent,
    "--site-accent-2": accent2,
    "--site-gradient": `linear-gradient(135deg, ${accent} 0%, ${accent2} 100%)`,
    "--site-glass": "rgba(255,255,255,0.65)",
    "--site-glass-border": "rgba(255,255,255,0.35)",
  };
}
