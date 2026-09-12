// ============================================================================
// ZONO — LISTING DEDUP · pure core (no DB, deterministic, unit-tested). The same
// property advertised on Yad2 and Madlan (and future sources) must be recognised
// as ONE property without ever deleting a source row — dedup is LOGICAL grouping,
// not a destructive merge. Scoring is evidence-based; grouping is union-find over
// HIGH-confidence pairs only; the canonical listing is chosen by data quality.
// Provenance (every source row + its source) is always preserved.
//
// SCALE: callers must BLOCK before scoring — never O(n²) across a whole city. Use
// `blockingKeys()` to bucket listings (city + street token / geo cell / rooms·sqm)
// and only score within a bucket. `dedupeWithinBlocks()` does this end to end.
// ============================================================================
import { canonicalLocality } from "@/lib/geo/locality";
import { normalizePhoneIL } from "@/lib/util/identity";

export interface DedupListing {
  id: string;
  source: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  streetNumber: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  price: number | null;
  propertyType: string | null;
  contactPhone: string | null;
  lat: number | null;
  lng: number | null;
  imageCount: number;
  hasAddress: boolean;
  firstSeenMs: number | null;
}

export type DupLevel = "high" | "medium" | "low" | "none";

const foldStreet = (s: string | null): string =>
  (s ?? "").normalize("NFKC").replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Haversine metres between two coordinates (null when either is missing). */
export function metersApart(aLat: number | null, aLng: number | null, bLat: number | null, bLng: number | null): number | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const R = 6_371_000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface DupScore { score: number; level: DupLevel; reasons: string[] }

/**
 * Score whether two listings are the SAME property. Deterministic, symmetric.
 * A cross-source pair (Yad2 vs Madlan) that shares address + core attributes is
 * the canonical HIGH case. Different sources are NOT required, but two rows from
 * the SAME source id are handled upstream (never scored here). Guardrails: a
 * strong price/size CONFLICT caps the level so unrelated units never group.
 */
export function scorePair(a: DedupListing, b: DedupListing): DupScore {
  const reasons: string[] = [];
  let score = 0;

  // City must be the same canonical locality — a hard gate (never group across cities).
  const ca = canonicalLocality(a.city), cb = canonicalLocality(b.city);
  if (ca && cb && ca !== cb) return { score: 0, level: "none", reasons: ["ערים שונות"] };

  // Address.
  const sa = foldStreet(a.street), sb = foldStreet(b.street);
  const sameStreet = !!sa && sa === sb;
  if (sameStreet) { score += 30; reasons.push("אותו רחוב"); }
  const na = (a.streetNumber ?? "").trim(), nb = (b.streetNumber ?? "").trim();
  const sameNumber = !!na && na === nb;
  if (sameStreet && sameNumber) { score += 20; reasons.push("אותו מספר בית"); }
  const numberConflict = !!na && !!nb && na !== nb;

  // Geo proximity.
  const dist = metersApart(a.lat, a.lng, b.lat, b.lng);
  if (dist != null) {
    if (dist <= 40) { score += 25; reasons.push("מיקום כמעט זהה"); }
    else if (dist <= 120) { score += 12; reasons.push("מיקום קרוב"); }
    else if (dist > 400) { score -= 20; reasons.push("מיקום רחוק"); }
  }

  // Core attributes.
  const ra = num(a.rooms), rb = num(b.rooms);
  const roomsConflict = ra != null && rb != null && Math.abs(ra - rb) >= 1;
  if (ra != null && ra === rb) { score += 12; reasons.push("אותו מספר חדרים"); }
  const qa = num(a.sqm), qb = num(b.sqm);
  const sizeConflict = qa != null && qb != null && Math.abs(qa - qb) > Math.max(8, 0.12 * Math.max(qa, qb));
  if (qa != null && qb != null && Math.abs(qa - qb) <= 3) { score += 12; reasons.push("שטח זהה"); }
  const fa = num(a.floor), fb = num(b.floor);
  const floorConflict = fa != null && fb != null && fa !== fb;
  if (fa != null && fa === fb) { score += 8; reasons.push("אותה קומה"); }

  // Price proximity (same asking price is a strong same-listing signal).
  const pa = num(a.price), pb = num(b.price);
  if (pa != null && pb != null && pa > 0 && pb > 0) {
    const rel = Math.abs(pa - pb) / Math.max(pa, pb);
    if (rel <= 0.02) { score += 15; reasons.push("מחיר זהה"); }
    else if (rel <= 0.08) { score += 6; reasons.push("מחיר קרוב"); }
    else if (rel > 0.3) { score -= 10; reasons.push("פער מחיר גדול"); }
  }

  // Same advertiser phone.
  const pha = normalizePhoneIL(a.contactPhone), phb = normalizePhoneIL(b.contactPhone);
  if (pha && pha === phb) { score += 15; reasons.push("אותו מפרסם"); }

  // Property type conflict is disqualifying (a plot is never an apartment).
  const ta = (a.propertyType ?? "").trim().toLowerCase(), tb = (b.propertyType ?? "").trim().toLowerCase();
  const typeConflict = !!ta && !!tb && ta !== tb;

  // Hard conflicts cap the verdict — uncertainty must not become a merge.
  const hardConflict = numberConflict || roomsConflict || sizeConflict || floorConflict || typeConflict;

  let level: DupLevel;
  if (hardConflict) level = score >= 55 ? "low" : "none";       // conflicting facts → never auto-group
  else if (score >= 65) level = "high";
  else if (score >= 45) level = "medium";
  else if (score >= 30) level = "low";
  else level = "none";
  return { score: Math.max(0, Math.min(100, score)), level, reasons };
}

/** Blocking keys for a listing — only listings sharing a key are ever compared,
 *  so scoring stays near-linear instead of O(n²). Keys: city+street, city+geocell,
 *  city+rooms·sqm-bucket. A listing joins every block it qualifies for. */
export function blockingKeys(l: DedupListing): string[] {
  const city = canonicalLocality(l.city) || "?";
  const keys: string[] = [];
  const st = foldStreet(l.street);
  if (st) keys.push(`s:${city}:${st}`);
  if (l.lat != null && l.lng != null) keys.push(`g:${city}:${l.lat.toFixed(3)}:${l.lng.toFixed(3)}`); // ~110m cell
  const r = num(l.rooms), q = num(l.sqm);
  if (r != null && q != null) keys.push(`a:${city}:${r}:${Math.round(q / 10)}`);
  if (!keys.length) keys.push(`c:${city}`); // fallback: whole-city block (rare; only attribute-less rows)
  return keys;
}

/** Pick the canonical listing of a group by data quality: address > images > geo >
 *  richer > newer. Deterministic tiebreak on id. */
export function pickCanonical(group: DedupListing[]): DedupListing {
  return [...group].sort((a, b) => {
    const q = (l: DedupListing) => (l.hasAddress ? 8 : 0) + Math.min(4, l.imageCount) + (l.lat != null ? 3 : 0) + (l.price != null ? 1 : 0);
    const dq = q(b) - q(a); if (dq) return dq;
    const dt = (b.firstSeenMs ?? 0) - (a.firstSeenMs ?? 0); if (dt) return dt;
    return a.id < b.id ? -1 : 1;
  })[0];
}

export interface DedupGroup { key: string; canonicalId: string; memberIds: string[]; level: DupLevel; pairs: Array<{ a: string; b: string; score: number; level: DupLevel; reasons: string[] }> }
export interface DedupResult {
  groups: DedupGroup[];
  stats: { total: number; comparisons: number; highPairs: number; mediumPairs: number; groupedListings: number; groups: number; ungrouped: number };
}

/**
 * Full dedup over a set of listings: block → score within blocks → union HIGH pairs
 * into groups → pick canonical. MEDIUM pairs are reported (for review) but do NOT
 * auto-group. Pure and deterministic; the caller decides what to persist.
 */
export function dedupeWithinBlocks(listings: DedupListing[]): DedupResult {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const blocks = new Map<string, string[]>();
  for (const l of listings) for (const k of blockingKeys(l)) (blocks.get(k) ?? blocks.set(k, []).get(k)!).push(l.id);

  // Union-find over HIGH pairs.
  const parent = new Map<string, string>(listings.map((l) => [l.id, l.id]));
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; } return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const seenPair = new Set<string>();
  const highPairsByRoot = new Map<string, DedupGroup["pairs"]>();
  let comparisons = 0, highPairs = 0, mediumPairs = 0;
  const mediumPairsList: DedupGroup["pairs"] = [];

  for (const ids of blocks.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pk = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
        if (seenPair.has(pk)) continue; seenPair.add(pk);
        const a = byId.get(ids[i])!, b = byId.get(ids[j])!;
        if (a.source && b.source && a.source === b.source) continue; // same-source handled by source_id upstream
        comparisons++;
        const sc = scorePair(a, b);
        if (sc.level === "high") { highPairs++; union(a.id, b.id); }
        else if (sc.level === "medium") { mediumPairs++; mediumPairsList.push({ a: a.id, b: b.id, score: sc.score, level: sc.level, reasons: sc.reasons }); }
      }
    }
  }

  // Materialise groups from union-find roots that have >1 member.
  const membersByRoot = new Map<string, string[]>();
  for (const id of parent.keys()) { const r = find(id); (membersByRoot.get(r) ?? membersByRoot.set(r, []).get(r)!).push(id); }
  const groups: DedupGroup[] = [];
  let groupedListings = 0;
  for (const [root, memberIds] of membersByRoot) {
    if (memberIds.length < 2) continue;
    const members = memberIds.map((id) => byId.get(id)!);
    const canonical = pickCanonical(members);
    groups.push({ key: root, canonicalId: canonical.id, memberIds, level: "high", pairs: highPairsByRoot.get(root) ?? [] });
    groupedListings += memberIds.length;
  }

  return {
    groups,
    stats: {
      total: listings.length, comparisons, highPairs, mediumPairs,
      groupedListings, groups: groups.length, ungrouped: listings.length - groupedListings,
    },
  };
}
