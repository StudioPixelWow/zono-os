// ============================================================================
// 🌐 ZONO Website Builder OS™ — section catalog + templates (pure). 38.0.
// The canonical section CATALOG (Part 1) and the TEMPLATE presets (Part 10).
// Templates only reorder/toggle catalog sections — no new renderer. Applying a
// template produces an enabled_sections map + an order array persisted into the
// EXISTING agent_websites/office_websites columns.
// ============================================================================
import type { SectionDef, SiteTemplate } from "./types";

export const SECTION_CATALOG: SectionDef[] = [
  { key: "hero", label: "Hero", icon: "🎬", category: "core", essential: true, description: "כותרת ראשית, תמונת רקע וקריאה לפעולה" },
  { key: "featured_properties", label: "נכסים מובילים", icon: "🏠", category: "core", essential: true, description: "נכסים נבחרים להצגה" },
  { key: "projects", label: "פרויקטים", icon: "🏗️", category: "content", essential: false, description: "פרויקטים ובנייה חדשה" },
  { key: "neighborhoods", label: "שכונות", icon: "🗺️", category: "content", essential: false, description: "עמודי שכונות ואזורים" },
  { key: "area_insights", label: "תובנות אזור", icon: "📈", category: "content", essential: false, description: "נתוני שוק ומגמות באזור" },
  { key: "statistics", label: "סטטיסטיקות", icon: "📊", category: "content", essential: false, description: "מספרים והישגים" },
  { key: "about", label: "אודות", icon: "👤", category: "content", essential: true, description: "מי אנחנו / רקע מקצועי" },
  { key: "team", label: "צוות", icon: "👥", category: "content", essential: false, description: "חברי הצוות" },
  { key: "testimonials", label: "המלצות", icon: "⭐", category: "social", essential: false, description: "המלצות אמיתיות בלבד" },
  { key: "faq", label: "שאלות נפוצות", icon: "❓", category: "conversion", essential: true, description: "שאלות ותשובות + SEO" },
  { key: "cta", label: "קריאה לפעולה", icon: "🎯", category: "conversion", essential: true, description: "טופס יצירת קשר / השארת פרטים" },
  { key: "contact", label: "צור קשר", icon: "📞", category: "conversion", essential: true, description: "פרטי התקשרות" },
  { key: "ask_ai", label: "שאל AI", icon: "🔮", category: "conversion", essential: false, description: "וידג'ט Ask ZONO לגולשים" },
  { key: "footer", label: "פוטר", icon: "📎", category: "core", essential: true, description: "ניווט תחתון ופרטים" },
  // Aliases used by the EXISTING agent/office DEFAULT_SECTIONS, mapped into the catalog:
  { key: "buyer_request", label: "בקשת קונה", icon: "📝", category: "conversion", essential: false, description: "טופס בקשת קונה" },
  { key: "valuation", label: "הערכת שווי", icon: "💰", category: "conversion", essential: false, description: "בקשת הערכת שווי" },
  { key: "why_me", label: "למה אני", icon: "🏆", category: "content", essential: false, description: "יתרונות ובידול" },
  { key: "market_expertise", label: "מומחיות שוק", icon: "🎓", category: "content", essential: false, description: "מומחיות באזורים" },
  { key: "recent_transactions", label: "עסקאות אחרונות", icon: "🤝", category: "social", essential: false, description: "עסקאות שנסגרו" },
];

const CAT = new Map(SECTION_CATALOG.map((s) => [s.key, s]));
export const getSectionDef = (key: string): SectionDef | null => CAT.get(key) ?? null;

export const ESSENTIAL_KEYS = SECTION_CATALOG.filter((s) => s.essential).map((s) => s.key);

/** Canonical display order for any section keys not otherwise ordered. */
export const CANONICAL_ORDER = SECTION_CATALOG.map((s) => s.key);

// ── Templates (Part 10) — ordered catalog keys ───────────────────────────────
export const TEMPLATES: SiteTemplate[] = [
  { key: "broker", name: "אתר מתווך", description: "אתר אישי למתווך — נכסים, אודות, המלצות, יצירת קשר", sections: ["hero", "featured_properties", "why_me", "market_expertise", "recent_transactions", "testimonials", "faq", "cta", "contact", "ask_ai", "footer"] },
  { key: "office", name: "אתר משרד", description: "אתר משרד תיווך — צוות, פרויקטים, נכסים", sections: ["hero", "featured_properties", "projects", "about", "team", "statistics", "testimonials", "faq", "cta", "contact", "ask_ai", "footer"] },
  { key: "luxury", name: "יוקרה", description: "אתר יוקרה — ויזואלי, נכסים נבחרים, מינימלי", sections: ["hero", "featured_properties", "about", "testimonials", "cta", "contact", "footer"] },
  { key: "investment", name: "השקעות", description: "אתר השקעות — תובנות שוק, תשואות, סטטיסטיקות", sections: ["hero", "area_insights", "statistics", "featured_properties", "faq", "cta", "contact", "ask_ai", "footer"] },
  { key: "builder", name: "יזם/בנייה", description: "אתר יזם — פרויקטים, שכונות, סטטיסטיקות", sections: ["hero", "projects", "neighborhoods", "area_insights", "statistics", "about", "cta", "contact", "footer"] },
  { key: "landing", name: "דף נחיתה", description: "דף נחיתה ממוקד המרה — hero + CTA + FAQ", sections: ["hero", "featured_properties", "faq", "cta", "contact", "footer"] },
  { key: "minimal", name: "מינימלי", description: "אתר קליל — hero, נכסים, יצירת קשר", sections: ["hero", "featured_properties", "contact", "footer"] },
  { key: "premium", name: "פרימיום", description: "אתר מלא — כל הסקשנים המומלצים", sections: ["hero", "featured_properties", "projects", "neighborhoods", "area_insights", "statistics", "about", "team", "testimonials", "faq", "cta", "contact", "ask_ai", "footer"] },
];

export const getTemplate = (key: string): SiteTemplate | null => TEMPLATES.find((t) => t.key === key) ?? null;

/** Turn a template into an ordered list + an enabled_sections map. */
export function applyTemplate(t: SiteTemplate): { order: string[]; enabled: Record<string, boolean> } {
  const enabled: Record<string, boolean> = {};
  for (const k of t.sections) enabled[k] = true;
  for (const k of t.disabled ?? []) enabled[k] = false;
  return { order: [...t.sections, ...(t.disabled ?? [])], enabled };
}
