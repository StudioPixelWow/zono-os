// ============================================================================
// ZONO Property Radar™ — MockPropertyProvider.
// ----------------------------------------------------------------------------
// ⚠️  DEV / TEST ONLY. This provider returns FABRICATED listings so the sync
// engine, change-detection, scoring and alerts can be exercised locally WITHOUT
// spending credits and WITHOUT connecting to Yad2 / Madlan. The data here is NOT
// real market data and must NEVER be presented to users as such, nor seeded into
// production. Production code paths must use real providers only.
//
// Determinism: every field is derived from area.city + area.neighborhood via a
// stable string hash — same input always yields the exact same listings, so test
// assertions and change-detection are reproducible (no Math.random).
// ============================================================================
import type {
  NormalizedListingDetails,
  NormalizedListingMetadata,
  PropertyProvider,
  PropertyProviderScanOptions,
  PropertyProviderScanResult,
  PropertyRadarArea,
} from "./types";
import type { ListingType } from "../types";
import { ProviderListingNotFoundError } from "./errors";

// ── deterministic seeded helpers ─────────────────────────────────────────────
function seedFrom(...parts: (string | number)[]): number {
  const str = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random in [0,1) from a numeric seed (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

const STREETS = ["הרצל", "ויצמן", "בן גוריון", "ז'בוטינסקי", "אחד העם", "סוקולוב", "החשמונאים", "הנשיא"] as const;
const PROPERTY_TYPES = ["דירה", "דירת גן", "פנטהאוז", "דופלקס", "דירת גג"] as const;
const FIRST_NAMES = ["יוסי", "דנה", "אבי", "מיכל", "רון", "נועה", "איתי", "שירה"] as const;
const LAST_NAMES = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "דהן", "אזולאי"] as const;

const BROKER_AGENCIES = ["נדל״ן פלוס", "בית חכם", "אנגלו סכסון", "רי/מקס"] as const;

interface MockSpec {
  listingType: ListingType;
  titlePool: readonly string[];
  withImage: boolean;
  /** flips metadata slightly to simulate a "changed-like" listing. */
  changedLike?: boolean;
}

// 8 listings: 3 private, 2 broker, 1 project, 1 missing-image, 1 changed-like.
const SPECS: MockSpec[] = [
  { listingType: "private", titlePool: ["דירת 4 חדרים חדשה באזור מבוקש", "נכס פרטי חדש במחיר מעניין"], withImage: true },
  { listingType: "private", titlePool: ["דירת 3 חדרים משופצת מהיסוד", "דירה פרטית מוארת עם מרפסת שמש"], withImage: true },
  { listingType: "private", titlePool: ["פנטהאוז נדיר ליד הפארק", "דירת גג עם נוף פתוח"], withImage: true },
  { listingType: "broker", titlePool: ["דירת 5 חדרים בבלעדיות", "נכס מטופח באזור שקט"], withImage: true },
  { listingType: "broker", titlePool: ["דירת גן מרווחת עם חצר", "הזדמנות למשקיעים — תשואה גבוהה"], withImage: true },
  { listingType: "project", titlePool: ["פרויקט חדש בבנייה — כניסה 2027", "דירות יוקרה מקבלן"], withImage: true },
  { listingType: "private", titlePool: ["דירת 4 חדרים — ללא תמונה", "נכס פרטי חדש בשוק"], withImage: false },
  { listingType: "private", titlePool: ["דירת 3.5 חדרים — מחיר עודכן", "דירה פרטית — מוכר גמיש"], withImage: true, changedLike: true },
];

function buildListing(
  area: PropertyRadarArea,
  spec: MockSpec,
  index: number,
): NormalizedListingMetadata {
  const city = area.city;
  const neighborhood = area.neighborhood ?? null;
  const seed = seedFrom("zono-mock", city, neighborhood ?? "", index, spec.listingType);
  const r = rng(seed);

  const street = pick(STREETS, r());
  const houseNo = 1 + Math.floor(r() * 120);
  const propertyType = spec.listingType === "project" ? "דירה" : pick(PROPERTY_TYPES, r());
  const rooms = [3, 3.5, 4, 4.5, 5][Math.floor(r() * 5)];
  const sizeSqm = 60 + Math.floor(r() * 90);
  const floorNum = Math.floor(r() * 12);
  const ppsqm = 22000 + Math.floor(r() * 18000);
  const basePrice = Math.round((sizeSqm * ppsqm) / 10000) * 10000;
  // changedLike → nudge price/updatedAt so a re-scan would see a different hash.
  const price = spec.changedLike ? basePrice - 25000 : basePrice;
  const contactName = `${pick(FIRST_NAMES, r())} ${pick(LAST_NAMES, r())}`;
  const phone = `05${Math.floor(r() * 5)}-${String(1000000 + Math.floor(r() * 8999999)).slice(0, 7)}`;

  // Deterministic timestamps anchored to a fixed epoch (NOT Date.now → stable).
  const baseEpoch = Date.UTC(2026, 5, 1); // 2026-06-01
  const publishedAt = new Date(baseEpoch - index * 86400000).toISOString();
  const providerUpdatedAt = spec.changedLike
    ? new Date(baseEpoch + 86400000).toISOString()
    : publishedAt;

  const externalId = `mock-${seedFrom(city, neighborhood ?? "", index).toString(16)}`;
  const externalUrl = `https://example.invalid/mock/${externalId}`;
  const neighborhoodText = neighborhood ? `, ${neighborhood}` : "";
  const addressText = `${street} ${houseNo}, ${city}${neighborhoodText}`;
  const displayContact =
    spec.listingType === "broker" ? pick(BROKER_AGENCIES, r()) : contactName;

  return {
    provider: "mock",
    externalId,
    externalUrl,
    listingType: spec.listingType,
    title: pick(spec.titlePool, r()),
    city,
    neighborhood,
    street,
    addressText,
    propertyType,
    price,
    rooms,
    floor: String(floorNum),
    sizeSqm,
    imageUrl: spec.withImage
      ? `https://example.invalid/mock/img/${externalId}.jpg`
      : null,
    phone,
    contactName: displayContact,
    publishedAt,
    providerUpdatedAt,
    rawMetadata: {
      mock: true,
      changedLike: Boolean(spec.changedLike),
      pricePerSqm: ppsqm,
      sourceIndex: index,
    },
  };
}

export class MockPropertyProvider implements PropertyProvider {
  readonly providerName = "mock" as const;

  // Cheap list scan — deterministic metadata for the given area.
  async scanAreaMetadata(
    area: PropertyRadarArea,
    options?: PropertyProviderScanOptions,
  ): Promise<PropertyProviderScanResult> {
    void options;
    registerEmitted(area); // so fetchListingDetails can resolve these ids later
    // The mock behaves as a FULL-SCAN provider: it always returns the complete
    // current listing set for the area (deterministically). This lets the sync
    // engine's missing/deleted detection work correctly end-to-end. Real providers
    // may instead use the watermark options to early-stop pagination.
    const listings = SPECS.map((spec, i) => buildListing(area, spec, i));

    return {
      provider: "mock",
      area,
      listings,
      scannedPages: 1,
      creditsUsedEstimate: 0, // mock never costs credits
      stopReason: "empty",
      raw: { mock: true },
    };
  }

  // Expensive full fetch — rebuilds the full record for a known mock id.
  async fetchListingDetails(
    externalId: string,
    _externalUrl?: string | null,
  ): Promise<NormalizedListingDetails> {
    void _externalUrl;
    // The mock id hashes (city, neighborhood, index), so it can't be reversed on
    // its own. fetchListingDetails therefore resolves ids that this provider has
    // already emitted via scanAreaMetadata during the current process.
    const match = findListingByExternalId(externalId);
    if (!match) {
      throw new ProviderListingNotFoundError("mock", externalId);
    }

    const { area, spec, index } = match;
    const meta = buildListing(area, spec, index);
    return {
      ...meta,
      description:
        `${meta.title}. ${meta.propertyType} בת ${meta.rooms} חדרים, ${meta.sizeSqm} מ״ר, ` +
        `קומה ${meta.floor}, ב${meta.addressText}. נתוני הדגמה בלבד (mock).`,
      images: meta.imageUrl
        ? [meta.imageUrl, `https://example.invalid/mock/img/${externalId}-2.jpg`]
        : [],
      rawFullPayload: {
        mock: true,
        ...meta.rawMetadata,
        fetchedDetails: true,
      },
    };
  }
}

// ── id → (area, spec, index) reverse lookup ─────────────────────────────────
// The mock id is `mock-<hex of seedFrom(city, neighborhood, index)>`. Since the
// engine always fetches details for ids it just received from scanAreaMetadata,
// we keep a per-process registry populated on each scan so fetchListingDetails
// can resolve any id this provider has emitted in the current session.
interface MockListingRef {
  area: PropertyRadarArea;
  spec: MockSpec;
  index: number;
}
const EMITTED = new Map<string, MockListingRef>();

function registerEmitted(area: PropertyRadarArea): void {
  SPECS.forEach((spec, index) => {
    const externalId = `mock-${seedFrom(area.city, area.neighborhood ?? "", index).toString(16)}`;
    EMITTED.set(externalId, { area, spec, index });
  });
}

function findListingByExternalId(externalId: string): MockListingRef | null {
  return EMITTED.get(externalId) ?? null;
}
