// ============================================================================
// 🏘️ ZONO — Street & Building Intelligence — service (server-only). 34.1.
// Reads PUBLIC transaction activity (property_transactions — org-scoped) and runs
// the pure street/building intelligence. Feeds the EXISTING Seller Intelligence /
// Exclusive Acquisition engine with finer recruitment targets; adds no scoring
// engine and no tables. Read-only; nothing executes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildStreetBuildingIntel, type TxInput, type StreetBuildingIntelligence } from "./intel";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };

export async function getStreetBuildingIntelligence(city?: string): Promise<StreetBuildingIntelligence> {
  const db = await createClient();
  let q = db.from("property_transactions").select("city_name,street,street_number,gush,helka,address,normalized_address,deal_amount,price_per_sqm,deal_date,rooms,area,property_type").not("street", "is", null).order("deal_date", { ascending: false }).limit(6000);
  if (city) q = q.ilike("city_name", `%${city}%`);
  const { data } = await q;

  const txs: TxInput[] = ((data ?? []) as Row[]).map((r) => ({
    city: s(r.city_name), street: s(r.street), gush: s(r.gush), helka: s(r.helka),
    address: s(r.normalized_address) ?? s(r.address), price: num(r.deal_amount), ppsqm: num(r.price_per_sqm),
    date: s(r.deal_date), rooms: num(r.rooms), area: num(r.area),
  }));

  return buildStreetBuildingIntel(txs);
}
