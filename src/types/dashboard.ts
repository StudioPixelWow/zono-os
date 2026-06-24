/**
 * Presentation view-models for the ZONO home dashboard.
 * These are UI-shaped (label strings, tones) rather than raw domain records,
 * so screens stay decoupled from the eventual database schema.
 */

export type Tone = "purple" | "green" | "gold" | "red" | "blue";

/** A pin on the hero city map. */
export interface MapPin {
  id: string;
  label: string;
  count: number;
  tone: Tone;
  /** Position as % of the map box. */
  xPct: number;
  yPct: number;
}

/** A hot opportunity card in the strip. */
export interface HotOpportunity {
  id: string;
  kind: string; // "ירידת מחיר" וכו'
  tone: Tone;
  icon: string; // lucide icon name
  title: string;
  relation: string; // נכס/קונה קשור
  cta: string;
  score: number; // 0–100
  /** Destination for the card CTA. */
  href?: string;
}

/** Listing card label. */
export type ListingTag =
  | "נכס חדש"
  | "ירידת מחיר"
  | "עסקה חמה"
  | "התאמה גבוהה";

/** A recommended property card. */
export interface RecommendedProperty {
  id: string;
  tag: ListingTag;
  tagTone: Tone;
  type: string;
  street: string;
  city: string;
  price: number;
  rooms: number;
  sqm: number;
  floor: number;
  buyerMatches: number;
  score: number;
  /** Gradient classes for the image placeholder. */
  gradient: string;
  /** Real cover image URL when available (falls back to gradient). */
  imageUrl?: string | null;
  /** Destination for the card link. */
  href?: string;
}

/** A neighborhood region in the demand heatmap. */
export interface HeatNeighborhood {
  id: string;
  name: string;
  changePct: number;
  tone: Tone; // green=high, gold=stable, red=down, purple=opportunity
  label: string; // band label e.g. "פוטנציאל גבוה" / "ביקוש גבוה"
  /** Phase 25.1 — real opportunity score (0..100) + explainability reasons. */
  score?: number;
  reasons?: string[];
  /** SVG polygon points for the heatmap shape. */
  points: string;
  /** Label anchor inside the polygon. */
  labelX: number;
  labelY: number;
}

/** Stage of the property journey rail. */
export interface JourneyRailStage {
  key: string;
  label: string;
  count: number;
  state: "done" | "active" | "risk" | "upcoming";
}

/** A property mini-card placed along the journey. */
export interface JourneyProperty {
  id: string;
  address: string;
  stage: string;
  progressLabel: string;
  score: number;
  nextAction: string;
  gradient: string;
  imageUrl?: string | null;
  href?: string;
}

/** A buyer match preview card. */
export interface BuyerMatch {
  id: string;
  name: string;
  budgetLabel: string;
  want: string;
  property: string;
  score: number;
  reasons: string[];
  href?: string;
}

/** A recently closed deal. */
export interface RecentDeal {
  id: string;
  type: string;
  city: string;
  price: number;
  when: string;
  xPct: number;
  yPct: number;
  href?: string;
}

/** A market-intelligence stat with a sparkline. */
export interface MarketStat {
  id: string;
  label: string;
  value: string;
  unit?: string;
  changePct: number;
  positiveIsGood: boolean;
  tone: Tone;
  chart: "line" | "bar";
  /** Normalised 0–1 series for the mini chart. */
  series: number[];
}

/** A quick-action chip in the bottom AI command bar. */
export interface QuickAction {
  id: string;
  label: string;
  icon: string; // lucide icon name
}

/** A sidebar / bottom-nav item. */
export interface NavItem {
  id: string;
  label: string;
  icon: string; // lucide icon name
  active?: boolean;
}
