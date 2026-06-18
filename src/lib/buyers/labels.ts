/**
 * Shared label / option maps for the Buyers module (client + server safe).
 */
import type { BadgeTone } from "@/components/ui/Badge";
import type {
  BuyerTemperature,
  Database,
  LeadSource,
  Region,
} from "@/lib/supabase/types";
import { PROPERTY_TYPE_LABELS } from "@/lib/properties/labels";
import type { BuyerDealKind, BuyerPreferences } from "./types";

export type BuyerRow = Database["public"]["Tables"]["buyers"]["Row"];

// ── Temperature = buyer status ───────────────────────────────────────────────
export const TEMPERATURE_LABELS: Record<BuyerTemperature, string> = {
  hot: "חם",
  warm: "פושר",
  cold: "קר",
};
export const TEMPERATURE_TONES: Record<BuyerTemperature, BadgeTone> = {
  hot: "danger",
  warm: "warning",
  cold: "accent",
};
export const TEMPERATURE_OPTIONS = (
  Object.keys(TEMPERATURE_LABELS) as BuyerTemperature[]
).map((value) => ({ value, label: TEMPERATURE_LABELS[value] }));

// ── Source (reuses lead_source enum) ─────────────────────────────────────────
export const SOURCE_LABELS: Record<LeadSource, string> = {
  yad2: "יד2",
  madlan: "מדלן",
  facebook: "פייסבוק",
  instagram: "אינסטגרם",
  website: "אתר",
  referral: "הפניה",
  sign_call: "שלט",
  open_house: "בית פתוח",
  cold_outreach: "פנייה קרה",
  portal: "פורטל",
  partner: "שותף",
  other: "אחר",
};
export const SOURCE_OPTIONS = (Object.keys(SOURCE_LABELS) as LeadSource[]).map(
  (value) => ({ value, label: SOURCE_LABELS[value] }),
);

// ── Deal kind ────────────────────────────────────────────────────────────────
export const DEAL_KIND_LABELS: Record<BuyerDealKind, string> = {
  sale: "קנייה",
  rent: "שכירות",
};
export const DEAL_KIND_OPTIONS = (
  Object.keys(DEAL_KIND_LABELS) as BuyerDealKind[]
).map((value) => ({ value, label: DEAL_KIND_LABELS[value] }));

// ── Region (for display) ─────────────────────────────────────────────────────
export const REGION_LABELS: Record<Region, string> = {
  north: "צפון",
  haifa: "חיפה",
  sharon: "שרון",
  center: "מרכז",
  tel_aviv: "תל אביב",
  jerusalem: "ירושלים",
  shfela: "שפלה",
  south: "דרום",
  west_bank: "יו״ש",
  eilat: "אילת",
};

export { PROPERTY_TYPE_LABELS };

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat("he-IL");

export function buyerBudgetLine(b: BuyerRow): string {
  const lo = b.budget_min;
  const hi = b.budget_max;
  if (lo == null && hi == null) return "—";
  if (lo != null && hi != null) return `₪${fmt.format(lo)} – ₪${fmt.format(hi)}`;
  if (hi != null) return `עד ₪${fmt.format(hi)}`;
  return `מ-₪${fmt.format(lo as number)}`;
}

export function buyerRoomsLine(b: BuyerRow): string {
  const lo = b.rooms_min;
  const hi = b.rooms_max;
  if (lo == null && hi == null) return "—";
  if (lo != null && hi != null) return `${lo}–${hi} חד׳`;
  if (hi != null) return `עד ${hi} חד׳`;
  return `${lo}+ חד׳`;
}

export function buyerPreferences(b: BuyerRow): BuyerPreferences {
  return (b.preferences ?? {}) as BuyerPreferences;
}

/** A buyer has "no preferences" if budget, types and areas are all empty. */
export function buyerMissingPreferences(b: BuyerRow): boolean {
  return (
    b.budget_min == null &&
    b.budget_max == null &&
    b.preferred_types.length === 0 &&
    b.preferred_areas.length === 0
  );
}
