// ============================================================================
// ZONO — Office Intelligence COCKPIT · pure derivations (no I/O, no deps).
// ----------------------------------------------------------------------------
// P0 FIX baked in: the old screen showed only 2 offices because the source was
// hard-filtered by org TERRITORY + status="active". This model does NOT
// territory-cut. It presents the HONEST office universe: offices ranked by
// OBSERVED ACTIVITY (linked agents / linked listings), the large UNASSIGNED pool
// surfaced as its own honest state (agents/listings not yet resolved to an
// office — real operational information, never a fake office), concentration as a
// share of OBSERVED inventory (never "market share"), area + property-type
// presence, and a brand-network view. Office identity variants are NOT merged
// (ENGINE_REQUIRED). Dependency-free → unit tested directly.
// ============================================================================

export interface OfficeRecord {
  id: string;
  name: string;
  brand: string | null;         // brand_network (RE/MAX …)
  officeType: string | null;    // independent | franchise | branch | unknown
  hierarchy: string | null;     // independent | branch | regional | franchise | national_network
  city: string | null;
  phone: string | null;
  rating: number | null;
  reviews: number | null;
  status: string;               // active | candidate | unverified | …
  agents: number;               // linked agents
  observedListings: number;     // distinct linked listings (this org's observed inventory)
  areas: { name: string; count: number }[];
  propertyTypes: { type: string; count: number }[];
  newInPeriod: number;
  firstSeenMs: number | null;
  lastSeenMs: number | null;
  lat: number | null; lng: number | null;
  agentSample: { id: string; name: string }[];
}
export interface OfficeFilters { city: string | null; search: string | null; period: 30 | 90; page: number }
export interface OfficeInput {
  offices: OfficeRecord[];
  unassignedAgents: number;
  unassignedListings: number;
  totalObservedListings: number;
  totalDetectedOffices: number;   // includes candidates without observed activity
  filters: OfficeFilters;
  nowMs: number;
  territory?: { areas: string[] };  // org specialization areas (P0 scope); [] = activity-only
}

export interface OfficeKpi { key: string; label: string; value: number; def: string }
export interface OfficeLandscapeRow { id: string; name: string; brand: string | null; observedListings: number; agents: number; areas: string[]; newInPeriod: number; pct: number }
export interface OfficeConcentration { top: { id: string; name: string; observedListings: number; sharePct: number }[]; otherOffices: number; otherInventory: number; unassignedInventory: number; totalObserved: number; topShareLabel: string }
export interface OfficeAreaRow { name: string; listings: number; offices: number; topOffice: string | null }
export interface BrandRow { brand: string; offices: number; observedListings: number; agents: number }
export interface OfficeInsight { id: string; kind: string; what: string; evidence: string; why: string }
export interface OfficeDirRow { id: string; name: string; brand: string | null; agents: number; observedListings: number; topArea: string | null; hasActivity: boolean }
export interface OfficeDirectory { rows: OfficeDirRow[]; page: number; pageSize: number; total: number; totalPages: number }

export interface OfficeCockpit {
  hasData: boolean;
  filters: OfficeFilters;
  facets: { cities: string[] };
  kpis: OfficeKpi[];
  coverage: { attributedListings: number; totalObservedListings: number; attributedPct: number; unassignedAgents: number; unassignedListings: number };
  insights: OfficeInsight[];
  landscape: OfficeLandscapeRow[];
  concentration: OfficeConcentration;
  areas: OfficeAreaRow[];
  brands: BrandRow[];
  directory: OfficeDirectory;
  unassigned: { agents: number; listings: number };
  dataQuality: { attributedPct: number; possibleDuplicateNames: number; note: string };
  identity: { status: "engine_required"; reason: string };
  territory: { areas: string[]; scoped: boolean };
  generatedAtMs: number;
}

const LANDSCAPE_TOP = 8;
const CONCENTRATION_TOP = 6;
const AREA_TOP = 8;
const BRAND_TOP = 6;
const DIR_PAGE = 15;

const hasActivity = (o: OfficeRecord): boolean => o.agents > 0 || o.observedListings > 0;

export function countPossibleDuplicateOfficeNames(names: string[]): number {
  const skel = new Map<string, number>();
  for (const n of names) { const k = n.toLowerCase().replace(/[^a-z0-9֐-׿]/g, ""); if (!k) continue; skel.set(k, (skel.get(k) ?? 0) + 1); }
  let dup = 0; for (const c of skel.values()) if (c > 1) dup += c;
  return dup;
}

/** Evidence-gated observations (≤3). No evidence ⇒ no observation. Pure. */
export function buildOfficeInsights(active: OfficeRecord[], unassignedAgents: number, brands: BrandRow[]): OfficeInsight[] {
  const out: OfficeInsight[] = [];
  const leader = [...active].sort((a, b) => b.observedListings - a.observedListings)[0];
  if (leader && leader.observedListings >= 3 && leader.areas[0]) out.push({ id: `lead-${leader.id}`, kind: "dominance", what: `${leader.name} מוביל במלאי הנצפה`, evidence: `${leader.observedListings} מודעות משויכות · חזק ב${leader.areas[0].name}`, why: "המשרד עם המלאי הנצפה הגדול ביותר בזירה שלך." });
  if (unassignedAgents >= 10 && out.length < 3) out.push({ id: "unassigned", kind: "coverage", what: `${unassignedAgents} סוכנים ללא שיוך למשרד`, evidence: `${unassignedAgents} סוכנים פעילים שטרם קושרו למשרד מזוהה`, why: "פער בזיהוי — שיוכם ישפר את מפת התחרות." });
  const topBrand = brands[0];
  if (topBrand && topBrand.offices >= 2 && out.length < 3) out.push({ id: `brand-${topBrand.brand}`, kind: "network", what: `${topBrand.brand}: ${topBrand.offices} משרדים בזירה`, evidence: `${topBrand.offices} משרדים · ${topBrand.observedListings} מודעות נצפות`, why: "רשת עם נוכחות מרובת-סניפים באזור." });
  return out.slice(0, 3);
}

/** Assemble the whole office cockpit. Pure + deterministic. */
export function buildOfficeCockpit(input: OfficeInput): OfficeCockpit {
  const { filters, nowMs } = input;
  const scoped = filters.city ? input.offices.filter((o) => (o.city ?? "").trim() === filters.city) : input.offices;
  const active = scoped.filter(hasActivity);
  const cities = [...new Set(input.offices.map((o) => (o.city ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he"));

  const attributedListings = active.reduce((a, b) => a + b.observedListings, 0);
  const agentsAttributed = active.reduce((a, b) => a + b.agents, 0);

  const kpis: OfficeKpi[] = [
    { key: "active_offices", label: "משרדים עם פעילות נצפית", value: active.length, def: "משרדים שזוהו עם סוכן משויך או מודעה משויכת אחת לפחות" },
    { key: "agents", label: "סוכנים משויכים", value: agentsAttributed, def: "סוכנים שקושרו למשרד מזוהה" },
    { key: "listings", label: "מלאי משויך למשרד", value: attributedListings, def: "מודעות נצפות שקושרו למשרד" },
    { key: "unassigned", label: "סוכנים ללא משרד", value: input.unassignedAgents, def: "סוכנים פעילים שטרם קושרו למשרד מזוהה (פער זיהוי)" },
  ];

  // Landscape — offices ranked by observed inventory.
  const maxInv = Math.max(1, ...active.map((o) => o.observedListings), 1);
  const landscape: OfficeLandscapeRow[] = [...active].sort((a, b) => b.observedListings - a.observedListings || b.agents - a.agents).slice(0, LANDSCAPE_TOP)
    .map((o) => ({ id: o.id, name: o.name, brand: o.brand, observedListings: o.observedListings, agents: o.agents, areas: o.areas.map((a) => a.name), newInPeriod: o.newInPeriod, pct: Math.round((o.observedListings / maxInv) * 100) }));

  // Concentration — share of OBSERVED inventory (never "market share").
  const totalObserved = input.totalObservedListings;
  const ranked = [...active].sort((a, b) => b.observedListings - a.observedListings);
  const top = ranked.slice(0, CONCENTRATION_TOP).map((o) => ({ id: o.id, name: o.name, observedListings: o.observedListings, sharePct: totalObserved > 0 ? Math.round((o.observedListings / totalObserved) * 100) : 0 }));
  const otherInventory = ranked.slice(CONCENTRATION_TOP).reduce((a, b) => a + b.observedListings, 0);
  const top5Share = totalObserved > 0 ? Math.round((ranked.slice(0, 5).reduce((a, b) => a + b.observedListings, 0) / totalObserved) * 100) : 0;
  const concentration: OfficeConcentration = { top, otherOffices: Math.max(0, ranked.length - CONCENTRATION_TOP), otherInventory, unassignedInventory: input.unassignedListings, totalObserved, topShareLabel: `5 המשרדים המובילים מחזיקים ${top5Share}% מהמלאי הנצפה` };

  // Office × area — which offices are active where.
  const areaMap = new Map<string, { listings: number; offices: Set<string>; leader: { name: string; c: number } | null }>();
  for (const o of active) for (const a of o.areas) {
    const cur = areaMap.get(a.name) ?? { listings: 0, offices: new Set<string>(), leader: null };
    cur.listings += a.count; cur.offices.add(o.id);
    if (!cur.leader || a.count > cur.leader.c) cur.leader = { name: o.name, c: a.count };
    areaMap.set(a.name, cur);
  }
  const areas: OfficeAreaRow[] = [...areaMap.entries()].map(([name, v]) => ({ name, listings: v.listings, offices: v.offices.size, topOffice: v.leader?.name ?? null })).sort((a, b) => b.listings - a.listings).slice(0, AREA_TOP);

  // Brand-network view (franchise ≠ branch, expressed via brand_network).
  const brandMap = new Map<string, { offices: number; listings: number; agents: number }>();
  for (const o of active) { const b = (o.brand ?? "").trim(); if (!b) continue; const cur = brandMap.get(b) ?? { offices: 0, listings: 0, agents: 0 }; cur.offices++; cur.listings += o.observedListings; cur.agents += o.agents; brandMap.set(b, cur); }
  const brands: BrandRow[] = [...brandMap.entries()].map(([brand, v]) => ({ brand, offices: v.offices, observedListings: v.listings, agents: v.agents })).sort((a, b) => b.offices - a.offices || b.observedListings - a.observedListings).slice(0, BRAND_TOP);

  // Directory — active offices first, then the rest; bounded + paginated + searchable.
  const search = (filters.search ?? "").trim().toLowerCase();
  const dirAll = [...scoped].filter((o) => !search || o.name.toLowerCase().includes(search) || (o.brand ?? "").toLowerCase().includes(search))
    .sort((a, b) => Number(hasActivity(b)) - Number(hasActivity(a)) || b.observedListings - a.observedListings || b.agents - a.agents || a.name.localeCompare(b.name, "he"));
  const total = dirAll.length;
  const totalPages = Math.max(1, Math.ceil(total / DIR_PAGE));
  const page = Math.min(Math.max(1, filters.page), totalPages);
  const directory: OfficeDirectory = {
    rows: dirAll.slice((page - 1) * DIR_PAGE, page * DIR_PAGE).map((o) => ({ id: o.id, name: o.name, brand: o.brand, agents: o.agents, observedListings: o.observedListings, topArea: o.areas[0]?.name ?? null, hasActivity: hasActivity(o) })),
    page, pageSize: DIR_PAGE, total, totalPages,
  };

  return {
    hasData: active.length > 0 || input.unassignedAgents > 0,
    filters,
    facets: { cities },
    kpis,
    coverage: { attributedListings, totalObservedListings: totalObserved, attributedPct: totalObserved > 0 ? Math.round((attributedListings / totalObserved) * 100) : 0, unassignedAgents: input.unassignedAgents, unassignedListings: input.unassignedListings },
    insights: buildOfficeInsights(active, input.unassignedAgents, brands),
    landscape,
    concentration,
    areas,
    brands,
    directory,
    unassigned: { agents: input.unassignedAgents, listings: input.unassignedListings },
    dataQuality: {
      attributedPct: totalObserved > 0 ? Math.round((attributedListings / totalObserved) * 100) : 0,
      possibleDuplicateNames: countPossibleDuplicateOfficeNames(active.map((o) => o.name)),
      note: `מוצגים ${active.length} משרדים עם פעילות נצפית מתוך ${input.totalDetectedOffices} שזוהו (השאר מועמדים ללא פעילות). המספרים מבוססים על המלאי הנצפה בלבד; וריאציות כתיב וסניפים אינם ממוזגים אוטומטית.`,
    },
    identity: { status: "engine_required", reason: "מיזוג זהויות משרד (רשת מול סניף, וריאציות כתיב) דורש מנוע זיהוי ייעודי — לא מבוצע מיזוג אוטומטי מבוסס דמיון מחרוזות." },
    territory: { areas: input.territory?.areas ?? [], scoped: (input.territory?.areas.length ?? 0) > 0 },
    generatedAtMs: nowMs,
  };
}

/** One office's record — for the in-place drawer. */
export function officeDetail(input: OfficeInput, id: string): OfficeRecord | null {
  return input.offices.find((o) => o.id === id) ?? null;
}
