// ============================================================================
// ZONO — canonical PROPERTY TRANSACTION language (מכירה / השכרה).
// The single source of truth for (a) turning a raw sale/rent field into a
// broker-readable badge and (b) formatting a price WITH its rental period, so a
// broker never has to infer "₪4,300" means rent. Pure + framework-agnostic
// (client & server safe). Reuse this everywhere a property price/badge renders —
// do NOT re-derive sale/rent from price magnitude anywhere.
// ============================================================================

export type ListingKind = "sale" | "rent";

/** Canonical sale/rent from any raw field (properties.listing_kind, external_listings.deal_type, …). Never guesses from price. */
export function normalizeListingKind(raw: string | null | undefined): ListingKind | null {
  if (raw == null) return null;
  const v = String(raw).toLowerCase();
  if (v === "rent" || v === "rental" || v === "lease") return "rent";
  if (v === "sale" || v === "project_sale" || v === "sell" || v === "buy") return "sale";
  return null;
}

export interface TransactionBadge { kind: ListingKind; label: string; tone: "brand" | "success" }

/** Badge meta — restrained, semantic: מכירה = brand (purple), השכרה = success. Text is always present (never color-only). */
export function transactionBadge(kind: ListingKind | null): TransactionBadge | null {
  if (kind === "sale") return { kind, label: "מכירה", tone: "brand" };
  if (kind === "rent") return { kind, label: "השכרה", tone: "success" };
  return null;
}

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

export interface PropertyPriceInput {
  kind: ListingKind | null;
  /** Sale price (or, for external listings that carry only one price column, the listed amount). */
  price?: number | null;
  /** Preferred rent amount when the schema has a dedicated column (properties.monthly_rent). */
  monthlyRent?: number | null;
}

/**
 * Format a property price with unambiguous transaction context.
 *   sale → "₪2,890,000"
 *   rent → "₪4,300 לחודש"   (monthlyRent when present, else the single price column)
 * Returns "—" when there is no usable amount. Only "לחודש" is emitted because the
 * product currently models residential rent as monthly; extend here if the schema
 * later carries an explicit period.
 */
export function formatPropertyPrice({ kind, price, monthlyRent }: PropertyPriceInput): string {
  if (kind === "rent") {
    const amount = monthlyRent != null && monthlyRent > 0 ? monthlyRent : price != null && price > 0 ? price : null;
    return amount != null ? `${ils(amount)} לחודש` : "—";
  }
  return price != null && price > 0 ? ils(price) : "—";
}
