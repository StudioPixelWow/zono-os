// ============================================================================
// ZONO Core Data — Brokerage Data normalization (pure, client-safe).
// Reuses the broker engine's Israeli phone/name normalizers and adds city
// normalization so national data resolves cleanly across spelling variants.
// ============================================================================
import { normalizeHebrewName, normalizePhoneNumber, normalizeAgencyName } from "@/lib/broker/engine";

export { normalizeHebrewName, normalizePhoneNumber, normalizeAgencyName };

/** Normalize an Israeli city name (קריית↔קרית, leading ה, punctuation, spacing,
 *  hyphens, lowercase) so the same city matches across sources. */
export function normalizeCity(input: string | null | undefined): string {
  return String(input ?? "")
    .replace(/קריית/g, "קרית")
    .replace(/["'`׳״.,\-/]/g, " ")
    .replace(/^ה(?=[א-ת])/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Significant city tokens (drop 1-char fragments + connector words). */
export function cityTokens(input: string | null | undefined): string[] {
  const STOP = new Set(["של", "על", "the"]);
  return normalizeCity(input).split(" ").filter((t) => t.length > 1 && !STOP.has(t));
}

/** Two city names refer to the same city when one's tokens are a subset of the
 *  other's — "תל אביב" ↔ "תל אביב יפו" — without single-token false positives. */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = cityTokens(a), tb = cityTokens(b);
  if (!ta.length || !tb.length) return false;
  const sa = new Set(ta), sb = new Set(tb);
  return ta.every((t) => sb.has(t)) || tb.every((t) => sa.has(t));
}

/** Normalize an office name — keep the agency core (drops generic agency words). */
export function normalizeOfficeName(input: string | null | undefined): string {
  const core = normalizeAgencyName(input);
  return core || normalizeHebrewName(input);
}

/** Best-effort email normalization (trim + lowercase). */
export function normalizeEmail(input: string | null | undefined): string {
  return String(input ?? "").trim().toLowerCase();
}

/** Normalize a website host (strip scheme/www/path) for stable comparison. */
export function normalizeWebsite(input: string | null | undefined): string {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return "";
  return s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\/+$/, "");
}
