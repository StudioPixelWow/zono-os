/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Layout Generation Service — Layout templates and design assembly
 *
 * Defines 11 layout templates (one per DesignLayoutType), each specifying
 * percentage-based element slots. Provides utilities to look up templates
 * and assemble DesignElement arrays from templates + content.
 *
 * Server-side only.
 */
import type {
  DesignLayoutType,
  DesignOutputType,
  DesignCanvas,
  DesignElement,
} from './types';
import {
  createHeadlineElement,
  createSubtitleElement,
  createBodyTextElement,
  createCtaButtonElement,
  createLogoElement,
  createImageElement,
  createBadgeElement,
  createDividerElement,
  createFeatureListElement,
  createContactBlockElement,
  createOfferBlockElement,
  createStatisticBlockElement,
  createTestimonialBlockElement,
  createPropertyHighlightsElement,
  createAgentBlockElement,
  createProjectDetailsElement,
  createOverlayElement,
  createShapeElement,
} from './component-library';

/* ── Interfaces ──────────────────────────────────────────────────────── */

export interface LayoutSlot {
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  required: boolean;
}

export interface LayoutTemplate {
  type: DesignLayoutType;
  name: string;
  nameHe: string;
  description: string;
  elementSlots: LayoutSlot[];
  suitableFor: DesignOutputType[];
}

/* ── Layout Templates ────────────────────────────────────────────────── */

const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  /* 1. Editorial — Large image top 60%, headline overlay at bottom, subtle CTA */
  {
    type: 'editorial',
    name: 'Editorial',
    nameHe: 'עריכתי',
    description: 'פריסה עריכתית — תמונה גדולה למעלה, כותרת חופפת בתחתית, CTA עדין',
    suitableFor: ['feed_post', 'story', 'carousel', 'banner', 'website_hero'],
    elementSlots: [
      { role: 'hero_image', x: 0, y: 0, width: 100, height: 60, zIndex: 1, required: true },
      { role: 'overlay', x: 0, y: 40, width: 100, height: 60, zIndex: 2, required: true },
      { role: 'logo', x: 3, y: 3, width: 14, height: 7, zIndex: 20, required: false },
      { role: 'headline', x: 5, y: 62, width: 90, height: 12, zIndex: 10, required: true },
      { role: 'subtitle', x: 5, y: 75, width: 90, height: 8, zIndex: 9, required: false },
      { role: 'cta', x: 30, y: 86, width: 40, height: 7, zIndex: 15, required: false },
      { role: 'badge', x: 70, y: 3, width: 27, height: 5, zIndex: 18, required: false },
    ],
  },

  /* 2. Luxury — Full-bleed image, minimal text, gold/dark accents, centered headline */
  {
    type: 'luxury',
    name: 'Luxury',
    nameHe: 'יוקרתי',
    description: 'פריסה יוקרתית — תמונה מלאה, טקסט מינימלי, אקסנטים של זהב',
    suitableFor: ['feed_post', 'story', 'carousel', 'banner', 'website_hero'],
    elementSlots: [
      { role: 'hero_image', x: 0, y: 0, width: 100, height: 100, zIndex: 1, required: true },
      { role: 'overlay', x: 0, y: 0, width: 100, height: 100, zIndex: 2, required: true },
      { role: 'accent_bar', x: 40, y: 38, width: 20, height: 0.5, zIndex: 5, required: false },
      { role: 'headline', x: 10, y: 40, width: 80, height: 12, zIndex: 10, required: true },
      { role: 'subtitle', x: 15, y: 53, width: 70, height: 8, zIndex: 9, required: false },
      { role: 'accent_bar_bottom', x: 40, y: 62, width: 20, height: 0.5, zIndex: 5, required: false },
      { role: 'logo', x: 38, y: 5, width: 24, height: 8, zIndex: 20, required: false },
      { role: 'cta', x: 30, y: 75, width: 40, height: 7, zIndex: 15, required: false },
    ],
  },

  /* 3. Minimal — Clean white space, centered text, small image */
  {
    type: 'minimal',
    name: 'Minimal',
    nameHe: 'מינימליסטי',
    description: 'פריסה מינימליסטית — רווח לבן, טקסט ממורכז, תמונה קטנה',
    suitableFor: ['feed_post', 'story', 'carousel', 'banner', 'google_display'],
    elementSlots: [
      { role: 'logo', x: 38, y: 5, width: 24, height: 8, zIndex: 20, required: false },
      { role: 'headline', x: 10, y: 25, width: 80, height: 12, zIndex: 10, required: true },
      { role: 'divider', x: 35, y: 39, width: 30, height: 0.5, zIndex: 5, required: false },
      { role: 'subtitle', x: 15, y: 42, width: 70, height: 10, zIndex: 9, required: false },
      { role: 'hero_image', x: 20, y: 55, width: 60, height: 30, zIndex: 1, required: false },
      { role: 'cta', x: 30, y: 88, width: 40, height: 7, zIndex: 15, required: false },
    ],
  },

  /* 4. Sales — Bold headline top, feature list, prominent CTA, urgency badge */
  {
    type: 'sales',
    name: 'Sales',
    nameHe: 'מכירתי',
    description: 'פריסה מכירתית — כותרת בולטת, רשימת יתרונות, CTA בולט, תג דחיפות',
    suitableFor: ['feed_post', 'story', 'carousel', 'banner', 'google_display'],
    elementSlots: [
      { role: 'badge', x: 60, y: 2, width: 37, height: 6, zIndex: 18, required: true },
      { role: 'headline', x: 5, y: 5, width: 90, height: 15, zIndex: 10, required: true },
      { role: 'subtitle', x: 5, y: 21, width: 90, height: 8, zIndex: 9, required: false },
      { role: 'hero_image', x: 5, y: 30, width: 90, height: 28, zIndex: 1, required: false },
      { role: 'feature_list', x: 5, y: 60, width: 90, height: 20, zIndex: 8, required: true },
      { role: 'cta', x: 15, y: 82, width: 70, height: 9, zIndex: 15, required: true },
      { role: 'contact', x: 5, y: 93, width: 90, height: 5, zIndex: 12, required: false },
    ],
  },

  /* 5. Corporate — Professional, structured, with logo prominence */
  {
    type: 'corporate',
    name: 'Corporate',
    nameHe: 'קורפורטיבי',
    description: 'פריסה עסקית — מקצועית, מובנית, לוגו בולט',
    suitableFor: ['feed_post', 'banner', 'website_hero', 'google_display'],
    elementSlots: [
      { role: 'logo', x: 3, y: 3, width: 18, height: 8, zIndex: 20, required: true },
      { role: 'shape_header', x: 0, y: 0, width: 100, height: 15, zIndex: 3, required: false },
      { role: 'headline', x: 5, y: 18, width: 90, height: 12, zIndex: 10, required: true },
      { role: 'divider', x: 5, y: 31, width: 40, height: 0.5, zIndex: 5, required: false },
      { role: 'body_text', x: 5, y: 34, width: 55, height: 25, zIndex: 8, required: false },
      { role: 'hero_image', x: 55, y: 20, width: 42, height: 45, zIndex: 1, required: false },
      { role: 'cta', x: 5, y: 70, width: 45, height: 8, zIndex: 15, required: false },
      { role: 'contact', x: 5, y: 90, width: 90, height: 8, zIndex: 12, required: false },
    ],
  },

  /* 6. Real Estate Premium — Property image hero, price badge, agent block, CTA */
  {
    type: 'real_estate_premium',
    name: 'Real Estate Premium',
    nameHe: 'נדל"ן פרימיום',
    description: 'פריסת נדל"ן פרימיום — תמונת נכס ראשית, תג מחיר, בלוק סוכן, CTA',
    suitableFor: ['feed_post', 'story', 'carousel', 'banner', 'website_hero'],
    elementSlots: [
      { role: 'hero_image', x: 0, y: 0, width: 100, height: 55, zIndex: 1, required: true },
      { role: 'overlay', x: 0, y: 35, width: 100, height: 65, zIndex: 2, required: true },
      { role: 'logo', x: 3, y: 3, width: 14, height: 7, zIndex: 20, required: false },
      { role: 'badge', x: 65, y: 3, width: 32, height: 6, zIndex: 18, required: false },
      { role: 'headline', x: 5, y: 56, width: 90, height: 10, zIndex: 10, required: true },
      { role: 'property_highlights', x: 5, y: 67, width: 90, height: 8, zIndex: 10, required: false },
      { role: 'offer', x: 5, y: 76, width: 50, height: 8, zIndex: 11, required: false },
      { role: 'cta', x: 15, y: 85, width: 40, height: 7, zIndex: 15, required: true },
      { role: 'agent', x: 60, y: 83, width: 35, height: 12, zIndex: 14, required: false },
      { role: 'contact', x: 5, y: 95, width: 90, height: 4, zIndex: 12, required: false },
    ],
  },

  /* 7. Magazine — Multi-column editorial style */
  {
    type: 'magazine',
    name: 'Magazine',
    nameHe: 'מגזין',
    description: 'פריסת מגזין — סגנון עריכתי רב-עמודות',
    suitableFor: ['feed_post', 'carousel', 'banner', 'website_hero'],
    elementSlots: [
      { role: 'hero_image', x: 0, y: 0, width: 50, height: 50, zIndex: 1, required: true },
      { role: 'shape_sidebar', x: 50, y: 0, width: 50, height: 50, zIndex: 3, required: false },
      { role: 'headline', x: 53, y: 8, width: 44, height: 15, zIndex: 10, required: true },
      { role: 'subtitle', x: 53, y: 24, width: 44, height: 8, zIndex: 9, required: false },
      { role: 'body_text', x: 53, y: 34, width: 44, height: 14, zIndex: 8, required: false },
      { role: 'divider', x: 5, y: 53, width: 90, height: 0.5, zIndex: 5, required: false },
      { role: 'feature_list', x: 5, y: 56, width: 55, height: 25, zIndex: 8, required: false },
      { role: 'testimonial', x: 62, y: 56, width: 35, height: 25, zIndex: 9, required: false },
      { role: 'cta', x: 25, y: 84, width: 50, height: 7, zIndex: 15, required: false },
      { role: 'logo', x: 3, y: 92, width: 14, height: 6, zIndex: 20, required: false },
    ],
  },

  /* 8. Modern Tech — Gradient backgrounds, geometric accents */
  {
    type: 'modern_tech',
    name: 'Modern Tech',
    nameHe: 'טכנולוגי מודרני',
    description: 'פריסה טכנולוגית — גרדיאנטים, אקסנטים גיאומטריים',
    suitableFor: ['feed_post', 'story', 'banner', 'website_hero', 'google_display'],
    elementSlots: [
      { role: 'shape_bg', x: 0, y: 0, width: 100, height: 100, zIndex: 1, required: false },
      { role: 'shape_accent_1', x: 70, y: 5, width: 35, height: 35, zIndex: 3, required: false },
      { role: 'shape_accent_2', x: -5, y: 60, width: 25, height: 25, zIndex: 3, required: false },
      { role: 'logo', x: 5, y: 5, width: 15, height: 7, zIndex: 20, required: false },
      { role: 'headline', x: 5, y: 25, width: 60, height: 15, zIndex: 10, required: true },
      { role: 'subtitle', x: 5, y: 41, width: 55, height: 8, zIndex: 9, required: false },
      { role: 'hero_image', x: 55, y: 20, width: 42, height: 40, zIndex: 4, required: false },
      { role: 'statistic', x: 5, y: 55, width: 25, height: 15, zIndex: 9, required: false },
      { role: 'cta', x: 5, y: 78, width: 45, height: 8, zIndex: 15, required: false },
      { role: 'contact', x: 5, y: 92, width: 60, height: 6, zIndex: 12, required: false },
    ],
  },

  /* 9. Split Layout — 50/50 image left + text right */
  {
    type: 'split_layout',
    name: 'Split Layout',
    nameHe: 'פיצול',
    description: 'פריסת פיצול — 50/50 תמונה ימין + טקסט שמאל',
    suitableFor: ['feed_post', 'carousel', 'banner', 'website_hero'],
    elementSlots: [
      { role: 'hero_image', x: 50, y: 0, width: 50, height: 100, zIndex: 1, required: true },
      { role: 'shape_text_bg', x: 0, y: 0, width: 50, height: 100, zIndex: 2, required: false },
      { role: 'logo', x: 3, y: 5, width: 14, height: 7, zIndex: 20, required: false },
      { role: 'headline', x: 4, y: 20, width: 43, height: 15, zIndex: 10, required: true },
      { role: 'subtitle', x: 4, y: 36, width: 43, height: 10, zIndex: 9, required: false },
      { role: 'body_text', x: 4, y: 48, width: 43, height: 15, zIndex: 8, required: false },
      { role: 'cta', x: 6, y: 68, width: 38, height: 8, zIndex: 15, required: false },
      { role: 'contact', x: 4, y: 85, width: 43, height: 8, zIndex: 12, required: false },
    ],
  },

  /* 10. Hero Image — Full background image, headline + CTA overlay */
  {
    type: 'hero_image',
    name: 'Hero Image',
    nameHe: 'תמונה ראשית',
    description: 'פריסת תמונה ראשית — תמונת רקע מלאה, כותרת + CTA חופפים',
    suitableFor: ['feed_post', 'story', 'carousel', 'banner', 'website_hero', 'reel_cover'],
    elementSlots: [
      { role: 'hero_image', x: 0, y: 0, width: 100, height: 100, zIndex: 1, required: true },
      { role: 'overlay', x: 0, y: 0, width: 100, height: 100, zIndex: 2, required: true },
      { role: 'logo', x: 5, y: 5, width: 15, height: 7, zIndex: 20, required: false },
      { role: 'headline', x: 8, y: 35, width: 84, height: 15, zIndex: 10, required: true },
      { role: 'subtitle', x: 12, y: 52, width: 76, height: 10, zIndex: 9, required: false },
      { role: 'cta', x: 25, y: 70, width: 50, height: 8, zIndex: 15, required: false },
    ],
  },

  /* 11. Offer Layout — Price-centric with prominent offer block */
  {
    type: 'offer_layout',
    name: 'Offer Layout',
    nameHe: 'הצעה',
    description: 'פריסת הצעה — מחיר מרכזי עם בלוק הצעה בולט',
    suitableFor: ['feed_post', 'story', 'carousel', 'banner', 'google_display'],
    elementSlots: [
      { role: 'hero_image', x: 0, y: 0, width: 100, height: 45, zIndex: 1, required: false },
      { role: 'overlay', x: 0, y: 25, width: 100, height: 75, zIndex: 2, required: true },
      { role: 'badge', x: 60, y: 3, width: 37, height: 6, zIndex: 18, required: true },
      { role: 'headline', x: 5, y: 46, width: 90, height: 10, zIndex: 10, required: true },
      { role: 'offer', x: 5, y: 57, width: 90, height: 14, zIndex: 11, required: true },
      { role: 'feature_list', x: 5, y: 72, width: 90, height: 12, zIndex: 8, required: false },
      { role: 'cta', x: 15, y: 86, width: 70, height: 8, zIndex: 15, required: true },
      { role: 'logo', x: 3, y: 93, width: 14, height: 5, zIndex: 20, required: false },
    ],
  },
];

/* ── Template Lookup ─────────────────────────────────────────────────── */

const templateMap = new Map<DesignLayoutType, LayoutTemplate>();
for (const t of LAYOUT_TEMPLATES) {
  templateMap.set(t.type, t);
}

/**
 * Get a specific layout template by type.
 */
export function getLayoutTemplate(type: DesignLayoutType): LayoutTemplate {
  const tmpl = templateMap.get(type);
  if (!tmpl) {
    console.warn(`[LayoutService] Unknown layout type "${type}", falling back to editorial`);
    return templateMap.get('editorial')!;
  }
  return tmpl;
}

/**
 * Get all layout templates suitable for a given output type.
 */
export function getLayoutsForOutputType(outputType: DesignOutputType): LayoutTemplate[] {
  return LAYOUT_TEMPLATES.filter((t) => t.suitableFor.includes(outputType));
}

/**
 * Get all available layout templates.
 */
export function getAllLayoutTemplates(): LayoutTemplate[] {
  return [...LAYOUT_TEMPLATES];
}

/* ── Content-to-Element Mapper ───────────────────────────────────────── */

/**
 * Maps a slot role + content value to a DesignElement using the component library.
 * Returns null if the role is unknown or content is missing.
 */
function slotToElement(
  slot: LayoutSlot,
  content: Record<string, any>
): DesignElement | null {
  const posOverrides: Partial<DesignElement> = {
    x: slot.x,
    y: slot.y,
    width: slot.width,
    height: slot.height,
    zIndex: slot.zIndex,
  };

  switch (slot.role) {
    case 'headline':
      if (!content.headline) return null;
      return createHeadlineElement(content.headline, posOverrides);

    case 'subtitle':
      if (!content.subtitle) return null;
      return createSubtitleElement(content.subtitle, posOverrides);

    case 'body_text':
      if (!content.bodyText) return null;
      return createBodyTextElement(content.bodyText, posOverrides);

    case 'cta':
      if (!content.ctaText) return null;
      return createCtaButtonElement(content.ctaText, posOverrides);

    case 'hero_image':
      return createImageElement(content.heroImage || '', posOverrides);

    case 'logo':
      if (!content.logoUrl) return null;
      return createLogoElement(content.logoUrl, posOverrides);

    case 'badge':
      if (!content.badgeText) return null;
      return createBadgeElement(content.badgeText, posOverrides);

    case 'divider':
      return createDividerElement(posOverrides);

    case 'feature_list':
      if (!content.features || !Array.isArray(content.features)) return null;
      return createFeatureListElement(content.features, posOverrides);

    case 'contact':
      if (!content.phone && !content.email) return null;
      return createContactBlockElement(content.phone || '', content.email || '', posOverrides);

    case 'offer':
      if (!content.price) return null;
      return createOfferBlockElement(content.price, content.offerDescription || '', posOverrides);

    case 'statistic':
      if (!content.statValue) return null;
      return createStatisticBlockElement(content.statValue, content.statLabel || '', posOverrides);

    case 'testimonial':
      if (!content.testimonialQuote) return null;
      return createTestimonialBlockElement(
        content.testimonialQuote,
        content.testimonialAuthor || '',
        posOverrides
      );

    case 'property_highlights':
      if (!content.propertyHighlights) return null;
      return createPropertyHighlightsElement(content.propertyHighlights, posOverrides);

    case 'agent':
      if (!content.agentName) return null;
      return createAgentBlockElement(
        content.agentName,
        content.agentTitle || '',
        content.agentPhoto || '',
        posOverrides
      );

    case 'project_details':
      if (!content.projectDetails) return null;
      return createProjectDetailsElement(content.projectDetails, posOverrides);

    case 'overlay':
      return createOverlayElement(posOverrides);

    // Shape roles — accent bars, background shapes, sidebars
    case 'accent_bar':
    case 'accent_bar_bottom':
      return createShapeElement('accent_bar', posOverrides);

    case 'shape_header':
    case 'shape_sidebar':
    case 'shape_text_bg':
    case 'shape_bg': {
      const el = createShapeElement('rectangle', posOverrides);
      el.style.backgroundColor = content.shapeBgColor || 'rgba(0,0,0,0.85)';
      return el;
    }

    case 'shape_accent_1':
    case 'shape_accent_2':
      return createShapeElement('circle', {
        ...posOverrides,
        style: {
          backgroundColor: content.shapeAccentColor || 'rgba(233,69,96,0.15)',
          borderRadius: 9999,
          opacity: 0.3,
        },
      });

    default:
      console.warn(`[LayoutService] Unknown slot role: "${slot.role}"`);
      return null;
  }
}

/* ── Design Assembly ─────────────────────────────────────────────────── */

/**
 * Assemble a complete set of DesignElements from a layout template + content map.
 *
 * @param template - The layout template defining element positions
 * @param canvas   - The canvas dimensions (used for context, positions are %)
 * @param content  - Content map with keys like: headline, subtitle, ctaText, heroImage,
 *                   logoUrl, badgeText, features, phone, email, price, offerDescription,
 *                   statValue, statLabel, testimonialQuote, testimonialAuthor,
 *                   propertyHighlights, agentName, agentTitle, agentPhoto, projectDetails
 * @returns Array of positioned DesignElement objects
 */
export function assembleDesign(
  template: LayoutTemplate,
  _canvas: DesignCanvas,
  content: Record<string, any>
): DesignElement[] {
  const elements: DesignElement[] = [];

  for (const slot of template.elementSlots) {
    const element = slotToElement(slot, content);

    if (!element) {
      // Skip optional slots without content
      if (!slot.required) continue;
      // For required slots without content, create a placeholder
      console.warn(
        `[LayoutService] Required slot "${slot.role}" has no content — creating placeholder`
      );
      const placeholder = createHeadlineElement('', {
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        zIndex: slot.zIndex,
        visible: false,
      });
      elements.push(placeholder);
      continue;
    }

    elements.push(element);
  }

  return elements;
}
