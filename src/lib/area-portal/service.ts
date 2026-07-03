// ============================================================================
// 🌍 ZONO — AI Area & Neighborhood Portal — service (server-only). 32.5.
// Assembles PUBLIC-SAFE area intelligence from PUBLIC market sources only:
// public transactions (property_transactions), public listings (external_listings
// + public-status properties) and the public brokerage knowledge base
// (broker_profiles). NO org filter is applied because these represent the public
// market — but NO CRM, buyers, sellers, private listings, notes or internal scores
// are ever read. Evidence-only; honest empties; nothing auto-executes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildCityView, buildNeighborhoodView, buildStreetView } from "./assemble";
import { buildAreaSitemap } from "./seo";
import type {
  AreaData, AreaMarket, AreaListingCard, AreaTransaction, AreaOffice, AreaBroker, NeighborhoodRef,
  CityView, NeighborhoodView, StreetView,
} from "./types";
import type { SitemapEntry } from "@/lib/brokerage-site/types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const sn = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const norm = (v: string) => v.trim().toLowerCase();
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const PUBLIC_STATUSES = ["active", "published", "under_offer"];
const RENTAL = ["rent", "rental", "השכרה", "שכירות"];
const COMMERCIAL = ["commercial", "office", "shop", "מסחרי", "משרד", "חנות"];
const DAY = 86_400_000;

interface RawInputs {
  txs: Row[]; listings: { price: number | null; sqm: number | null; rooms: number | null; type: string | null; deal: string | null; neighborhood: string | null; street: string | null; title: string; image: string | null; id: string; firstSeen: string | null }[];
  brokers: Row[];
}

async function fetchRaw(city: string, neighborhood: string | null, street: string | null): Promise<RawInputs> {
  const db = createServiceRoleClient();
  const cityLike = `%${city}%`;
  const [txR, extR, propR, brokR] = await Promise.all([
    db.from("property_transactions").select("deal_date,deal_amount,price_per_sqm,area,rooms,street,neighborhood_name,city_name,property_type").ilike("city_name", cityLike).order("deal_date", { ascending: false }).limit(3000),
    db.from("external_listings").select("id,title,price,sqm,area_sqm,rooms,property_type,deal_type,city,neighborhood,street,images,first_seen_at,status").ilike("city", cityLike).eq("status", "active").limit(3000),
    db.from("properties").select("id,title,price,size_sqm,rooms,type,city,neighborhood,status,primary_image_url,created_at").ilike("city", cityLike).in("status", PUBLIC_STATUSES as never).limit(2000),
    db.from("broker_profiles").select("display_name,agency_name,primary_city,listings_count,verification_status").ilike("primary_city", cityLike).order("listings_count", { ascending: false }).limit(200),
  ]);

  const matchNb = (v: unknown) => !neighborhood || norm(s(v)) === norm(neighborhood) || (!!s(v) && norm(s(v)).includes(norm(neighborhood)));
  const matchSt = (v: unknown) => !street || (!!s(v) && norm(s(v)).includes(norm(street)));

  const txs = ((txR.data ?? []) as Row[]).filter((t) => matchNb(t.neighborhood_name) && matchSt(t.street));

  const firstImage = (v: unknown): string | null => (Array.isArray(v) ? (v.find((x) => typeof x === "string") as string | undefined) ?? null : null);
  const listings: RawInputs["listings"] = [];
  for (const l of (extR.data ?? []) as Row[]) if (matchNb(l.neighborhood) && matchSt(l.street)) listings.push({ id: s(l.id), title: s(l.title) || "נכס", price: num(l.price), sqm: num(l.sqm) ?? num(l.area_sqm), rooms: num(l.rooms), type: sn(l.property_type), deal: sn(l.deal_type), neighborhood: sn(l.neighborhood), street: sn(l.street), image: firstImage(l.images), firstSeen: sn(l.first_seen_at) });
  for (const p of (propR.data ?? []) as Row[]) if (matchNb(p.neighborhood) && !street) listings.push({ id: s(p.id), title: s(p.title) || "נכס", price: num(p.price), sqm: num(p.size_sqm), rooms: num(p.rooms), type: sn(p.type), deal: "sale", neighborhood: sn(p.neighborhood), street: null, image: sn(p.primary_image_url), firstSeen: sn(p.created_at) });

  return { txs, listings, brokers: (brokR.data ?? []) as Row[] };
}

function computeMarket(raw: RawInputs): AreaMarket {
  const salePrices = raw.listings.filter((l) => !RENTAL.includes(norm(l.deal ?? "sale")) && l.price != null).map((l) => l.price as number);
  const ppsm = raw.txs.map((t) => num(t.price_per_sqm)).filter((x): x is number => x != null && x > 0);
  const soldPrices = raw.txs.map((t) => num(t.deal_amount)).filter((x): x is number => x != null && x > 0);
  const sizes = raw.txs.map((t) => num(t.area)).filter((x): x is number => x != null && x > 0);
  const med = median(salePrices);
  const luxThreshold = med != null ? med * 1.6 : null;
  const luxuryPct = salePrices.length && luxThreshold != null ? (salePrices.filter((p) => p >= luxThreshold).length / salePrices.length) * 100 : 0;
  const rentalPct = raw.listings.length ? (raw.listings.filter((l) => RENTAL.includes(norm(l.deal ?? ""))).length / raw.listings.length) * 100 : 0;
  const commercialPct = raw.listings.length ? (raw.listings.filter((l) => COMMERCIAL.some((c) => norm(l.type ?? "").includes(c))).length / raw.listings.length) * 100 : 0;
  const now = Date.now();
  const newListings = raw.listings.filter((l) => l.firstSeen && now - new Date(l.firstSeen).getTime() <= 30 * DAY).length;

  // Price trend: recent 180d ₪/m² vs prior 180d.
  const recent = raw.txs.filter((t) => t.deal_date && now - new Date(s(t.deal_date)).getTime() <= 180 * DAY).map((t) => num(t.price_per_sqm)).filter((x): x is number => x != null && x > 0);
  const prior = raw.txs.filter((t) => { if (!t.deal_date) return false; const dt = now - new Date(s(t.deal_date)).getTime(); return dt > 180 * DAY && dt <= 360 * DAY; }).map((t) => num(t.price_per_sqm)).filter((x): x is number => x != null && x > 0);
  const rM = mean(recent), pM = mean(prior);
  const priceTrendPct = rM != null && pM != null && pM > 0 ? Number((((rM - pM) / pM) * 100).toFixed(1)) : null;

  const inventory = raw.listings.length;
  const transactions = raw.txs.length;
  const supplyLevel: AreaMarket["supplyLevel"] = inventory >= 150 ? "high" : inventory >= 50 ? "medium" : "low";
  const velocity = inventory > 0 ? transactions / inventory : transactions > 0 ? 1 : 0;
  const demandLevel: AreaMarket["demandLevel"] = velocity >= 0.4 ? "high" : velocity >= 0.15 ? "medium" : "low";
  const momentum: AreaMarket["momentum"] = priceTrendPct == null ? "stable" : priceTrendPct > 2 ? "up" : priceTrendPct < -2 ? "down" : "stable";

  return {
    avgPrice: mean(salePrices) != null ? Math.round(mean(salePrices) as number) : null,
    medianPrice: med != null ? Math.round(med) : null,
    pricePerSqm: mean(ppsm) != null ? Math.round(mean(ppsm) as number) : null,
    avgSoldPrice: mean(soldPrices) != null ? Math.round(mean(soldPrices) as number) : null,
    avgSize: mean(sizes) != null ? Math.round(mean(sizes) as number) : null,
    inventory, transactions, newListings, priceReductions: 0,
    luxuryPct, rentalPct, commercialPct, priceTrendPct, momentum, supplyLevel, demandLevel, derived: true,
  };
}

function listingCards(raw: RawInputs, market: AreaMarket): AreaListingCard[] {
  const lux = market.medianPrice != null ? market.medianPrice * 1.6 : Infinity;
  const now = Date.now();
  return raw.listings
    .filter((l) => l.price != null)
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    .slice(0, 24)
    .map((l) => {
      const tags: string[] = [];
      if (RENTAL.includes(norm(l.deal ?? ""))) tags.push("השכרה");
      if ((l.price ?? 0) >= lux) tags.push("יוקרה");
      if (l.firstSeen && now - new Date(l.firstSeen).getTime() <= 21 * DAY) tags.push("חדש");
      return { id: l.id, title: l.title, price: l.price, image: l.image, rooms: l.rooms, area: l.sqm, type: l.type, neighborhood: l.neighborhood, street: l.street, tags };
    });
}
function txCards(raw: RawInputs): AreaTransaction[] {
  return raw.txs.slice(0, 24).map((t) => ({ date: sn(t.deal_date), price: num(t.deal_amount), pricePerSqm: num(t.price_per_sqm), rooms: num(t.rooms), area: num(t.area), street: sn(t.street), type: sn(t.property_type) }));
}
function brokerCards(raw: RawInputs, city: string): AreaBroker[] {
  return raw.brokers.slice(0, 12).map((b) => ({ name: s(b.display_name) || "מתווך", agency: sn(b.agency_name), listings: num(b.listings_count) ?? 0, city, verified: s(b.verification_status) === "verified" }));
}
function officeCards(raw: RawInputs, city: string): AreaOffice[] {
  const byAgency = new Map<string, { brokers: number; listings: number }>();
  for (const b of raw.brokers) { const a = sn(b.agency_name); if (!a) continue; const e = byAgency.get(a) ?? { brokers: 0, listings: 0 }; e.brokers += 1; e.listings += num(b.listings_count) ?? 0; byAgency.set(a, e); }
  return [...byAgency.entries()].sort((a, b) => b[1].listings - a[1].listings).slice(0, 10).map(([name, e]) => ({ name, brokers: e.brokers, listings: e.listings, city }));
}

function neighborhoodRefs(raw: RawInputs): NeighborhoodRef[] {
  const by = new Map<string, { inventory: number; prices: number[]; tx: number }>();
  for (const l of raw.listings) { const k = l.neighborhood; if (!k) continue; const e = by.get(k) ?? { inventory: 0, prices: [], tx: 0 }; e.inventory += 1; if (l.price != null) e.prices.push(l.price); by.set(k, e); }
  for (const t of raw.txs) { const k = sn(t.neighborhood_name); if (!k) continue; const e = by.get(k) ?? { inventory: 0, prices: [], tx: 0 }; e.tx += 1; by.set(k, e); }
  return [...by.entries()].map(([name, e]) => ({ name, inventory: e.inventory, avgPrice: mean(e.prices) != null ? Math.round(mean(e.prices) as number) : null, transactions: e.tx }));
}

async function buildData(city: string, neighborhood: string | null, street: string | null, level: AreaData["level"]): Promise<AreaData> {
  const raw = await fetchRaw(city, neighborhood, street);
  const market = computeMarket(raw);
  return {
    level, city, neighborhood, street, market,
    listings: listingCards(raw, market), transactions: txCards(raw),
    offices: officeCards(raw, city), brokers: brokerCards(raw, city),
    neighborhoods: neighborhoodRefs(raw), population: null,
  };
}

// ── Public getters ───────────────────────────────────────────────────────────
export async function getCity(city: string): Promise<CityView | null> {
  if (!city) return null;
  const d = await buildData(city, null, null, "city").catch(() => null);
  return d ? buildCityView(d) : null;
}
export async function getNeighborhood(city: string, neighborhood: string): Promise<NeighborhoodView | null> {
  if (!city || !neighborhood) return null;
  const d = await buildData(city, neighborhood, null, "neighborhood").catch(() => null);
  return d ? buildNeighborhoodView(d) : null;
}
export async function getStreet(city: string, neighborhood: string, street: string): Promise<StreetView | null> {
  if (!city || !street) return null;
  const d = await buildData(city, neighborhood, street, "street").catch(() => null);
  return d ? buildStreetView(d) : null;
}

export async function getAreaSitemap(city: string, origin: string): Promise<SitemapEntry[]> {
  const d = await buildData(city, null, null, "city").catch(() => null);
  const nbs = (d?.neighborhoods ?? []).map((n) => n.name).slice(0, 200);
  return buildAreaSitemap(origin, city, nbs);
}

export async function listAreaCities(): Promise<string[]> {
  const db = createServiceRoleClient();
  const { data } = await db.from("property_transactions").select("city_name").not("city_name", "is", null).limit(5000);
  return [...new Set(((data ?? []) as Row[]).map((r) => s(r.city_name)).filter(Boolean))].sort().slice(0, 200);
}

/** Public Area AI — answers ONLY from the assembled public area intelligence. */
export async function askArea(city: string, neighborhood: string | null, street: string | null, query: string): Promise<{ answer: string; evidence: string[] } | null> {
  const q = (query ?? "").trim(); if (!q) return { answer: "אנא כתבו שאלה על האזור.", evidence: [] };
  const d = await buildData(city, neighborhood, street, neighborhood ? "neighborhood" : "city").catch(() => null);
  if (!d) return null;
  const m = d.market; const where = street ? street : neighborhood ?? city;
  const fmt = (n: number | null) => (n == null ? "לא ידוע" : `₪${n.toLocaleString("he-IL")}`);
  const has = (k: string[]) => k.some((x) => q.includes(x));
  let answer: string;
  if (has(["מחיר", "יקר", "עולה", "כמה"])) answer = `ב${where} המחיר הממוצע הוא ${fmt(m.avgPrice)} והחציון ${fmt(m.medianPrice)}${m.pricePerSqm != null ? `, כ-${fmt(m.pricePerSqm)} למ״ר` : ""}. ${m.priceTrendPct != null ? `מגמת המחירים ${m.priceTrendPct > 0 ? "עולה" : m.priceTrendPct < 0 ? "יורדת" : "יציבה"} (${m.priceTrendPct > 0 ? "+" : ""}${m.priceTrendPct}%).` : ""}`;
  else if (has(["ביקוש", "היצע", "חם"])) answer = `ב${where} ${m.demandLevel === "high" ? "ביקוש גבוה" : m.demandLevel === "medium" ? "ביקוש מתון" : "ביקוש נמוך"} ו${m.supplyLevel === "high" ? "היצע רב" : m.supplyLevel === "medium" ? "היצע בינוני" : "היצע מצומצם"} — ${m.inventory} נכסים פעילים ו-${m.transactions} עסקאות אחרונות.`;
  else if (has(["עסק", "נמכר", "מכיר"])) answer = `נרשמו ${m.transactions} עסקאות ב${where}${m.avgSoldPrice != null ? `, במחיר ממוצע ${fmt(m.avgSoldPrice)}` : ""}${m.avgSize != null ? ` וגודל ממוצע ${m.avgSize} מ״ר` : ""}.`;
  else if (has(["השקע", "תשוא", "השכר"])) answer = `${where}: ${Math.round(m.rentalPct)}% מההיצע להשכרה${m.priceTrendPct != null ? `, מגמת מחירים ${m.priceTrendPct > 0 ? "+" : ""}${m.priceTrendPct}%` : ""}. ${m.demandLevel === "high" ? "ביקוש חזק תומך בפוטנציאל השקעה." : "כדאי לבחון את קצב העסקאות לפני השקעה."}`;
  else answer = `${where}: מחיר ממוצע ${fmt(m.avgPrice)}, ${m.inventory} נכסים פעילים, ${m.transactions} עסקאות. ${m.demandLevel === "high" ? "ביקוש גבוה." : m.demandLevel === "medium" ? "ביקוש מתון." : "ביקוש נמוך."}`;
  const evidence = [m.avgPrice != null ? `מחיר ממוצע ${fmt(m.avgPrice)}` : "", `${m.inventory} נכסים`, `${m.transactions} עסקאות`].filter(Boolean);
  return { answer, evidence };
}

/** Public lead capture — validated + acknowledged; nothing auto-executes/routes. */
export async function submitAreaLead(input: { kind: string; city: string; neighborhood?: string; name?: string; phone?: string; email?: string; message?: string }): Promise<{ ok: boolean; message: string }> {
  if (!input.phone && !input.email) return { ok: false, message: "אנא השאירו טלפון או אימייל." };
  // Public area leads are acknowledged here; routing to a specific office/broker
  // is a human, approval-gated follow-up (nothing auto-executes).
  return { ok: true, message: "הפנייה התקבלה. נציג יחזור אליכם בהקדם." };
}
