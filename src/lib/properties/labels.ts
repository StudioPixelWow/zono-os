/**
 * Shared label / option maps for the Properties module (client + server safe —
 * no server imports).
 */
import type { BadgeTone } from "@/components/ui/Badge";
import type {
  Database,
  ListingKind,
  PropertyStatus,
  PropertyType,
} from "@/lib/supabase/types";

export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];

interface PropertyLocationShape {
  address?: string;
  neighborhood?: string;
  city?: string;
  region?: string;
}

export function propertyLocation(row: PropertyRow): PropertyLocationShape {
  return (row.location ?? {}) as PropertyLocationShape;
}

/** Best available address line for a property. */
export function propertyAddressLine(row: PropertyRow): string {
  const loc = propertyLocation(row);
  return loc.address ?? loc.neighborhood ?? row.city ?? loc.city ?? "—";
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: "דירה",
  garden_apartment: "דירת גן",
  penthouse: "פנטהאוז",
  duplex: "דופלקס",
  private_house: "בית פרטי",
  cottage: "קוטג׳",
  studio: "סטודיו",
  commercial: "נכס מסחרי",
  office: "משרד",
  land: "מגרש",
  other: "אחר",
};

export const PROPERTY_TYPE_OPTIONS = (
  Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]
).map((value) => ({ value, label: PROPERTY_TYPE_LABELS[value] }));

export const LISTING_KIND_LABELS: Record<ListingKind, string> = {
  sale: "מכירה",
  rent: "השכרה",
};

export const LISTING_KIND_OPTIONS = (
  Object.keys(LISTING_KIND_LABELS) as ListingKind[]
).map((value) => ({ value, label: LISTING_KIND_LABELS[value] }));

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  draft: "טיוטה",
  active: "פעיל",
  under_offer: "בהצעה",
  in_contract: "בחוזה",
  sold: "נמכר",
  rented: "הושכר",
  withdrawn: "הוסר",
  archived: "בארכיון",
};

export const PROPERTY_STATUS_TONES: Record<PropertyStatus, BadgeTone> = {
  draft: "neutral",
  active: "success",
  under_offer: "warning",
  in_contract: "accent",
  sold: "brand",
  rented: "brand",
  withdrawn: "neutral",
  archived: "neutral",
};

/** Statuses an agent can set from the UI (archived handled via "archive"). */
export const PROPERTY_STATUS_OPTIONS = (
  Object.keys(PROPERTY_STATUS_LABELS) as PropertyStatus[]
)
  .filter((s) => s !== "archived")
  .map((value) => ({ value, label: PROPERTY_STATUS_LABELS[value] }));

export const ISRAELI_REGION_LABELS: Record<string, string> = {
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

export function propertyTypeLabel(type: PropertyType): string {
  return PROPERTY_TYPE_LABELS[type] ?? "נכס";
}

export function buildPropertyTypeLabel(
  type: PropertyType,
  rooms: number | null,
): string {
  const base = propertyTypeLabel(type);
  const r = rooms == null ? 0 : Number(rooms);
  return r > 0 ? `${base} ${r} חדרים` : base;
}
