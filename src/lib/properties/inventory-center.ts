// ============================================================================
// ZONO — Properties INVENTORY COMMAND CENTER · pure derivations (dependency-free,
// client-safe, unit-tested). Turns the already-loaded property rows into the
// command-center signals: honest KPIs, an evidence-gated ZONO brief (≤3), the
// per-property "needs attention" reason (real fields only), and the explorer's
// sort/paginate. No I/O, no new queries, nothing fabricated — every signal is a
// fact already on the row (missing image/price/details, draft, staleness).
// ============================================================================

/** Minimal structural view of a property row this module needs (PropertyRow
 *  satisfies it). Kept local so the module + its test stay dependency-free. */
export interface InvProp {
  id: string;
  status: string;
  price: number | null;
  monthly_rent: number | null;
  listing_kind: string | null;
  primary_image_url: string | null;
  rooms: number | null;
  size_sqm: number | null;
  updated_at: string | null;
  has_exclusivity?: boolean | null;
}

/** Statuses that are no longer actively marketed (excluded from "active"/attention). */
export const TERMINAL_STATUSES = new Set(["sold", "rented", "withdrawn", "archived"]);
export const isTerminal = (status: string): boolean => TERMINAL_STATUSES.has(status);
const isRent = (k: string | null): boolean => k === "rent" || k === "rental" || k === "lease";
const isDraft = (status: string): boolean => status === "draft";

export type AttentionKey = "no_image" | "no_price" | "unpublished" | "missing_details" | "stale";
export interface Attention { key: AttentionKey; reason: string; cta: string; href: string; tone: "warning" | "danger" | "neutral" }

export const STALE_DAYS = 14;
function daysSince(iso: string | null, nowMs: number): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

/** The SINGLE highest-priority real attention reason for a property, or null when
 *  nothing needs attention. Priority: image → price → unpublished → details → stale.
 *  `hasCover` = a resolved cover image exists (media cover OR primary_image_url). */
export function attentionFor(p: InvProp, hasCover: boolean, nowMs: number): Attention | null {
  if (isTerminal(p.status)) return null;
  if (!hasCover)
    return { key: "no_image", reason: "חסרה תמונה ראשית", cta: "הוסף תמונה", href: `/properties/${p.id}`, tone: "warning" };
  const priced = isRent(p.listing_kind) ? (p.monthly_rent ?? 0) > 0 : (p.price ?? 0) > 0;
  if (!priced)
    return { key: "no_price", reason: "חסר מחיר", cta: "הוסף מחיר", href: `/properties/${p.id}/edit`, tone: "danger" };
  if (isDraft(p.status))
    return { key: "unpublished", reason: "לא פורסם", cta: "פרסם עכשיו", href: `/properties/${p.id}`, tone: "warning" };
  if (p.rooms == null || p.size_sqm == null)
    return { key: "missing_details", reason: "חסרים פרטי נכס", cta: "השלם פרטים", href: `/properties/${p.id}/edit`, tone: "neutral" };
  const stale = daysSince(p.updated_at, nowMs);
  if (stale >= STALE_DAYS)
    return { key: "stale", reason: `לא עודכן ${stale} ימים`, cta: "בדוק אסטרטגיה", href: `/properties/${p.id}`, tone: "neutral" };
  return null;
}

export interface InvKpis { active: number; exclusive: number; forSale: number; forRent: number; needsAttention: number }

/** Real inventory KPIs. `hasCover(id)` reports a resolved cover for a property. */
export function inventoryKpis(rows: InvProp[], hasCover: (id: string) => boolean, nowMs: number): InvKpis {
  let active = 0, exclusive = 0, forSale = 0, forRent = 0, needsAttention = 0;
  for (const p of rows) {
    const terminal = isTerminal(p.status);
    if (!terminal) {
      active++;
      if (p.has_exclusivity) exclusive++;
      if (isRent(p.listing_kind)) forRent++; else forSale++;
      if (attentionFor(p, hasCover(p.id), nowMs)) needsAttention++;
    }
  }
  return { active, exclusive, forSale, forRent, needsAttention };
}

export interface BriefItem { key: AttentionKey; text: string; count: number; href: string }

/** Evidence-gated ZONO inventory brief — at most 3 observations, each backed by a
 *  real count (>0). Never renders an observation without evidence. */
export function inventoryBrief(rows: InvProp[], hasCover: (id: string) => boolean, nowMs: number): BriefItem[] {
  const counts: Record<AttentionKey, number> = { no_image: 0, no_price: 0, unpublished: 0, missing_details: 0, stale: 0 };
  for (const p of rows) {
    const a = attentionFor(p, hasCover(p.id), nowMs);
    if (a) counts[a.key]++;
  }
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const all: BriefItem[] = [
    { key: "no_image", count: counts.no_image, href: "/my-properties?attention=no_image", text: `${counts.no_image} ${plural(counts.no_image, "נכס ללא תמונה ראשית", "נכסים ללא תמונה ראשית")}` },
    { key: "no_price", count: counts.no_price, href: "/my-properties?attention=no_price", text: `${counts.no_price} ${plural(counts.no_price, "נכס ללא מחיר", "נכסים ללא מחיר")}` },
    { key: "unpublished", count: counts.unpublished, href: "/my-properties?attention=unpublished", text: `${counts.unpublished} ${plural(counts.unpublished, "טיוטה שלא פורסמה", "טיוטות שלא פורסמו")}` },
    { key: "stale", count: counts.stale, href: "/my-properties?attention=stale", text: `${counts.stale} ${plural(counts.stale, "נכס ללא עדכון אחרון", "נכסים ללא עדכון אחרון")}` },
    { key: "missing_details", count: counts.missing_details, href: "/my-properties?attention=missing_details", text: `${counts.missing_details} ${plural(counts.missing_details, "נכס עם פרטים חסרים", "נכסים עם פרטים חסרים")}` },
  ];
  return all.filter((b) => b.count > 0).slice(0, 3);
}

// ── Explorer sort + pagination (pure) ────────────────────────────────────────
export type SortKey = "recent" | "newest" | "price_desc" | "price_asc" | "attention";
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "עודכן לאחרונה" },
  { value: "newest", label: "נוסף לאחרונה" },
  { value: "price_desc", label: "מחיר: גבוה לנמוך" },
  { value: "price_asc", label: "מחיר: נמוך לגבוה" },
  { value: "attention", label: "דורשים טיפול" },
];
export const isSortKey = (s: unknown): s is SortKey =>
  typeof s === "string" && SORT_OPTIONS.some((o) => o.value === s);

const priceOf = (p: InvProp): number => (isRent(p.listing_kind) ? p.monthly_rent : p.price) ?? 0;
const ts = (iso: string | null): number => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : 0; };

export function sortRows<T extends InvProp & { created_at?: string | null }>(
  rows: T[], sort: SortKey, hasCover: (id: string) => boolean, nowMs: number,
): T[] {
  const out = [...rows];
  switch (sort) {
    case "price_desc": out.sort((a, b) => priceOf(b) - priceOf(a)); break;
    case "price_asc": out.sort((a, b) => priceOf(a) - priceOf(b)); break;
    case "newest": out.sort((a, b) => ts(b.created_at ?? null) - ts(a.created_at ?? null)); break;
    case "attention": out.sort((a, b) => (attentionFor(b, hasCover(b.id), nowMs) ? 1 : 0) - (attentionFor(a, hasCover(a.id), nowMs) ? 1 : 0) || ts(b.updated_at) - ts(a.updated_at)); break;
    case "recent":
    default: out.sort((a, b) => ts(b.updated_at) - ts(a.updated_at)); break;
  }
  return out;
}

export const PAGE_SIZE = 12;
/** Bounded slice — never renders the whole inventory at once. */
export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE): { items: T[]; page: number; pages: number; total: number } {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: rows.slice(0, p * size), page: p, pages, total }; // cumulative "load more"
}
