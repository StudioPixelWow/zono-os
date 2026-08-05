// ============================================================================
// ZONO design-engine — assemble a DesignJSON from ZONO content + brand DNA.
// Picks a premium layout, assembles elements from the component library, then
// enforces the brand language (colors/fonts) — the deterministic equivalent of
// frame-ai's styleEnforcer, tuned for ZONO real-estate ads.
// ============================================================================
import "server-only";
import { getLayoutTemplate, assembleDesign } from "./layout-templates";
import type { DesignJSON, DesignLayoutType, DesignCanvas } from "./types";

export interface DesignContent {
  headline: string; subtitle?: string; bodyText?: string;
  heroImage?: string; logoUrl?: string; badgeText?: string;
  price?: string; offerDescription?: string; ctaText?: string;
  phone?: string; email?: string; features?: string[];
  propertyHighlights?: Array<{ icon?: string; label: string; value: string }>;
  agentName?: string; agentTitle?: string; agentPhoto?: string;
  testimonialQuote?: string; testimonialAuthor?: string;
}
export interface DesignBrand { primary: string; accent: string; deep?: string }

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Deterministic brand enforcement across the assembled elements. */
function brandify(design: DesignJSON, brand: DesignBrand): void {
  const deep = brand.deep || brand.primary;
  design.canvas.backgroundColor = brand.primary;
  design.canvas.backgroundGradient = `linear-gradient(160deg, ${deep} 0%, ${brand.primary} 100%)`;
  for (const el of design.elements) {
    const st = el.style;
    switch (el.type) {
      case "overlay": el.props.gradient = `linear-gradient(to top, ${brand.primary} 0%, ${rgba(brand.primary, 0.9)} 32%, ${rgba(brand.primary, 0.15)} 62%, transparent 100%)`; st.opacity = 1; break;
      case "headline": st.color = "#FFFFFF"; st.fontWeight = "800"; break;
      case "subtitle": st.color = "rgba(255,255,255,0.92)"; break;
      case "body_text": st.color = "rgba(255,255,255,0.9)"; break;
      case "badge": st.backgroundColor = brand.accent; st.color = "#FFFFFF"; st.fontWeight = "800"; st.borderRadius = 8; break;
      case "cta_button": st.backgroundColor = brand.accent; st.color = "#FFFFFF"; st.fontWeight = "800"; break;
      case "offer_block": st.backgroundColor = "#FFFFFF"; st.color = brand.primary; st.borderRadius = 14; break;
      case "property_highlights": st.backgroundColor = rgba("#FFFFFF", 0.14); st.color = "#FFFFFF"; break;
      case "feature_list": st.color = "#FFFFFF"; break;
      case "agent_block": st.color = "#FFFFFF"; break;
      case "contact_block": st.color = "#FFFFFF"; break;
      case "statistic_block": st.color = "#FFFFFF"; break;
      case "testimonial_block": st.color = "#FFFFFF"; st.backgroundColor = rgba(deep, 0.6); break;
      case "divider": st.backgroundColor = brand.accent; break;
      case "shape": if (el.props?.shapeType === "accent_bar" || el.props?.shapeType === "line") st.backgroundColor = brand.accent; break;
    }
  }
}

export function buildDesign(
  layoutType: DesignLayoutType,
  content: DesignContent,
  brand: DesignBrand,
  dims: { width: number; height: number } = { width: 1080, height: 1350 },
): DesignJSON {
  const tmpl = getLayoutTemplate(layoutType);
  const canvas: DesignCanvas = { width: dims.width, height: dims.height, backgroundColor: brand.primary };
  const elements = assembleDesign(tmpl, canvas, content as unknown as Record<string, unknown>);
  const design: DesignJSON = {
    version: "1.0",
    canvas,
    elements,
    metadata: { layoutType, designType: "feed_post", brandDNAApplied: true, generatedBy: "zono-design-engine" },
  };
  brandify(design, brand);
  return design;
}

/** Premium layouts used for real-estate ads, in rotation for concept variety. */
export const PREMIUM_LAYOUTS: DesignLayoutType[] = [
  "real_estate_premium", "editorial", "luxury", "hero_image", "offer_layout", "magazine",
];

/** Stable layout choice per concept label (so each concept looks distinct). */
export function pickLayout(seed: string, offset = 0): DesignLayoutType {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PREMIUM_LAYOUTS[(h + offset) % PREMIUM_LAYOUTS.length];
}
