/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Component Library — Factory functions for creating DesignElement objects
 *
 * Each function returns a DesignElement with sensible defaults for
 * position, size, and style. All positions use percentage-based values.
 *
 * Server-side only.
 */
import type { DesignElement, DesignElementType, DesignElementStyle } from './types';
import { DEFAULT_FONTS } from './design-schema';

/* ── ID Generator ────────────────────────────────────────────────────── */

function generateElementId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ── Base Element Builder ────────────────────────────────────────────── */

function baseElement(
  type: DesignElementType,
  defaults: {
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    props: Record<string, any>;
    style: DesignElementStyle;
  },
  overrides?: Partial<DesignElement>
): DesignElement {
  return {
    id: generateElementId(),
    type,
    x: defaults.x,
    y: defaults.y,
    width: defaults.width,
    height: defaults.height,
    zIndex: defaults.zIndex,
    visible: true,
    rotation: 0,
    props: defaults.props,
    style: defaults.style,
    ...overrides,
  };
}

/* ── Text Elements ───────────────────────────────────────────────────── */

/**
 * Create a headline element (h1 level).
 * Large, bold text — typically the main message of the design.
 */
export function createHeadlineElement(
  text: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'headline',
    {
      x: 5,
      y: 10,
      width: 90,
      height: 15,
      zIndex: 10,
      props: { text, level: 1 },
      style: {
        color: '#FFFFFF',
        fontSize: 48,
        fontFamily: DEFAULT_FONTS.headline,
        fontWeight: '700',
        textAlign: 'right',
      },
    },
    options
  );
}

/**
 * Create a subtitle element (h2 level).
 * Secondary text that supports the headline.
 */
export function createSubtitleElement(
  text: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'subtitle',
    {
      x: 5,
      y: 26,
      width: 90,
      height: 10,
      zIndex: 9,
      props: { text, level: 2 },
      style: {
        color: '#E0E0E0',
        fontSize: 28,
        fontFamily: DEFAULT_FONTS.body,
        fontWeight: '400',
        textAlign: 'right',
      },
    },
    options
  );
}

/**
 * Create a body text element.
 * Regular paragraph content.
 */
export function createBodyTextElement(
  text: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'body_text',
    {
      x: 5,
      y: 38,
      width: 90,
      height: 20,
      zIndex: 8,
      props: { text },
      style: {
        color: '#D0D0D0',
        fontSize: 18,
        fontFamily: DEFAULT_FONTS.body,
        fontWeight: '400',
        textAlign: 'right',
        padding: 8,
      },
    },
    options
  );
}

/* ── CTA Button ──────────────────────────────────────────────────────── */

/**
 * Create a CTA button element.
 * Prominent call-to-action with customizable appearance.
 */
export function createCtaButtonElement(
  text: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'cta_button',
    {
      x: 25,
      y: 80,
      width: 50,
      height: 8,
      zIndex: 15,
      props: { text, href: '#', variant: 'filled' },
      style: {
        backgroundColor: '#E94560',
        color: '#FFFFFF',
        fontSize: 22,
        fontFamily: DEFAULT_FONTS.headline,
        fontWeight: '700',
        textAlign: 'center',
        borderRadius: 8,
        padding: 16,
      },
    },
    options
  );
}

/* ── Image / Media Elements ──────────────────────────────────────────── */

/**
 * Create a logo element.
 * Positioned top-right by default for RTL layouts.
 */
export function createLogoElement(
  logoUrl: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'logo',
    {
      x: 3,
      y: 3,
      width: 15,
      height: 8,
      zIndex: 20,
      props: { src: logoUrl, alt: 'לוגו' },
      style: {
        opacity: 1,
      },
    },
    options
  );
}

/**
 * Create an image element.
 * Can be a property photo, background, or decorative image.
 */
export function createImageElement(
  src: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'image',
    {
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      zIndex: 1,
      props: { src, alt: 'תמונה', objectFit: 'cover' },
      style: {
        borderRadius: 0,
        opacity: 1,
      },
    },
    options
  );
}

/* ── Badge ───────────────────────────────────────────────────────────── */

/**
 * Create a badge element.
 * Small tag/pill for urgency, status, or labels.
 */
export function createBadgeElement(
  text: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'badge',
    {
      x: 70,
      y: 3,
      width: 27,
      height: 5,
      zIndex: 18,
      props: { text, variant: 'filled' },
      style: {
        backgroundColor: '#FDCB6E',
        color: '#1A1A2E',
        fontSize: 14,
        fontFamily: DEFAULT_FONTS.body,
        fontWeight: '700',
        textAlign: 'center',
        borderRadius: 20,
        padding: 6,
      },
    },
    options
  );
}

/* ── Divider ─────────────────────────────────────────────────────────── */

/**
 * Create a horizontal divider element.
 */
export function createDividerElement(
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'divider',
    {
      x: 10,
      y: 50,
      width: 80,
      height: 0.5,
      zIndex: 5,
      props: { direction: 'horizontal' },
      style: {
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 1,
      },
    },
    options
  );
}

/* ── Feature List ────────────────────────────────────────────────────── */

/**
 * Create a feature list element.
 * Displays a list of bullet points or feature items.
 */
export function createFeatureListElement(
  items: string[],
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'feature_list',
    {
      x: 5,
      y: 45,
      width: 90,
      height: 25,
      zIndex: 8,
      props: { items, icon: '✓', columns: 1 },
      style: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: DEFAULT_FONTS.body,
        fontWeight: '400',
        textAlign: 'right',
        padding: 12,
      },
    },
    options
  );
}

/* ── Contact Block ───────────────────────────────────────────────────── */

/**
 * Create a contact information block.
 * Phone, email, and optional additional details.
 */
export function createContactBlockElement(
  phone: string,
  email: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'contact_block',
    {
      x: 5,
      y: 90,
      width: 90,
      height: 8,
      zIndex: 12,
      props: { phone, email, showIcons: true },
      style: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: DEFAULT_FONTS.body,
        fontWeight: '400',
        textAlign: 'right',
        padding: 8,
      },
    },
    options
  );
}

/* ── Offer Block ─────────────────────────────────────────────────────── */

/**
 * Create an offer/price block element.
 * Displays price prominently with a description.
 */
export function createOfferBlockElement(
  price: string,
  description: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'offer_block',
    {
      x: 5,
      y: 60,
      width: 90,
      height: 15,
      zIndex: 11,
      props: { price, description, currency: '₪' },
      style: {
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: '#FFFFFF',
        fontSize: 36,
        fontFamily: DEFAULT_FONTS.headline,
        fontWeight: '700',
        textAlign: 'right',
        borderRadius: 12,
        padding: 16,
      },
    },
    options
  );
}

/* ── Statistic Block ─────────────────────────────────────────────────── */

/**
 * Create a statistic display element.
 * Shows a prominent number/value with a label below it.
 */
export function createStatisticBlockElement(
  value: string,
  label: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'statistic_block',
    {
      x: 10,
      y: 40,
      width: 30,
      height: 18,
      zIndex: 9,
      props: { value, label, unit: '' },
      style: {
        color: '#FFFFFF',
        fontSize: 42,
        fontFamily: DEFAULT_FONTS.headline,
        fontWeight: '800',
        textAlign: 'center',
        padding: 12,
      },
    },
    options
  );
}

/* ── Testimonial Block ───────────────────────────────────────────────── */

/**
 * Create a testimonial/quote element.
 * Displays a quote with attribution.
 */
export function createTestimonialBlockElement(
  quote: string,
  author: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'testimonial_block',
    {
      x: 8,
      y: 55,
      width: 84,
      height: 20,
      zIndex: 9,
      props: { quote, author, showQuoteMark: true },
      style: {
        color: '#FFFFFF',
        fontSize: 20,
        fontFamily: DEFAULT_FONTS.body,
        fontWeight: '400',
        textAlign: 'right',
        padding: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 12,
      },
    },
    options
  );
}

/* ── Property Highlights ─────────────────────────────────────────────── */

/**
 * Create a property highlights element.
 * Displays key property features (rooms, size, floor, etc.).
 */
export function createPropertyHighlightsElement(
  highlights: Array<{ icon?: string; label: string; value: string }>,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'property_highlights',
    {
      x: 5,
      y: 65,
      width: 90,
      height: 12,
      zIndex: 10,
      props: { highlights, layout: 'horizontal' },
      style: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: DEFAULT_FONTS.body,
        fontWeight: '500',
        textAlign: 'center',
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 8,
      },
    },
    options
  );
}

/* ── Agent Block ─────────────────────────────────────────────────────── */

/**
 * Create an agent info block.
 * Displays agent photo, name, and title.
 */
export function createAgentBlockElement(
  name: string,
  title: string,
  photo: string,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'agent_block',
    {
      x: 60,
      y: 85,
      width: 35,
      height: 12,
      zIndex: 14,
      props: { name, title, photo, showFrame: true },
      style: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: DEFAULT_FONTS.body,
        fontWeight: '500',
        textAlign: 'right',
        padding: 8,
      },
    },
    options
  );
}

/* ── Project Details ─────────────────────────────────────────────────── */

/**
 * Create a project details element.
 * Structured block showing project info (developer, location, status, etc.).
 */
export function createProjectDetailsElement(
  details: Record<string, string>,
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'project_details',
    {
      x: 5,
      y: 50,
      width: 45,
      height: 30,
      zIndex: 9,
      props: { details, layout: 'vertical' },
      style: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: DEFAULT_FONTS.body,
        fontWeight: '400',
        textAlign: 'right',
        padding: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 12,
      },
    },
    options
  );
}

/* ── Overlay ─────────────────────────────────────────────────────────── */

/**
 * Create a semi-transparent overlay element.
 * Typically covers part or all of the canvas to improve text readability.
 */
export function createOverlayElement(
  options?: Partial<DesignElement>
): DesignElement {
  return baseElement(
    'overlay',
    {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      zIndex: 2,
      props: { gradient: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' },
      style: {
        opacity: 0.9,
      },
    },
    options
  );
}

/* ── Shape ───────────────────────────────────────────────────────────── */

/**
 * Create a decorative shape element.
 * Rectangles, circles, or accent shapes.
 */
export function createShapeElement(
  shapeType: 'rectangle' | 'circle' | 'line' | 'accent_bar',
  options?: Partial<DesignElement>
): DesignElement {
  const shapeDefaults: Record<string, Partial<DesignElementStyle>> = {
    rectangle: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 0 },
    circle:    { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 9999 },
    line:      { backgroundColor: '#C9A96E', borderRadius: 0 },
    accent_bar: { backgroundColor: '#E94560', borderRadius: 4 },
  };

  const dims: Record<string, { width: number; height: number }> = {
    rectangle:  { width: 40, height: 30 },
    circle:     { width: 20, height: 20 },
    line:       { width: 60, height: 0.5 },
    accent_bar: { width: 8,  height: 3 },
  };

  const d = dims[shapeType] || dims.rectangle;

  return baseElement(
    'shape',
    {
      x: 10,
      y: 10,
      width: d.width,
      height: d.height,
      zIndex: 3,
      props: { shapeType },
      style: {
        opacity: 1,
        ...(shapeDefaults[shapeType] || shapeDefaults.rectangle),
      },
    },
    options
  );
}
