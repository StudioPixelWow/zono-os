// ============================================================================
// 📨 הצעות ומשא ומתן — Offers (server-paginated command center). Reads URL
// params, calls queryOffersBoard (bounded scope + name hydration + KPIs + status
// filter + search + sort + pagination) and ships ONLY ONE PAGE to the client
// OffersView. Every negotiation action stays end-to-end on real persisted data.
// ============================================================================
import { queryOffersBoard } from "@/lib/offers/board-query";
import { isOfferFilterKey, isOfferSortKey, type OfferFilterKey, type OfferSortKey, type OffersBoardPage } from "@/lib/offers/board";
import { OffersView } from "./OffersView";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const num = (v: string | undefined): number | null => { if (!v) return null; const n = Number(v); return Number.isNaN(n) ? null : n; };
const EMPTY: OffersBoardPage = { rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1, kpis: { open: 0, accepted: 0, awaitingSeller: 0, awaitingBuyer: 0 }, truncated: false };

export default async function OffersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const str = (k: string): string | undefined => { const v = sp[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };

  const params = {
    q: str("q"),
    filter: (isOfferFilterKey(str("filter")) ? str("filter") : "all") as OfferFilterKey,
    sort: (isOfferSortKey(str("sort")) ? str("sort") : "recent") as OfferSortKey,
    page: num(str("page")) ?? 1,
    pageSize: num(str("pageSize")) ?? 25,
  };

  let board = EMPTY;
  try { board = await queryOffersBoard(params); }
  catch (e) { console.error("[offers] board failed:", e); }

  return <OffersView board={board} lockBuyerId={str("buyerId") ?? null} lockPropertyId={str("propertyId") ?? null} />;
}
