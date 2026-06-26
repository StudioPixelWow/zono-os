// ============================================================================
// ZONO — PHASE 26.13: API filter helpers (PURE, client-safe). Normalize the
// filter input and apply sort / threshold / paging predicates over already-typed
// rows. No IO. Used by the API layer and unit-tested directly.
// ============================================================================
import type { AgencyIntelligenceFilters, AgencyIntelligenceCardDTO, AgencySignalDTO, AgencySortBy } from "./agencyIntelligenceApiTypes";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** Clamp + default the paging/sort fields so the API is always bounded. */
export function normalizeFilters(f: AgencyIntelligenceFilters = {}): Required<Pick<AgencyIntelligenceFilters, "limit" | "offset" | "sortBy">> & AgencyIntelligenceFilters {
  return {
    ...f,
    limit: Math.max(1, Math.min(f.limit ?? DEFAULT_LIMIT, MAX_LIMIT)),
    offset: Math.max(0, f.offset ?? 0),
    sortBy: f.sortBy ?? "threat",
  };
}

const v = (n: number | null | undefined): number => (typeof n === "number" ? n : -1);
const SORT_KEY: Record<AgencySortBy, (a: AgencyIntelligenceCardDTO) => number> = {
  threat: (a) => v(a.threat), overall: (a) => v(a.overall), momentum: (a) => v(a.momentum),
  confidence: (a) => v(a.dataConfidence), growth: (a) => v(a.growth),
};

/** Filter + sort + page a list of agency cards (pure, non-mutating). */
export function applyAgencyFilters(list: AgencyIntelligenceCardDTO[], filters: AgencyIntelligenceFilters): AgencyIntelligenceCardDTO[] {
  const f = normalizeFilters(filters);
  const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  let rows = list.filter((a) => {
    if (f.agencyId && a.agencyId !== f.agencyId) return false;
    if (f.city && lc(a.city) !== lc(f.city)) return false;
    if (f.threatMin != null && (a.threat == null || a.threat < f.threatMin)) return false;
    if (f.scoreMin != null && (a.overall == null || a.overall < f.scoreMin)) return false;
    if (f.confidenceMin != null && (a.dataConfidence == null || a.dataConfidence < f.confidenceMin)) return false;
    return true;
  });
  rows = [...rows].sort((a, b) => SORT_KEY[f.sortBy](b) - SORT_KEY[f.sortBy](a) || a.name.localeCompare(b.name, "he"));
  return rows.slice(f.offset, f.offset + f.limit);
}

/** Filter signals by type/severity (pure). */
export function applySignalFilters(list: AgencySignalDTO[], filters: AgencyIntelligenceFilters): AgencySignalDTO[] {
  const f = normalizeFilters(filters);
  let rows = list.filter((s) => {
    if (f.signalType && s.signalType !== f.signalType) return false;
    if (f.severity && (s.severity ?? "") !== f.severity) return false;
    return true;
  });
  rows = rows.slice(f.offset, f.offset + f.limit);
  return rows;
}
