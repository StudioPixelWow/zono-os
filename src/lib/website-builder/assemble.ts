// ============================================================================
// 🌐 ZONO Website Builder OS™ — pure assembler (client-safe). 38.0.
// Composes the builder view: ordered+toggled sections (from the site config +
// catalog), templates, AI recommendations, health, SEO status, analytics.
// Deterministic, evidence-only, no side effects.
// ============================================================================
import type { BuilderView, BuilderInput, BuilderSection } from "./types";
import { WEBSITE_BUILDER_VERSION } from "./types";
import { SECTION_CATALOG, CANONICAL_ORDER, getSectionDef, TEMPLATES } from "./catalog";
import { buildRecommendations, buildHealth, analyzeSeo } from "./recommend";

/** Merge the persisted order with any catalog/config keys, keeping stable order. */
function resolveOrder(configOrder: string[], sectionKeys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of configOrder) if (!seen.has(k) && (getSectionDef(k) || sectionKeys.includes(k))) { seen.add(k); out.push(k); }
  for (const k of CANONICAL_ORDER) if (!seen.has(k) && sectionKeys.includes(k)) { seen.add(k); out.push(k); }
  for (const k of sectionKeys) if (!seen.has(k)) { seen.add(k); out.push(k); }
  return out;
}

export function assembleBuilderView(input: BuilderInput): BuilderView {
  const c = input.config;
  const notes = [...input.notes];
  const sectionKeys = Object.keys(c.sections);
  const order = resolveOrder(c.order, sectionKeys.length ? sectionKeys : CANONICAL_ORDER);

  const sections: BuilderSection[] = order.map((key, i) => {
    const def = getSectionDef(key) ?? { key, label: key, icon: "▫️", category: "content" as const, essential: false, description: "" };
    return { key, label: def.label, icon: def.icon, category: def.category, enabled: c.sections[key] ?? true, essential: def.essential, order: i };
  });

  const recommendations = buildRecommendations(c, input.analytics);
  const health = buildHealth(c, recommendations);
  const seo = analyzeSeo(c);

  if (c.status !== "published") notes.push("האתר במצב טיוטה — לא פורסם. פרסום דורש אישור.");

  // Live preview URL — only a real, published site is publicly viewable.
  const base = c.target === "agent" ? "/ai-agent" : "/ai-site";
  const previewUrl = c.slug && c.status === "published" ? `${base}/${c.slug}` : null;

  return {
    version: WEBSITE_BUILDER_VERSION,
    target: c.target,
    generatedAt: new Date().toISOString(),
    site: { slug: c.slug, status: c.status, title: c.title, headline: c.headline, published: c.status === "published", viewCount: c.viewCount },
    sections,
    templates: TEMPLATES,
    recommendations,
    health,
    seo: { title: c.headline ?? c.title, description: c.description, ready: seo.ready, issues: seo.issues },
    analytics: input.analytics,
    settings: {
      theme: c.theme,
      contact: { phone: c.phone, whatsapp: c.whatsapp, email: c.email },
      askAiEnabled: c.sections["ask_ai"] ?? false,
      previewUrl,
      updatedAt: c.updatedAt,
    },
    notes,
  };
}

/** Reorder a section list by moving one key up/down (pure helper for the UI/action). */
export function moveSection(order: string[], key: string, dir: "up" | "down"): string[] {
  const i = order.indexOf(key);
  if (i < 0) return order;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const CATALOG_KEYS = SECTION_CATALOG.map((s) => s.key);
