// ============================================================================
// ZONO Property Radar™ — raw → normalized mapping (pure, client-safe).
// Maps a scraper's raw listing item into the radar's NormalizedListing shapes.
// Reuses the battle-tested key aliases from the External Listings importer so
// Yad2 / Madlan payload variations are handled. Crucially derives listingType
// (private / broker) — the signal the private-property alert depends on.
// ============================================================================
import type { ListingType, PropertyProviderName } from "../types";
import type { NormalizedListingDetails, NormalizedListingMetadata } from "./types";

type Raw = Record<string, unknown>;

function pick(raw: Raw, keys: string[]): unknown {
  for (const k of keys) if (raw[k] != null) return raw[k];
  return null;
}
function str(v: unknown): string | null {
  return v == null ? null : String(v);
}
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function boolOf(raw: Raw, keys: string[]): boolean | null {
  const v = pick(raw, keys);
  return typeof v === "boolean" ? v : null;
}

function imagesOf(raw: Raw): string[] {
  const v = pick(raw, ["images", "imageUrls", "image_urls", "photos"]);
  const list = Array.isArray(v)
    ? v.map((x) => (typeof x === "string" ? x : (x as { url?: string })?.url ?? "")).filter(Boolean)
    : [];
  if (list.length) return list as string[];
  const cover = str(pick(raw, ["coverImage", "mainImage", "thumbnail"]));
  return cover ? [cover] : [];
}

/** private | broker | unknown — from agent/advertiser signals. */
function listingTypeOf(raw: Raw): ListingType {
  const hasAgent = boolOf(raw, ["hasAgent", "isAgent", "isAgency"]);
  if (hasAgent === true) return "broker";
  if (hasAgent === false) return "private";
  const contactType = (str(pick(raw, ["contactType", "advertiserType"])) ?? "").toLowerCase();
  if (/agent|agency|broker|מתווך|תיווך/.test(contactType)) return "broker";
  if (/private|owner|פרטי|בעל/.test(contactType)) return "private";
  return "unknown";
}

function externalIdOf(raw: Raw): string {
  return String(pick(raw, ["id", "listingId", "adNumber", "token", "orderId"]) ?? "");
}

export function normalizeRawToMetadata(
  provider: PropertyProviderName,
  raw: Raw,
): NormalizedListingMetadata {
  const address = str(pick(raw, ["address", "fullAddress", "addressText"]));
  const description = str(pick(raw, ["listingDescription", "description", "text", "body"]));
  const title =
    str(pick(raw, ["title", "name", "headline", "listingTitle"])) ??
    address ??
    (description ? description.replace(/\s+/g, " ").trim().slice(0, 80) : null);
  const images = imagesOf(raw);

  return {
    provider,
    externalId: externalIdOf(raw),
    externalUrl: str(pick(raw, ["url", "link", "listingUrl", "adUrl"])),
    listingType: listingTypeOf(raw),
    title,
    city: str(pick(raw, ["city", "cityName", "locality", "area", "settlement"])),
    neighborhood: str(pick(raw, ["neighborhood", "neighbourhood", "neighborhoodName", "hood", "areaName", "quarter"])),
    street: str(pick(raw, ["street", "streetName", "addressStreet"])),
    addressText: address,
    propertyType: str(pick(raw, ["type", "propertyType", "category", "assetType"])),
    price: num(pick(raw, ["price", "askingPrice", "priceValue", "priceNis"])),
    rooms: num(pick(raw, ["rooms", "roomsCount", "numberOfRooms", "roomsNumber"])),
    floor: str(pick(raw, ["floor", "floorNumber"])),
    sizeSqm: num(pick(raw, ["sqm", "size", "squareMeters", "square_meters", "builtSqm", "houseSize", "areaSqm"])),
    imageUrl: images[0] ?? null,
    phone: str(pick(raw, ["phone", "contactPhone", "advertiserPhone"])),
    contactName: str(pick(raw, ["contactName", "advertiserName", "agentName"])),
    publishedAt: str(pick(raw, ["publishedAt", "date", "createdAt", "listedAt", "uploadDate"])),
    providerUpdatedAt: str(pick(raw, ["updatedAt", "scrapedAt", "fetchedAt"])),
    rawMetadata: raw,
  };
}

export function normalizeRawToDetails(
  provider: PropertyProviderName,
  raw: Raw,
): NormalizedListingDetails {
  const meta = normalizeRawToMetadata(provider, raw);
  return {
    ...meta,
    description: str(pick(raw, ["listingDescription", "description", "text", "body"])),
    images: imagesOf(raw),
    rawFullPayload: raw,
  };
}
