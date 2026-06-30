// ============================================================================
// Evidence Search Engine™ — address normalizers (PURE, client-safe).
// Hebrew-aware: trims, folds hyphen/maqaf, collapses whitespace, normalizes
// final letters and קרית/קריית, and expands safe street abbreviations.
// Never invents data — empty in → empty out.
// ============================================================================
const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

function base(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/[׳״"'`]/g, "")            // gershayim / quotes
    .replace(/[-־–—_]/g, " ")            // hyphen / maqaf variants → space
    .replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized city — also folds קריית→קרית and lowercases for matching. */
export function normalizeCity(raw: string | null | undefined): string {
  return base(raw).replace(/קריי/g, "קרי").toLowerCase();
}

/** Normalized neighborhood. */
export function normalizeNeighborhood(raw: string | null | undefined): string {
  return base(raw).toLowerCase();
}

// Safe street-type abbreviation expansions (only unambiguous ones).
const STREET_ABBR: [RegExp, string][] = [
  [/^שד\b/, "שדרות"], [/^רח\b/, "רחוב"], [/^סמ\b/, "סמטת"], [/^שכ\b/, "שכונת"],
];
/** Normalized street — expands שד׳/רח׳ etc., strips a leading type word for matching. */
export function normalizeStreet(raw: string | null | undefined): string {
  let s = base(raw).toLowerCase();
  for (const [re, full] of STREET_ABBR) s = s.replace(re, full);
  // Drop a leading street-type word so "רחוב הרצל" == "הרצל".
  s = s.replace(/^(רחוב|שדרות|סמטת|דרך|שכונת)\s+/, "");
  return s.trim();
}

/** House number digits only (handles "12א" → "12"). */
export function normalizeHouseNumber(raw: string | null | undefined): string | null {
  const m = (raw ?? "").match(/\d+/);
  return m ? m[0] : null;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const numOf = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};
export const strOf = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
export const firstStr = (row: Record<string, unknown>, fields: string[]): string => { for (const f of fields) { const v = strOf(row[f]); if (v) return v; } return ""; };
export const firstNum = (row: Record<string, unknown>, fields: string[]): number | null => { for (const f of fields) { const n = numOf(row[f]); if (n != null) return n; } return null; };
