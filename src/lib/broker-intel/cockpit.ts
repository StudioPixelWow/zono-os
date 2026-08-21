// ============================================================================
// ZONO — Broker Intelligence COCKPIT · pure derivations (no I/O, no deps).
// ----------------------------------------------------------------------------
// Turns the OBSERVED market evidence (external_listings broker-detection: the
// detected broker name/id per listing, + geography, property type, first-seen)
// into a market-intelligence model about WHO operates in the arena — never a
// phone book. It computes: the observed broker universe, a landscape ranked by
// OBSERVED INVENTORY (activity/presence — never "sales" or "performance", which
// aren't measured), concentration as a share of the OBSERVED inventory (never
// "market share" — coverage is partial), geographic + property-type
// specialization, competition density (listings per observed broker), a REAL
// "newly observed" signal from first-seen, evidence-gated ZONO observations (≤3),
// and a BOUNDED, paginated directory. Broker-name spelling variants are NOT
// merged (identity resolution is ENGINE_REQUIRED). Dependency-free → unit tested.
// ============================================================================

export interface BrokerListing {
  id: string;
  broker: string | null;          // detected_broker_name (raw)
  hasAgent: boolean | null;
  neighborhood: string | null;
  city: string | null;
  propertyType: string | null;
  price: number | null;
  firstSeenMs: number | null;
  lat: number | null;
  lng: number | null;
}
export interface BrokerFilters { city: string | null; search: string | null; period: 30 | 90; page: number }
export interface BrokerInput { listings: BrokerListing[]; filters: BrokerFilters; nowMs: number }

export interface BrokerAgg {
  name: string;
  observedInventory: number;
  areas: { name: string; count: number }[];
  propertyTypes: { type: string; count: number }[];
  newInPeriod: number;
  firstObservedMs: number | null;
  lastObservedMs: number | null;
  avgPrice: number | null;
  lat: number | null; lng: number | null;
  sampleListingIds: string[];
}
export interface BrokerKpi { key: string; label: string; value: number; unit: string; def: string }
export interface LandscapeRow { name: string; observedInventory: number; areas: string[]; propertyTypes: string[]; newInPeriod: number; pct: number }
export interface ConcentrationBand { name: string; observedInventory: number; sharePct: number }
export interface Concentration { top: ConcentrationBand[]; otherBrokers: number; otherInventory: number; privateInventory: number; totalObserved: number; topShareLabel: string }
export interface AreaCompetition { name: string; city: string | null; listings: number; brokers: number; listingsPerBroker: number; lat: number | null; lng: number | null }
export interface TypeSpecialization { type: string; brokers: { name: string; count: number }[] }
export interface BrokerInsight { id: string; kind: string; what: string; evidence: string; why: string; action: string | null; href: string | null }
export interface DirectoryRow { name: string; observedInventory: number; topArea: string | null; propertyTypes: number; verified: boolean; newInPeriod: number }
export interface Directory { rows: DirectoryRow[]; page: number; pageSize: number; total: number; totalPages: number }
export interface BrokerFacets { cities: string[] }

export interface BrokerCockpit {
  hasData: boolean;
  totalListings: number;
  filters: BrokerFilters;
  facets: BrokerFacets;
  kpis: BrokerKpi[];
  insights: BrokerInsight[];
  landscape: LandscapeRow[];
  concentration: Concentration;
  areas: AreaCompetition[];
  typeSpecialization: TypeSpecialization[];
  newlyObserved: { period: number; count: number; names: string[] };
  directory: Directory;
  dataQuality: { attributedPct: number; geocodedPct: number; possibleDuplicateNames: number; note: string };
  collaboration: { status: "engine_required"; reason: string };
  generatedAtMs: number;
}

const DAY = 86_400_000;
const LANDSCAPE_TOP = 8;
const CONCENTRATION_TOP = 6;
const AREA_TOP = 8;
const TYPE_TOP = 5;
const DIR_PAGE = 15;
const INSIGHT_MIN_AREA_LPB = 6;   // listings-per-broker to call an area "crowded"

/** Normalize a detected broker name for grouping — trims + collapses whitespace.
 *  It deliberately does NOT canonicalize spelling variants (RE/MAX vs REMAX):
 *  that is identity resolution (ENGINE_REQUIRED), never string-similarity here. */
export function normalizeBroker(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = raw.replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}
function isPrivate(l: BrokerListing): boolean { return l.hasAgent !== true && normalizeBroker(l.broker) == null; }
function topCounts<T extends string>(items: (T | null)[], limit: number): { name: T; count: number }[] {
  const m = new Map<T, number>();
  for (const it of items) { if (it == null) continue; m.set(it, (m.get(it) ?? 0) + 1); }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
function avg(xs: number[]): number | null { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

/** Aggregate the observed evidence into one record per detected broker. */
export function aggregateBrokers(listings: BrokerListing[], nowMs: number, periodDays: number): Map<string, BrokerAgg> {
  const groups = new Map<string, BrokerListing[]>();
  for (const l of listings) { const n = normalizeBroker(l.broker); if (!n) continue; (groups.get(n) ?? groups.set(n, []).get(n)!).push(l); }
  const out = new Map<string, BrokerAgg>();
  for (const [name, rows] of groups) {
    const seens = rows.map((r) => r.firstSeenMs).filter((t): t is number => t != null);
    const geoRows = rows.filter((r) => r.lat != null && r.lng != null);
    out.set(name, {
      name, observedInventory: rows.length,
      areas: topCounts(rows.map((r) => r.neighborhood || r.city), 3).map((a) => ({ name: a.name, count: a.count })),
      propertyTypes: topCounts(rows.map((r) => r.propertyType), 4).map((t) => ({ type: t.name, count: t.count })),
      newInPeriod: rows.filter((r) => r.firstSeenMs != null && nowMs - r.firstSeenMs < periodDays * DAY).length,
      firstObservedMs: seens.length ? Math.min(...seens) : null,
      lastObservedMs: seens.length ? Math.max(...seens) : null,
      avgPrice: avg(rows.map((r) => r.price).filter((p): p is number => p != null && p > 0)),
      lat: geoRows.length ? (avg(geoRows.map((r) => r.lat as number)) as number) : null,
      lng: geoRows.length ? (avg(geoRows.map((r) => r.lng as number)) as number) : null,
      sampleListingIds: rows.slice(0, 12).map((r) => r.id),
    });
  }
  return out;
}

/** Cheap near-duplicate name heuristic for the data-quality note only — it
 *  REPORTS potential duplicates (same alphanumeric skeleton), never merges. */
export function countPossibleDuplicateNames(names: string[]): number {
  const skel = new Map<string, number>();
  for (const n of names) { const k = n.toLowerCase().replace(/[^a-z0-9֐-׿]/g, ""); if (!k) continue; skel.set(k, (skel.get(k) ?? 0) + 1); }
  let dup = 0; for (const c of skel.values()) if (c > 1) dup += c;
  return dup;
}

/** Evidence-gated observations (≤3). No evidence ⇒ no observation. Pure. */
export function buildBrokerInsights(aggs: BrokerAgg[], areas: AreaCompetition[], newlyCount: number, periodDays: number): BrokerInsight[] {
  const out: BrokerInsight[] = [];
  // 1) A broker with a strong recent burst of newly-observed inventory.
  const surging = [...aggs].filter((a) => a.newInPeriod >= 4).sort((x, y) => y.newInPeriod - x.newInPeriod)[0];
  if (surging) out.push({ id: `surge-${surging.name}`, kind: "activity", what: `${surging.name} — ${surging.newInPeriod} מודעות חדשות`, evidence: `${surging.newInPeriod} מודעות נצפו לראשונה ב-${periodDays} הימים האחרונים`, why: "פעילות מתגברת של המתווך בזירה.", action: "פתח מתווך", href: null });
  // 2) A crowded arena — an area with many listings per observed broker.
  const crowded = [...areas].filter((a) => a.brokers >= 2 && a.listingsPerBroker >= INSIGHT_MIN_AREA_LPB).sort((x, y) => y.listingsPerBroker - x.listingsPerBroker)[0];
  if (crowded && out.length < 3) out.push({ id: `crowd-${crowded.name}`, kind: "competition", what: `${crowded.name} — זירה צפופה`, evidence: `${crowded.listings} מודעות · ${crowded.brokers} מתווכים · ${crowded.listingsPerBroker} מודעות למתווך`, why: "ריכוז מלאי גבוה יחסית למספר המתווכים הפעילים.", action: "בחן אזור", href: null });
  // 3) Newly-observed brokers appearing in the arena.
  if (newlyCount >= 3 && out.length < 3) out.push({ id: `new-brokers`, kind: "entrants", what: `${newlyCount} מתווכים חדשים נצפו`, evidence: `${newlyCount} מתווכים הופיעו לראשונה ב-${periodDays} הימים האחרונים`, why: "שחקנים חדשים נכנסים לזירה — שווה להכיר.", action: null, href: null });
  return out.slice(0, 3);
}

/** Assemble the whole broker cockpit. Pure + deterministic. */
export function buildBrokerCockpit(input: BrokerInput): BrokerCockpit {
  const { filters, nowMs } = input;
  const cityScoped = filters.city ? input.listings.filter((l) => (l.city ?? "").trim() === filters.city) : input.listings;
  const cities = [...new Set(input.listings.map((l) => (l.city ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he"));

  const aggMap = aggregateBrokers(cityScoped, nowMs, filters.period);
  const aggs = [...aggMap.values()];
  const totalObserved = aggs.reduce((a, b) => a + b.observedInventory, 0);
  const privateInventory = cityScoped.filter(isPrivate).length;

  // KPIs (every one with an explicit definition).
  const newlyObservedNames = aggs.filter((a) => a.firstObservedMs != null && nowMs - a.firstObservedMs < filters.period * DAY).map((a) => a.name);
  const kpis: BrokerKpi[] = [
    { key: "brokers", label: "מתווכים שזוהו", value: aggs.length, unit: "", def: "שמות מתווכים ייחודיים שזוהו במודעות הנצפות (ללא מיזוג וריאציות כתיב)" },
    { key: "attributed", label: "מלאי משויך למתווך", value: totalObserved, unit: "", def: "מודעות נצפות שזוהה עבורן מתווך מפרסם" },
    { key: "private", label: "מלאי בעלים פרטי", value: privateInventory, unit: "", def: "מודעות ללא מתווך מזוהה (בעלים פרטי)" },
    { key: "new_brokers", label: `מתווכים חדשים (${filters.period} ימים)`, value: newlyObservedNames.length, unit: "", def: "מתווכים שנצפו לראשונה בתקופה הנבחרת (לפי first_seen של המודעה)" },
  ];

  // Landscape — ranked by observed inventory.
  const maxInv = Math.max(1, ...aggs.map((a) => a.observedInventory));
  const landscape: LandscapeRow[] = [...aggs].sort((a, b) => b.observedInventory - a.observedInventory).slice(0, LANDSCAPE_TOP)
    .map((a) => ({ name: a.name, observedInventory: a.observedInventory, areas: a.areas.map((x) => x.name), propertyTypes: a.propertyTypes.map((x) => x.type), newInPeriod: a.newInPeriod, pct: Math.round((a.observedInventory / maxInv) * 100) }));

  // Concentration — share of OBSERVED inventory (never "market share").
  const ranked = [...aggs].sort((a, b) => b.observedInventory - a.observedInventory);
  const topBands = ranked.slice(0, CONCENTRATION_TOP).map((a) => ({ name: a.name, observedInventory: a.observedInventory, sharePct: totalObserved > 0 ? Math.round((a.observedInventory / totalObserved) * 100) : 0 }));
  const otherBrokers = Math.max(0, ranked.length - CONCENTRATION_TOP);
  const otherInventory = ranked.slice(CONCENTRATION_TOP).reduce((a, b) => a + b.observedInventory, 0);
  const top5Share = totalObserved > 0 ? Math.round((ranked.slice(0, 5).reduce((a, b) => a + b.observedInventory, 0) / totalObserved) * 100) : 0;
  const concentration: Concentration = { top: topBands, otherBrokers, otherInventory, privateInventory, totalObserved, topShareLabel: `5 המתווכים המובילים מחזיקים ${top5Share}% מהמלאי הנצפה` };

  // Areas — competition density (listings per observed broker).
  const areaGroups = new Map<string, BrokerListing[]>();
  for (const l of cityScoped) { const k = (l.neighborhood || l.city || "").trim(); if (!k) continue; (areaGroups.get(k) ?? areaGroups.set(k, []).get(k)!).push(l); }
  const areas: AreaCompetition[] = [...areaGroups.entries()].map(([name, rows]) => {
    const brokers = new Set(rows.map((r) => normalizeBroker(r.broker)).filter(Boolean)).size;
    const geoRows = rows.filter((r) => r.lat != null && r.lng != null);
    return { name, city: rows.find((r) => r.city)?.city ?? null, listings: rows.length, brokers, listingsPerBroker: brokers > 0 ? Math.round((rows.length / brokers) * 10) / 10 : 0, lat: geoRows.length ? (avg(geoRows.map((r) => r.lat as number)) as number) : null, lng: geoRows.length ? (avg(geoRows.map((r) => r.lng as number)) as number) : null };
  }).sort((a, b) => b.listings - a.listings).slice(0, AREA_TOP);

  // Property-type specialization — which brokers have observed inventory per type.
  const typeGroups = new Map<string, BrokerListing[]>();
  for (const l of cityScoped) { const t = (l.propertyType ?? "").trim(); if (!t) continue; (typeGroups.get(t) ?? typeGroups.set(t, []).get(t)!).push(l); }
  const typeSpecialization: TypeSpecialization[] = [...typeGroups.entries()].map(([type, rows]) => ({ type, count: rows.length, brokers: topCounts(rows.map((r) => normalizeBroker(r.broker)), 3).map((b) => ({ name: b.name, count: b.count })) }))
    .sort((a, b) => b.count - a.count).slice(0, TYPE_TOP).map(({ type, brokers }) => ({ type, brokers }));

  // Directory — bounded + paginated, searchable.
  const search = (filters.search ?? "").trim().toLowerCase();
  const dirAll = ranked.filter((a) => !search || a.name.toLowerCase().includes(search));
  const total = dirAll.length;
  const totalPages = Math.max(1, Math.ceil(total / DIR_PAGE));
  const page = Math.min(Math.max(1, filters.page), totalPages);
  const directory: Directory = {
    rows: dirAll.slice((page - 1) * DIR_PAGE, page * DIR_PAGE).map((a) => ({ name: a.name, observedInventory: a.observedInventory, topArea: a.areas[0]?.name ?? null, propertyTypes: a.propertyTypes.length, verified: false, newInPeriod: a.newInPeriod })),
    page, pageSize: DIR_PAGE, total, totalPages,
  };

  const geocoded = cityScoped.filter((l) => l.lat != null).length;
  const dataQuality = {
    attributedPct: cityScoped.length ? Math.round((totalObserved / cityScoped.length) * 100) : 0,
    geocodedPct: cityScoped.length ? Math.round((geocoded / cityScoped.length) * 100) : 0,
    possibleDuplicateNames: countPossibleDuplicateNames(aggs.map((a) => a.name)),
    note: "המספרים מבוססים על המלאי הנצפה בלבד (לא כל השוק). וריאציות כתיב של שם מתווך אינן ממוזגות אוטומטית.",
  };

  return {
    hasData: aggs.length > 0,
    totalListings: cityScoped.length,
    filters,
    facets: { cities },
    kpis,
    insights: buildBrokerInsights(aggs, areas, newlyObservedNames.length, filters.period),
    landscape,
    concentration,
    areas,
    typeSpecialization,
    newlyObserved: { period: filters.period, count: newlyObservedNames.length, names: newlyObservedNames.slice(0, 12) },
    directory,
    dataQuality,
    collaboration: { status: "engine_required", reason: "המלצות שיתוף-פעולה דורשות מנוע ייעודי (חפיפה גאוגרפית, מלאי משלים, יחסי עבר) שאינו קיים עדיין — לא מוצג מידע מפוברק." },
    generatedAtMs: nowMs,
  };
}

/** One broker's aggregated intelligence — for the in-place drawer. */
export function brokerDetail(input: BrokerInput, name: string): BrokerAgg | null {
  const cityScoped = input.filters.city ? input.listings.filter((l) => (l.city ?? "").trim() === input.filters.city) : input.listings;
  return aggregateBrokers(cityScoped, input.nowMs, input.filters.period).get(name) ?? null;
}
