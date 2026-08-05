/**
 * Design Schema — Output type configs, default styles, and constants
 *
 * Provides dimension configurations for each output type,
 * layout type labels in Hebrew, default font stacks (Hebrew-safe),
 * spacing presets, and default color palettes.
 *
 * Server-side only.
 */
import type { DesignOutputType, DesignLayoutType } from './types';

/* ── Output Type Dimensions ──────────────────────────────────────────── */

export const OUTPUT_TYPE_CONFIGS: Record<
  DesignOutputType,
  { width: number; height: number; label: string; labelHe: string }
> = {
  feed_post:      { width: 1080, height: 1350, label: 'Feed Post',       labelHe: 'פוסט פיד' },
  story:          { width: 1080, height: 1920, label: 'Story',           labelHe: 'סטורי' },
  carousel:       { width: 1080, height: 1350, label: 'Carousel',        labelHe: 'קרוסלה' },
  banner:         { width: 1200, height: 628,  label: 'Banner',          labelHe: 'באנר' },
  website_hero:   { width: 1920, height: 600,  label: 'Website Hero',    labelHe: 'הירו אתר' },
  google_display: { width: 300,  height: 250,  label: 'Google Display',  labelHe: 'גוגל דיספליי' },
  reel_cover:     { width: 1080, height: 1920, label: 'Reel Cover',      labelHe: 'כיסוי ריל' },
};

/* ── Layout Type Labels (Hebrew) ─────────────────────────────────────── */

export const LAYOUT_TYPE_LABELS: Record<DesignLayoutType, string> = {
  editorial:             'עריכתי',
  luxury:                'יוקרתי',
  minimal:               'מינימליסטי',
  sales:                 'מכירתי',
  corporate:             'קורפורטיבי',
  real_estate_premium:   'נדל"ן פרימיום',
  magazine:              'מגזין',
  modern_tech:           'טכנולוגי מודרני',
  split_layout:          'פיצול',
  hero_image:            'תמונה ראשית',
  offer_layout:          'הצעה',
};

/* ── Default Font Stacks (Hebrew-safe) ───────────────────────────────── */

export const DEFAULT_FONTS = {
  /** Primary headline font — bold, geometric */
  headline: "'Heebo', 'Assistant', 'Arial', sans-serif",
  /** Body text font — readable, clean */
  body: "'Assistant', 'Heebo', 'Arial', sans-serif",
  /** Accent / decorative — modern feel */
  accent: "'Rubik', 'Heebo', 'Arial', sans-serif",
  /** Monospace for numbers / data */
  mono: "'IBM Plex Sans Hebrew', 'Courier New', monospace",
} as const;

/** All Hebrew-safe fonts available in the system */
export const HEBREW_SAFE_FONTS = [
  'Heebo',
  'Assistant',
  'Rubik',
  'Noto Sans Hebrew',
  'Open Sans',
  'IBM Plex Sans Hebrew',
  'Secular One',
  'Varela Round',
  'Arial',
] as const;

/* ── Spacing Presets ─────────────────────────────────────────────────── */

export interface SpacingPreset {
  label: string;
  labelHe: string;
  paddingBase: number;     // px
  gapBetween: number;      // px
  marginOuter: number;     // percentage of canvas
  lineHeight: number;      // multiplier
}

export const SPACING_PRESETS: Record<'tight' | 'normal' | 'spacious', SpacingPreset> = {
  tight: {
    label: 'Tight',
    labelHe: 'צפוף',
    paddingBase: 8,
    gapBetween: 4,
    marginOuter: 3,
    lineHeight: 1.2,
  },
  normal: {
    label: 'Normal',
    labelHe: 'רגיל',
    paddingBase: 16,
    gapBetween: 12,
    marginOuter: 5,
    lineHeight: 1.4,
  },
  spacious: {
    label: 'Spacious',
    labelHe: 'מרווח',
    paddingBase: 24,
    gapBetween: 20,
    marginOuter: 8,
    lineHeight: 1.6,
  },
};

/* ── Default Color Palettes ──────────────────────────────────────────── */

export const DEFAULT_PALETTES = {
  /** Clean modern palette */
  modern: {
    primary: '#1A1A2E',
    secondary: '#16213E',
    accent: '#0F3460',
    highlight: '#E94560',
    background: '#FFFFFF',
    text: '#1A1A2E',
    textLight: '#6B7280',
  },
  /** Luxury / premium palette */
  luxury: {
    primary: '#1C1C1E',
    secondary: '#2C2C2E',
    accent: '#C9A96E',
    highlight: '#D4AF37',
    background: '#FAFAF8',
    text: '#1C1C1E',
    textLight: '#8E8E93',
  },
  /** Real estate warm palette */
  realEstate: {
    primary: '#2D3436',
    secondary: '#636E72',
    accent: '#00B894',
    highlight: '#FDCB6E',
    background: '#FFFFFF',
    text: '#2D3436',
    textLight: '#636E72',
  },
} as const;

/** Fallback background color when none is specified */
export const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';

/** Fallback text color */
export const DEFAULT_TEXT_COLOR = '#1A1A2E';

/** Design JSON version string */
export const DESIGN_JSON_VERSION = '1.0';
