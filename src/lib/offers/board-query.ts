// ============================================================================
// ZONO — Offers board · SERVER scope + hydrate + paginate (real data only).
// ----------------------------------------------------------------------------
// The old view showed each offer as a bare ₪amount + status — you couldn't tell
// which property or buyer it belonged to. This loads the org's offers (bounded),
// hydrates the property title + buyer/seller names in batched lookups, computes
// the KPIs over the full set, then applies the status filter + search (by name
// or amount) + sort + TRUE offset pagination SERVER-SIDE, shipping only one page
// to the client. All negotiation actions stay untouched. No mock data.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listOffers, type OfferSummary } from "./service";
import { OFFER_OPEN_STATUSES } from "./rules";
import type { HydratedOffer, OfferFilterKey, OfferSortKey, OffersBoardPage } from "./board";

const SCOPE_CAP = 300; // listOffers already caps at 300; keep the notice honest.

export interface OffersBoardParams {
  q?: string; filter?: OfferFilterKey | null; sort?: OfferSortKey; page?: number; pageSize?: number;
}

export async function queryOffersBoard(params: OffersBoardParams): Promise<OffersBoardPage> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("לא מחובר/ת");
  const orgId = profile.org_id;
  const supabase = await createClient();

  // 1) Bounded fetch (all statuses) — org-scoped via the service.
  const offers = await listOffers({ status: "all" });
  const truncated = offers.length >= SCOPE_CAP;

  // 2) KPIs over the full set (same definitions as the command center).
  const kpis = {
    open: offers.filter((o) => (OFFER_OPEN_STATUSES as readonly string[]).includes(o.status)).length,
    accepted: offers.filter((o) => o.status === "accepted").length,
    awaitingSeller: offers.filter((o) => o.status === "submitted" && o.current_responder === "seller").length,
    awaitingBuyer: offers.filter((o) => o.status === "countered" && o.current_responder === "buyer").length,
  };

  // 3) Batch-hydrate the names the cards need (property title, buyer, seller).
  const propIds = new Set<string>(), buyerIds = new Set<string>(), sellerIds = new Set<string>();
  for (const o of offers) { if (o.property_id) propIds.add(o.property_id); if (o.buyer_id) buyerIds.add(o.buyer_id); if (o.seller_id) sellerIds.add(o.seller_id); }
  const [propMap, buyerMap, sellerMap] = await Promise.all([
    hydrateNames(supabase, orgId, "properties", "title", propIds),
    hydrateNames(supabase, orgId, "buyers", "full_name", buyerIds),
    hydrateNames(supabase, orgId, "sellers", "full_name", sellerIds),
  ]);
  const hydrated: HydratedOffer[] = offers.map((o) => ({
    ...o,
    propertyTitle: o.property_id ? propMap.get(o.property_id) ?? null : null,
    buyerName: o.buyer_id ? buyerMap.get(o.buyer_id) ?? null : null,
    sellerName: o.seller_id ? sellerMap.get(o.seller_id) ?? null : null,
  }));

  // 4) Filter (status tab + search).
  const qRaw = (params.q ?? "").trim().toLowerCase();
  const qDigits = qRaw.replace(/\D/g, "");
  const filter = params.filter ?? "all";
  const filtered = hydrated.filter((o) => {
    if (!matchesFilter(filter, o)) return false;
    if (qRaw) {
      const hitName = (o.propertyTitle ?? "").toLowerCase().includes(qRaw) || (o.buyerName ?? "").toLowerCase().includes(qRaw) || (o.sellerName ?? "").toLowerCase().includes(qRaw);
      const hitAmount = qDigits.length > 0 && String(o.amount ?? "").includes(qDigits);
      if (!hitName && !hitAmount) return false;
    }
    return true;
  });

  // 5) Sort.
  const sort: OfferSortKey = params.sort ?? "recent";
  filtered.sort((a, b) => {
    switch (sort) {
      case "amount": return (b.amount ?? 0) - (a.amount ?? 0);
      case "expiry": return expiryRank(a) - expiryRank(b);
      case "recent":
      default: return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    }
  });

  // 6) Pagination.
  const total = filtered.length;
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 10), 100);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(params.page ?? 1, 1), pageCount);
  const rows = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  return { rows, total, page, pageSize, pageCount, kpis, truncated };
}

function matchesFilter(filter: OfferFilterKey, o: OfferSummary): boolean {
  switch (filter) {
    case "open": return (OFFER_OPEN_STATUSES as readonly string[]).includes(o.status);
    case "accepted": return o.status === "accepted";
    case "awaiting_seller": return o.status === "submitted" && o.current_responder === "seller";
    case "awaiting_buyer": return o.status === "countered" && o.current_responder === "buyer";
    case "all":
    default: return true;
  }
}

// Offers with a sooner expiry sort first; those without an expiry sort last.
function expiryRank(o: OfferSummary): number {
  if (!o.expires_at) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(o.expires_at);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

async function hydrateNames(
  supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, table: string, nameCol: string, ids: Set<string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.size) return map;
  try {
    const { data } = await supabase.from(table as never).select(`id,${nameCol}`).eq("org_id", orgId).in("id", Array.from(ids));
    for (const row of (data ?? []) as Record<string, string | null>[]) {
      if (row.id) map.set(row.id, (row[nameCol] as string) || "");
    }
  } catch { /* names best-effort */ }
  return map;
}
