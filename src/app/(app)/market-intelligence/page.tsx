// ============================================================================
// 🧭 מרכז מודיעין שוק — Market Intelligence COCKPIT (external market ONLY).
// ----------------------------------------------------------------------------
// The ONE filter state lives in the URL search params and drives the whole
// cockpit via the canonical getMarketCockpit selector (server-side aggregation,
// bounded — only a compact model reaches the client). Not CRM; the full feed,
// live map and dashboard remain one click away in the section nav.
// ============================================================================
import { getMarketCockpit } from "@/lib/market-intelligence/service";
import { MarketCockpitView } from "./MarketCockpitView";
import { MarketIntelNav } from "@/components/market-intelligence/MarketIntelNav";
import { PERIODS, type CockpitFilters, type Period } from "@/lib/market-intelligence/command-center";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null;
const posNum = (v: string | string[] | undefined): number | null => { const n = Number(one(v)); return Number.isFinite(n) && n > 0 ? n : null; };

function parseFilters(sp: SP): CockpitFilters {
  const periodRaw = Number(one(sp.period));
  const period = (PERIODS as readonly number[]).includes(periodRaw) ? (periodRaw as Period) : 30;
  const deal = one(sp.deal);
  return {
    city: one(sp.city), neighborhood: one(sp.nbhd), propertyType: one(sp.type),
    deal: deal === "sale" || deal === "rent" ? deal : null,
    roomsMin: posNum(sp.rooms), priceMin: posNum(sp.pmin), priceMax: posNum(sp.pmax), period,
  };
}

export default async function MarketIntelligencePage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = parseFilters(await searchParams);
  const data = await getMarketCockpit(filters);
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <MarketIntelNav active="center" />
      <MarketCockpitView data={data} />
    </div>
  );
}
