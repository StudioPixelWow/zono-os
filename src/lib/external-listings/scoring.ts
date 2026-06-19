/**
 * External listing scoring — deterministic, client-safe (no server imports).
 * Quality sub-scores + an external opportunity score. A local minimal shape is
 * used so this module stays free of the server-only providers file.
 */

export interface ListingFields {
  externalId?: string | null;
  listingUrl?: string | null;
  title?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  price?: number | null;
  rooms?: number | null;
  sqm?: number | null;
  floor?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  hasAgent?: boolean | null;
  publishedAt?: string | null;
  images?: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface QualityScores {
  data_completeness_score: number;
  price_quality_score: number;
  location_quality_score: number;
  contact_quality_score: number;
  media_quality_score: number;
}

/** The fields whose presence we treat as a complete listing. */
const COMPLETENESS_KEYS: (keyof ListingFields)[] = [
  "title", "price", "rooms", "sqm", "city", "contactPhone", "listingUrl", "images",
];

export function qualityScores(l: ListingFields): QualityScores {
  const present = COMPLETENESS_KEYS.filter((k) => {
    const v = l[k];
    if (k === "images") return Array.isArray(v) && v.length > 0;
    return v != null && v !== "";
  }).length;
  const dataCompleteness = clamp((present / COMPLETENESS_KEYS.length) * 100);

  const priceQuality = l.price && l.price > 0 ? 100 : 0;

  let location = 0;
  if (l.city) location += 50;
  if (l.street) location += 30;
  else if (l.neighborhood) location += 20;
  if (l.floor != null) location += 10;
  const locationQuality = clamp(location);

  let contact = 0;
  if (l.contactPhone) contact += 70;
  if (l.contactName) contact += 30;
  const contactQuality = clamp(contact);

  const mediaQuality = clamp((l.images?.length ?? 0) * 25);

  return {
    data_completeness_score: dataCompleteness,
    price_quality_score: priceQuality,
    location_quality_score: locationQuality,
    contact_quality_score: contactQuality,
    media_quality_score: mediaQuality,
  };
}

/** Key fields that are missing — for the admin debug panel. */
export function missingFields(l: ListingFields): string[] {
  const labels: Record<string, string> = {
    external_id: "externalId", listing_url: "listingUrl", title: "title", city: "city",
    neighborhood: "neighborhood", street: "street", price: "price", rooms: "rooms",
    sqm: "sqm", floor: "floor", contact_name: "contactName", contact_phone: "contactPhone",
    published_at: "publishedAt", images: "images",
  };
  return Object.entries(labels)
    .filter(([, key]) => {
      const v = l[key as keyof ListingFields];
      if (key === "images") return !(Array.isArray(v) && v.length > 0);
      return v == null || v === "";
    })
    .map(([col]) => col);
}

export interface OpportunityInput {
  priceVsAreaAvg: number | null; // listing ₪/m² ÷ area avg ₪/m² (<1 = cheaper)
  completeness: number; // 0..100
  privateOwner: boolean;
  duplicateConfidence: number; // 0..100
  buyerFit: boolean;
  localityActive: boolean;
  daysSincePublished: number | null;
}

export function calculateExternalOpportunityScore(i: OpportunityInput): number {
  let s = 25;
  if (i.priceVsAreaAvg != null) {
    if (i.priceVsAreaAvg <= 0.85) s += 25;
    else if (i.priceVsAreaAvg <= 0.95) s += 15;
    else if (i.priceVsAreaAvg >= 1.15) s -= 10;
  }
  s += i.completeness * 0.15;
  if (i.privateOwner) s += 15;
  if (i.buyerFit) s += 20;
  if (i.localityActive) s += 8;
  if (i.daysSincePublished != null && i.daysSincePublished <= 7) s += 8;
  s -= Math.min(15, i.duplicateConfidence * 0.15); // duplicates are less valuable
  return clamp(s);
}
