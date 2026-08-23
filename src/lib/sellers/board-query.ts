// ============================================================================
// ZONO — Sellers board · SERVER scope + compute (real data only).
// ----------------------------------------------------------------------------
// Mirror of the buyers board: the sellers command center's aggregate panels
// (KPI strip, priority cockpit, AI churn/trust groups) summarize the whole org,
// so the insight set is computed here on the server over a BOUNDED, RLS-scoped
// fetch, folding in property counts, the intelligence board membership and the
// per-seller intelligence profiles — all soft-failing so the page always
// renders. The client workspace drives filter / sort / page / view / open state
// through the URL and paginates the table over this set. No mock data.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sellerPropertyCounts, type SellerRow } from "@/lib/sellers/repository";
import { listSellerBoard } from "@/lib/seller-intelligence/service";
import { sellerIntelligenceRepository } from "@/lib/seller-intelligence/repository";
import { sellerInsight, computeKpis, type SellerInsight, type SellerKpis, type IntelSets } from "@/lib/sellers/insights";
import type { SellerIntel } from "@/lib/sellers/insights";

const SCOPE_CAP = 1500;

export interface SellersBoard {
  insights: SellerInsight[]; // full, urgency-sorted — feeds every aggregate panel
  kpis: SellerKpis;
  cityOptions: string[];
  total: number;
  truncated: boolean;
}

export async function querySellersBoard(): Promise<SellersBoard> {
  const supabase = await createClient();

  // 1) Bounded, RLS-scoped fetch.
  const { data, error } = await supabase.from("sellers").select("*").order("updated_at", { ascending: false }).limit(SCOPE_CAP + 1);
  if (error) throw new Error(error.message);
  const rowsRaw = (data ?? []) as SellerRow[];
  const truncated = rowsRaw.length > SCOPE_CAP;
  const rows = truncated ? rowsRaw.slice(0, SCOPE_CAP) : rowsRaw;

  // 2) Property counts + intel board + per-seller profiles (all soft-fail).
  const counts: Record<string, number> = {};
  const profiles: Record<string, SellerIntel> = {};
  let sets: IntelSets | undefined;
  try {
    const [board, countMap, profileRows] = await Promise.all([
      listSellerBoard(),
      sellerPropertyCounts(),
      sellerIntelligenceRepository.listForOrg(),
    ]);
    for (const [id, n] of countMap) counts[id] = n;
    for (const p of profileRows) profiles[p.seller_id] = p;
    sets = {
      needingAttention: new Set(board.needingAttention.map((x) => x.sellerId)),
      highChurn: new Set(board.highChurn.map((x) => x.sellerId)),
      lowTrust: new Set(board.lowTrust.map((x) => x.sellerId)),
      noContact: new Set(board.noContact.map((x) => x.sellerId)),
      upcomingCommitments: new Set(board.upcomingCommitments.map((x) => x.sellerId)),
      trustChanges: new Set(board.trustChanges.map((x) => x.sellerId)),
    };
  } catch (e) { console.error("[sellers-board] intel failed:", e); }

  // 3) Compute insights (server-side), urgency-sorted — identical to before.
  const insights = rows
    .map((s) => sellerInsight(s, { propertyCount: counts[s.id] ?? 0, intel: profiles[s.id], sets }))
    .sort((a, b) => b.urgency - a.urgency);

  // 4) KPI totals + city options.
  const kpis = computeKpis(insights);
  const citySet = new Set<string>();
  for (const s of rows) if (s.city) citySet.add(s.city);
  const cityOptions = Array.from(citySet).sort((a, b) => a.localeCompare(b, "he"));

  return { insights, kpis, cityOptions, total: rows.length, truncated };
}
