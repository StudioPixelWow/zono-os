// ============================================================================
// ZONO — Property CHANGE policy (pure, deterministic, no LLM, no IO). Slice 4.
// The single brain that decides whether a property change is MEANINGFUL enough to
// justify a customer message, and what the (server-derived) delta is. Constants
// live ONLY here so the threshold is auditable and testable in one place. A price
// INCREASE is never marketing (returns not-meaningful). Marketability + back-on-
// market transitions are also encoded here so every caller agrees on the rules.
// ============================================================================

// ── Meaningful price-drop thresholds (launch policy) ─────────────────────────
// Notify when the drop is at least this % OR at least this absolute ₪ amount.
export const MIN_DROP_PCT = 2;        // percent
export const MIN_DROP_ABS = 25_000;   // ₪

export type PriceDirection = "down" | "up" | "none";

export interface PriceDelta {
  oldPrice: number;
  newPrice: number;
  absoluteChange: number;    // signed: negative when price went down
  dropAmount: number;        // positive magnitude of a drop (0 when not a drop)
  percentageChange: number;  // signed, 1 decimal
  dropPercent: number;       // positive magnitude of a drop % (0 when not a drop)
  direction: PriceDirection;
}

/** Server-derived delta between two prices. Never trusts a browser-supplied delta. */
export function computePriceDelta(oldPrice: number | null | undefined, newPrice: number | null | undefined): PriceDelta | null {
  const o = Number(oldPrice), n = Number(newPrice);
  if (!Number.isFinite(o) || !Number.isFinite(n) || o <= 0 || n < 0) return null;
  const absoluteChange = n - o;
  const direction: PriceDirection = n < o ? "down" : n > o ? "up" : "none";
  const percentageChange = Math.round((absoluteChange / o) * 1000) / 10;
  const dropAmount = direction === "down" ? o - n : 0;
  const dropPercent = direction === "down" ? Math.round((dropAmount / o) * 1000) / 10 : 0;
  return { oldPrice: o, newPrice: n, absoluteChange, dropAmount, percentageChange, dropPercent, direction };
}

/** A drop is MEANINGFUL when it clears either threshold. Increases are never meaningful. */
export function isMeaningfulDrop(oldPrice: number | null | undefined, newPrice: number | null | undefined): boolean {
  const d = computePriceDelta(oldPrice, newPrice);
  if (!d || d.direction !== "down") return false;
  return d.dropPercent >= MIN_DROP_PCT || d.dropAmount >= MIN_DROP_ABS;
}

// ── Marketability (property status model) ────────────────────────────────────
// Marketable = we may proactively market the property to customers.
export const MARKETABLE_STATUSES = new Set(["active", "published", "ready"]);
// Unavailable = future customer marketing for this property must fail closed.
export const UNAVAILABLE_STATUSES = new Set(["sold", "rented", "withdrawn", "archived"]);

export function isMarketableStatus(status: unknown): boolean {
  return typeof status === "string" && MARKETABLE_STATUSES.has(status);
}
export function isUnavailableStatus(status: unknown): boolean {
  return typeof status === "string" && UNAVAILABLE_STATUSES.has(status);
}

/** Back-on-market = an unavailable property returning to a marketable status. */
export function isBackOnMarketTransition(oldStatus: unknown, newStatus: unknown): boolean {
  return isUnavailableStatus(oldStatus) && isMarketableStatus(newStatus);
}

// ── Hebrew ₪ formatting (shared) ─────────────────────────────────────────────
export function formatIls(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const v = Number(n);
  return v >= 1_000_000 ? `₪${(v / 1_000_000).toFixed(2)}M` : `₪${Math.round(v).toLocaleString("he-IL")}`;
}
