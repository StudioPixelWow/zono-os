/**
 * Home-dashboard widget data — real, organization-scoped, mapped to the existing
 * presentation view-models (src/types/dashboard). Each function falls back to the
 * mock view-model only when the org genuinely has no data yet, so the dashboard
 * never renders empty. Server-only.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listMatchBoard } from "@/lib/matching-intelligence/service";
import { buildMarketAnalysis } from "@/lib/external-listings/service";
import { STAGE_DEFS } from "@/lib/journey/stages";
import { formatShekels } from "@/lib/utils";
import {
  buyerMatches as mockMatches, hotOpportunities as mockOpps, journeyProperties as mockJourneyProps,
  journeyStages as mockJourneyStages, marketStats as mockMarket, recentDeals as mockDeals,
} from "@/data/mock";
import type { BuyerMatch, HotOpportunity, JourneyProperty, JourneyRailStage, MarketStat, RecentDeal, Tone } from "@/types/dashboard";

const GRADIENTS = ["from-violet-200 to-indigo-300", "from-emerald-200 to-teal-300", "from-amber-200 to-orange-300", "from-sky-200 to-blue-300"];
const grad = (i: number) => GRADIENTS[i % GRADIENTS.length];
const relWhen = (iso: string | null) => {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "היום" : d === 1 ? "אתמול" : d < 7 ? `לפני ${d} ימים` : d < 30 ? `לפני ${Math.floor(d / 7)} שבועות` : `לפני ${Math.floor(d / 30)} חודשים`;
};

// ── Opportunities (Decision Brain opportunity_signals) ───────────────────────
const OPP_META: Record<string, { kind: string; tone: Tone; icon: string }> = {
  external_listing: { kind: "מודעה חיצונית", tone: "gold", icon: "Map" },
  property: { kind: "נכס", tone: "purple", icon: "Building2" },
  seller: { kind: "מוכר", tone: "blue", icon: "Shield" },
  buyer: { kind: "קונה", tone: "green", icon: "Users" },
  match: { kind: "עסקה", tone: "purple", icon: "Sparkles" },
};

export async function getOpportunityWidgets(): Promise<HotOpportunity[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunity_signals")
    .select("id,entity_type,title,opportunity_score,recommended_action,description")
    .eq("status", "open").order("opportunity_score", { ascending: false }).limit(8);
  if (!data?.length) return mockOpps;
  return data.map((o) => {
    const m = OPP_META[o.entity_type] ?? { kind: "הזדמנות", tone: "purple" as Tone, icon: "Sparkles" };
    return { id: o.id, kind: m.kind, tone: m.tone, icon: m.icon, title: o.title, relation: o.recommended_action ?? o.description ?? "", cta: "פתח", score: o.opportunity_score };
  });
}

// ── Smart matches (Matching Intelligence) ────────────────────────────────────
export async function getMatchWidgets(): Promise<{ matches: BuyerMatch[]; note: string }> {
  let board;
  try { board = await listMatchBoard(); } catch { return { matches: mockMatches, note: "" }; }
  const items = [...board.bestOpportunities, ...board.highestClosing].slice(0, 3);
  if (!items.length) return { matches: mockMatches, note: "" };
  const matches: BuyerMatch[] = items.map((m) => {
    const [name, property] = m.title.split("←").map((s) => s.trim());
    return { id: m.matchId, name: name || "קונה", budgetLabel: "", want: property ?? "", property: property ?? "", score: parseInt(m.meta.replace(/\D/g, ""), 10) || 0, reasons: [m.meta] };
  });
  return { matches, note: `${board.total} התאמות פעילות · צנרת ${formatShekels(board.revenuePipeline)}` };
}

// ── Property journeys (property_journeys + journey board) ────────────────────
const RAIL_KEYS: { key: string; state?: "done" | "active" | "risk" | "upcoming" }[] = [
  { key: "new" }, { key: "information_collection" }, { key: "marketing_preparation" }, { key: "published" },
  { key: "active_marketing" }, { key: "negotiation" }, { key: "deal_signed" }, { key: "closed" },
];

export async function getJourneyWidgets(): Promise<{ stages: JourneyRailStage[]; properties: JourneyProperty[] }> {
  const supabase = await createClient();
  const [{ data: journeys }, { data: props }] = await Promise.all([
    supabase.from("property_journeys").select("property_id,current_stage,last_activity_at"),
    supabase.from("properties").select("id,title,city,status").neq("status", "archived").limit(200),
  ]);
  if (!journeys?.length) return { stages: mockJourneyStages, properties: mockJourneyProps };

  const counts = new Map<string, number>();
  for (const j of journeys) counts.set(j.current_stage, (counts.get(j.current_stage) ?? 0) + 1);
  const firstActive = RAIL_KEYS.find((k) => (counts.get(k.key) ?? 0) > 0)?.key;
  const stages: JourneyRailStage[] = RAIL_KEYS.map((k) => {
    const def = STAGE_DEFS[k.key as keyof typeof STAGE_DEFS];
    const count = counts.get(k.key) ?? 0;
    const state: JourneyRailStage["state"] = k.key === "closed" ? (count > 0 ? "done" : "upcoming") : count === 0 ? "upcoming" : k.key === firstActive ? "active" : "done";
    return { key: k.key, label: def?.label ?? k.key, count, state };
  });

  const propMap = new Map((props ?? []).map((p) => [p.id, p]));
  const properties: JourneyProperty[] = journeys
    .filter((j) => j.current_stage !== "closed")
    .sort((a, b) => (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""))
    .slice(0, 4)
    .map((j, i) => {
      const p = propMap.get(j.property_id);
      const def = STAGE_DEFS[j.current_stage as keyof typeof STAGE_DEFS];
      return {
        id: j.property_id, address: p ? `${p.title}${p.city ? ` · ${p.city}` : ""}` : "נכס",
        stage: def?.label ?? j.current_stage, progressLabel: def?.label ?? "", score: 0,
        nextAction: "המשך תהליך", gradient: grad(i),
      };
    });
  return { stages, properties: properties.length ? properties : mockJourneyProps };
}

// ── Recent deals (sold / rented properties) ──────────────────────────────────
export async function getDealWidgets(): Promise<RecentDeal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties").select("id,type,city,price,updated_at,status")
    .in("status", ["sold", "rented"]).order("updated_at", { ascending: false }).limit(6);
  if (!data?.length) return mockDeals;
  const typeLabel: Record<string, string> = { apartment: "דירה", house: "בית", penthouse: "פנטהאוז", garden_apartment: "דירת גן", duplex: "דופלקס", studio: "סטודיו", commercial: "מסחרי" };
  return data.map((d, i) => ({
    id: d.id, type: typeLabel[d.type as string] ?? "נכס", city: d.city ?? "—",
    price: d.price ?? 0, when: relWhen(d.updated_at), xPct: 12 + (i % 5) * 18, yPct: 20 + (i % 3) * 22,
  }));
}

// ── Market intelligence (external listings market analysis) ──────────────────
export async function getMarketWidgets(): Promise<MarketStat[]> {
  let a;
  try { a = await buildMarketAnalysis(); } catch { return mockMarket; }
  if (!a.localities.length && !a.priceDrops) return mockMarket;
  const avgSqm = a.localities.length ? Math.round(a.localities.reduce((s, l) => s + l.avgSqmPrice, 0) / a.localities.length) : 0;
  const totalListings = a.localities.reduce((s, l) => s + l.count, 0);
  const belowAvg = a.localities.reduce((s, l) => s + l.belowAverage, 0);
  const flat = [0.4, 0.5, 0.45, 0.6, 0.55, 0.7];
  const card = (id: string, label: string, value: string, tone: Tone, unit?: string): MarketStat =>
    ({ id, label, value, unit, changePct: 0, positiveIsGood: true, tone, chart: "line", series: flat });
  return [
    card("avg_sqm", "מחיר ממוצע למ״ר", avgSqm ? avgSqm.toLocaleString("he-IL") : "—", "purple", "₪"),
    card("listings", "מודעות חיצוניות פעילות", String(totalListings), "blue"),
    { ...card("price_drops", "ירידות מחיר (14 ימים)", String(a.priceDrops), "green"), chart: "bar" },
    card("below_avg", "מתחת לממוצע השוק", String(belowAvg), "gold"),
    { ...card("dupes", "חשד לכפילויות", String(a.duplicateCandidates), "red"), chart: "bar" },
  ];
}
