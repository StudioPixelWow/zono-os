// ============================================================================
// ZONO Property Radar™ — normalization QA (pure, deterministic, never throws).
// Measures how clean a normalized listing is and returns a 0–100 quality score
// plus the cleaned values (deduped/validated images, normalized phone). The
// score drives admin alerts + the degraded-provider flag downstream.
// ============================================================================
import { normalizePhoneForWhatsapp } from "../utils";
import type {
  NormalizationIssue,
  NormalizationQAResult,
  NormalizedListingDetails,
  NormalizedListingMetadata,
} from "./types";

// Fields counted toward "completeness" (presence + validity).
const COMPLETENESS_FIELDS = ["city", "neighborhood", "street", "price", "rooms", "sizeSqm", "floor", "imageUrl", "phone", "publishedAt"];

function isFiniteNum(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}
function dateParses(v: unknown): boolean {
  if (v == null) return true; // absent is fine
  return Number.isFinite(Date.parse(String(v)));
}
function isValidUrl(u: string): boolean {
  if (typeof u !== "string") return false;
  const s = u.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  try { new URL(s); return true; } catch { return false; }
}

/** Dedup (case-insensitive) + drop invalid URLs. Returns cleaned + counts. */
function cleanImages(images: string[]): { images: string[]; duplicatesRemoved: number; invalidRemoved: number } {
  const seen = new Set<string>();
  const out: string[] = [];
  let duplicatesRemoved = 0;
  let invalidRemoved = 0;
  for (const raw of images) {
    const s = (raw ?? "").trim();
    if (!isValidUrl(s)) { if (s) invalidRemoved++; continue; }
    const key = s.toLowerCase();
    if (seen.has(key)) { duplicatesRemoved++; continue; }
    seen.add(key);
    out.push(s);
  }
  return { images: out, duplicatesRemoved, invalidRemoved };
}

function rawImages(listing: NormalizedListingMetadata | NormalizedListingDetails): string[] {
  const det = listing as NormalizedListingDetails;
  if (Array.isArray(det.images) && det.images.length) return det.images;
  return listing.imageUrl ? [listing.imageUrl] : [];
}

/**
 * 0–100 normalization quality + cleaned values. Penalties are additive and
 * clamped; everything is best-effort so a messy provider never crashes the sync.
 */
export function runNormalizationQA(
  listing: NormalizedListingMetadata | NormalizedListingDetails,
): NormalizationQAResult {
  const issues: NormalizationIssue[] = [];
  const add = (code: string, message: string, penalty: number, severity: NormalizationIssue["severity"]) =>
    issues.push({ code, message, penalty, severity });

  // Numeric integrity (only when a value was provided but isn't a finite number).
  if (listing.price != null && !isFiniteNum(listing.price)) add("price_not_numeric", "מחיר אינו מספרי", 15, "high");
  if (listing.rooms != null && !isFiniteNum(listing.rooms)) add("rooms_not_numeric", "מספר חדרים אינו מספרי", 8, "medium");
  if (listing.sizeSqm != null && !isFiniteNum(listing.sizeSqm)) add("sqm_not_numeric", "שטח אינו מספרי", 5, "low");

  // Dates parse.
  if (!dateParses(listing.publishedAt)) add("published_unparseable", "תאריך פרסום לא תקין", 5, "low");
  if (!dateParses(listing.providerUpdatedAt)) add("updated_unparseable", "תאריך עדכון לא תקין", 5, "low");

  // Listing type resolved.
  const listingTypeResolved = !!listing.listingType && listing.listingType !== "unknown";
  if (!listingTypeResolved) add("listing_type_unresolved", "סוג מודעה לא זוהה", 10, "medium");

  // City.
  if (!listing.city || !String(listing.city).trim()) add("city_missing", "עיר חסרה", 20, "high");

  // Phone — missing vs un-normalizable.
  const normalizedPhone = normalizePhoneForWhatsapp(listing.phone);
  if (!listing.phone || !String(listing.phone).trim()) add("phone_missing", "אין מספר טלפון", 10, "medium");
  else if (!normalizedPhone) add("phone_invalid", "מספר טלפון לא תקין", 8, "medium");

  // Images — dedup + invalid removal.
  const imgs = cleanImages(rawImages(listing));
  if (imgs.duplicatesRemoved > 0) add("duplicate_images", `הוסרו ${imgs.duplicatesRemoved} תמונות כפולות`, 3, "low");
  if (imgs.invalidRemoved > 0) add("invalid_images", `הוסרו ${imgs.invalidRemoved} כתובות תמונה לא תקינות`, 3, "low");
  if (imgs.images.length === 0) add("no_images", "אין תמונות", 6, "low");

  const totalPenalty = issues.reduce((a, i) => a + i.penalty, 0);
  const qualityScore = Math.max(0, Math.min(100, 100 - totalPenalty));

  // Completeness — share of tracked fields present + valid.
  let present = 0;
  const asRecord = listing as unknown as Record<string, unknown>;
  for (const f of COMPLETENESS_FIELDS) {
    const v = asRecord[f];
    if (v != null && String(v).trim() !== "") present++;
  }
  const fieldsCompleteness = Math.round((present / COMPLETENESS_FIELDS.length) * 100);

  return {
    qualityScore,
    issues,
    cleaned: { images: imgs.images, normalizedPhone, listingTypeResolved },
    fieldsCompleteness,
  };
}
