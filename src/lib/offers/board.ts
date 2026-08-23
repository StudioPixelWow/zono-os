// ============================================================================
// ZONO — Offers board · PURE contract (no I/O, no server-only).
// Shared types + option lists for the offers command center, used by the server
// query (board-query.ts) and the client view (OffersView.tsx). Client-safe.
// ============================================================================
import type { OfferSummary } from "./service";

/** An offer summary hydrated with the human names it points at. */
export interface HydratedOffer extends OfferSummary {
  propertyTitle: string | null;
  buyerName: string | null;
  sellerName: string | null;
}

export type OfferFilterKey = "all" | "open" | "accepted" | "awaiting_seller" | "awaiting_buyer";
export type OfferSortKey = "recent" | "amount" | "expiry";

const FILTER_KEYS: readonly OfferFilterKey[] = ["all", "open", "accepted", "awaiting_seller", "awaiting_buyer"];
export const isOfferFilterKey = (v: string | undefined): v is OfferFilterKey => !!v && FILTER_KEYS.includes(v as OfferFilterKey);
const SORT_KEYS: readonly OfferSortKey[] = ["recent", "amount", "expiry"];
export const isOfferSortKey = (v: string | undefined): v is OfferSortKey => !!v && SORT_KEYS.includes(v as OfferSortKey);

export const OFFER_FILTER_TABS: { value: OfferFilterKey; label: string }[] = [
  { value: "all", label: "הכל" }, { value: "open", label: "פתוחות" },
  { value: "awaiting_seller", label: "ממתין למוכר" }, { value: "awaiting_buyer", label: "ממתין לקונה" }, { value: "accepted", label: "אושרו" },
];
export const OFFER_SORT_OPTIONS: { value: OfferSortKey; label: string }[] = [
  { value: "recent", label: "עודכנו לאחרונה" }, { value: "amount", label: "סכום (גבוה→נמוך)" }, { value: "expiry", label: "תוקף קרוב" },
];

export interface OffersBoardPage {
  rows: HydratedOffer[];
  total: number; page: number; pageSize: number; pageCount: number;
  kpis: { open: number; accepted: number; awaitingSeller: number; awaitingBuyer: number };
  truncated: boolean;
}
