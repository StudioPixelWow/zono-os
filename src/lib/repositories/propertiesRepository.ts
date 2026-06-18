/**
 * Properties repository — server-only data access for the Properties module.
 *
 * This is the first module wired to Supabase. Reads run through the
 * service-role client because authentication / org-context is not wired yet
 * (RLS would return zero rows to an anonymous caller). Once auth lands, swap
 * `createServiceRoleClient()` for the RLS-scoped `createClient()` server client
 * — the mapping and public API below stay the same.
 *
 * Never import this file from a Client Component.
 */
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import type { Database, PropertyType } from "@/lib/supabase/types";
import type { ListingTag, RecommendedProperty, Tone } from "@/types/dashboard";
import { recommendedProperties as mockProperties } from "@/data/mock";

type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];

export type PropertiesSource = "supabase" | "mock";

export interface DashboardPropertiesResult {
  properties: RecommendedProperty[];
  source: PropertiesSource;
}

/** Columns needed to build a RecommendedProperty card. */
const SELECT_COLUMNS =
  "id, type, listing_kind, status, price, rooms, size_sqm, floor, city, location, zono_score, has_exclusivity, listed_at, created_at";

const CARD_LIMIT = 8;

// Same gradient palette the mock cards use, cycled by index.
const GRADIENTS = [
  "from-violet-200 via-purple-100 to-indigo-200",
  "from-fuchsia-100 via-purple-100 to-violet-200",
  "from-amber-100 via-violet-100 to-purple-200",
  "from-emerald-100 via-violet-100 to-purple-200",
];

const TYPE_LABEL: Record<PropertyType, string> = {
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
  other: "נכס",
};

interface PropertyLocation {
  address?: string;
  neighborhood?: string;
  city?: string;
}

function formatRooms(rooms: number | null): number {
  return rooms == null ? 0 : Number(rooms);
}

function buildTypeLabel(type: PropertyType, rooms: number | null): string {
  const base = TYPE_LABEL[type] ?? "נכס";
  const r = formatRooms(rooms);
  if (r > 0) return `${base} ${r} חדרים`;
  return base;
}

/** Deterministic tag from listing signals (no matching/price-history yet). */
function deriveTag(row: PropertyRow): { tag: ListingTag; tagTone: Tone } {
  const score = row.zono_score ?? 0;
  if (score >= 90) return { tag: "עסקה חמה", tagTone: "gold" };
  if (score >= 80) return { tag: "התאמה גבוהה", tagTone: "green" };
  if (row.status === "under_offer") return { tag: "ירידת מחיר", tagTone: "red" };
  return { tag: "נכס חדש", tagTone: "purple" };
}

function mapRowToCard(row: PropertyRow, index: number): RecommendedProperty {
  const loc = (row.location ?? {}) as PropertyLocation;
  const { tag, tagTone } = deriveTag(row);
  return {
    id: row.id,
    tag,
    tagTone,
    type: buildTypeLabel(row.type, row.rooms),
    street: loc.address ?? loc.neighborhood ?? row.city ?? "",
    city: row.city ?? loc.city ?? "",
    price: row.price,
    rooms: formatRooms(row.rooms),
    sqm: row.size_sqm ?? 0,
    floor: row.floor ?? 0,
    // Buyer-match counts come from the matching module, which is intentionally
    // not wired in this phase — default to 0 until then.
    buyerMatches: 0,
    score: row.zono_score ?? 0,
    gradient: GRADIENTS[index % GRADIENTS.length],
  };
}

/**
 * Load properties for the dashboard "recommended" strip.
 *
 * - Not configured (no real Supabase env) → mock data, source "mock".
 * - Configured but table empty → mock data, source "mock" (fallback).
 * - Configured with rows → mapped Supabase data, source "supabase".
 * - Query failure → throws (caller renders an error state).
 */
export async function listDashboardProperties(): Promise<DashboardPropertiesResult> {
  if (!isServiceRoleConfigured()) {
    return { properties: mockProperties, source: "mock" };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("properties")
    .select(SELECT_COLUMNS)
    .not("status", "in", '("archived","withdrawn")')
    .order("zono_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(CARD_LIMIT);

  if (error) {
    throw new Error(`Failed to load properties: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { properties: mockProperties, source: "mock" };
  }

  return {
    properties: data.map((row, i) => mapRowToCard(row as PropertyRow, i)),
    source: "supabase",
  };
}
