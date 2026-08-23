// ============================================================================
// ZONO — Buyers board · SERVER scope + compute (real data only).
// ----------------------------------------------------------------------------
// The buyers command center's aggregate panels (KPI strip, priority cockpit,
// AI opportunity groups) each summarize the WHOLE org — so the insight set is
// computed here, on the server, over a BOUNDED, RLS-scoped fetch, instead of
// shipping raw rows and recomputing in every browser. The client workspace then
// drives filter / sort / page / view / open state through the URL and paginates
// the table over this set. Intel membership + match counts are folded in exactly
// as before (soft-fail so the page always renders). No mock data.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listBuyerMatchCounts, type BuyerMatchCounts } from "@/lib/buyers/matches";
import { listBuyerIntelBoard } from "@/lib/buyer-intelligence/service";
import { buyerInsight, computeKpis, type BuyerInsight, type BuyerKpis, type IntelSets } from "@/lib/buyers/insights";
import type { BuyerRow } from "@/lib/buyers/labels";

/** Hard bound on the working set. Documented, not silent: `truncated` flags it. */
const SCOPE_CAP = 1500;

export interface BuyersBoard {
  insights: BuyerInsight[]; // full, urgency-sorted — feeds every aggregate panel
  kpis: BuyerKpis;
  cityOptions: string[];
  total: number;
  truncated: boolean;
}

export async function queryBuyersBoard(): Promise<BuyersBoard> {
  const supabase = await createClient();

  // 1) Bounded, RLS-scoped fetch (org isolation enforced by Postgres RLS).
  const { data, error } = await supabase.from("buyers").select("*").order("updated_at", { ascending: false }).limit(SCOPE_CAP + 1);
  if (error) throw new Error(error.message);
  const rowsRaw = (data ?? []) as BuyerRow[];
  const truncated = rowsRaw.length > SCOPE_CAP;
  const rows = truncated ? rowsRaw.slice(0, SCOPE_CAP) : rowsRaw;

  // 2) Intel membership + match counts (soft-fail — never block the board).
  let intel: IntelSets | undefined;
  try {
    const board = await listBuyerIntelBoard();
    intel = {
      needingAttention: new Set(board.needingAttention.map((i) => i.buyerId)),
      closeToPurchase: new Set(board.closeToPurchase.map((i) => i.buyerId)),
      financingRisks: new Set(board.financingRisks.map((i) => i.buyerId)),
      highEngagement: new Set(board.highEngagement.map((i) => i.buyerId)),
      noActivity: new Set(board.noActivity.map((i) => i.buyerId)),
    };
  } catch (e) { console.error("[buyers-board] intel failed:", e); }

  let matchCounts: BuyerMatchCounts = {};
  try { matchCounts = await listBuyerMatchCounts(); }
  catch (e) { console.error("[buyers-board] match counts failed:", e); }

  // 3) Compute insights (server-side), urgency-sorted — identical to before.
  const insights = rows
    .map((b) => buyerInsight(b, { matchCount: matchCounts[b.id] ?? null, intel }))
    .sort((a, b) => b.urgency - a.urgency);

  // 4) KPI totals + city options over the full set.
  const kpis = computeKpis(insights);
  const citySet = new Set<string>();
  for (const b of rows) for (const a of b.preferred_areas) citySet.add(a);
  const cityOptions = Array.from(citySet).sort((a, b) => a.localeCompare(b, "he"));

  return { insights, kpis, cityOptions, total: rows.length, truncated };
}
