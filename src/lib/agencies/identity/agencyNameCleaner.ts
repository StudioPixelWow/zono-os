// ============================================================================
// ZONO — Agency name cleaner + branch/city extractor (Phase 26.2, PURE).
// Strips generic real-estate noise words (unless part of a known brand),
// extracts a branch + city hint, and exposes quality guards that reject
// non-agency text (generic-only, person/contact-only, platform-only).
// ============================================================================
import { normalizeAgencyName } from "../normalize";
import { detectAgencyBrand } from "./agencyBrandDetector";
import type { BranchCity } from "./agencyIdentityTypes";

const NOISE = [
  "נדלן", "נדל\"ן", "נדל״ן", "תיווך", "נכסים", "סוכנות", "משרד", "מתווך", "מתווכים",
  "real estate", "realty", "properties", "brokerage", "agency", "office", "broker", "group",
];

// Common Israeli city tokens to recognize a city hint (lightweight; the service
// can also match against israel_localities when available).
const CITY_HINTS = [
  "חיפה", "קריות", "קרית ביאליק", "קריית ביאליק", "קרית מוצקין", "קריית מוצקין", "קרית ים", "קריית ים",
  "תל אביב", "ירושלים", "רעננה", "הרצליה", "נתניה", "באר שבע", "אשדוד", "ראשון לציון", "פתח תקווה",
  "kiryat bialik", "kiryat motzkin", "haifa", "tel aviv", "jerusalem", "netanya", "kiryot", "kiryat yam",
];

const NORM = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[„""׳]/g, "");
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Remove generic noise words. Words that belong to a known brand are preserved.
 * Returns the cleaned (display-grade, original-case-ish) name.
 */
export function cleanAgencyName(rawText: string): string {
  const brand = detectAgencyBrand(rawText);
  const protectedTokens = brand.brandName ? new Set(NORM(brand.brandName).split(" ")) : new Set<string>();

  // Tokenize on spaces / separators while keeping Hebrew + latin words.
  const tokens = collapse(rawText.replace(/[|/\\,–—-]+/g, " ")).split(" ");
  const noiseSet = new Set(NOISE.map((n) => NORM(n)));
  const kept = tokens.filter((tok) => {
    const n = NORM(tok);
    if (!n) return false;
    if (protectedTokens.has(n)) return true;
    if (noiseSet.has(n)) return false;
    return true;
  });
  let out = collapse(kept.join(" "));
  // also strip the multiword "real estate" bigram if it survived
  out = collapse(out.replace(/\breal estate\b/gi, ""));
  return out;
}

/** Extract a branch + city hint from raw text (after brand). */
export function extractAgencyBranchAndCity(rawText: string, knownLocalities: string[] = []): BranchCity {
  const lower = NORM(rawText);
  const localitySet = knownLocalities.map((l) => NORM(l));

  // City: prefer a known locality, else a built-in hint (longest match wins).
  let city: string | null = null;
  let cityMatchedLocality = false;
  for (const l of [...localitySet].sort((a, b) => b.length - a.length)) {
    if (l && lower.includes(l)) { city = knownLocalities[localitySet.indexOf(l)]; cityMatchedLocality = true; break; }
  }
  if (!city) {
    for (const h of [...CITY_HINTS].sort((a, b) => b.length - a.length)) {
      if (lower.includes(NORM(h))) { city = h; break; }
    }
  }

  // Branch = first cleaned token that isn't part of the brand or the city.
  // Work on normalized tokens so slash/spacing variants (רי/מקס ↔ רי מקס) match.
  const brand = detectAgencyBrand(rawText);
  const normSet = (s: string | null | undefined) => new Set(normalizeAgencyName(s ?? "").split(" ").filter(Boolean));
  const brandTokens = new Set<string>([...normSet(brand.brandName), ...normSet(brand.matchedToken)]);
  const cityTokens = normSet(city);
  const branch = cleanAgencyName(rawText).split(" ").map((t) => t.trim()).filter(Boolean)
    .find((t) => { const n = normalizeAgencyName(t); return n && !brandTokens.has(n) && !cityTokens.has(n); }) ?? null;

  return { branch: branch || null, city, cityMatchedLocality };
}

// ── Quality guards ───────────────────────────────────────────────────────────
const GENERIC_ONLY = new Set([...NOISE.map((n) => NORM(n)), "עצמאי", "פרטי", "agent", "סוכן"]);
const PHONE_RE = /^[+()\d\s-]{7,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;

export interface NameQuality { ok: boolean; reason: string | null }

/**
 * Reject text that should NOT become an agency: empty, generic-only, contact-only
 * (phone/email/url), or fewer than two meaningful tokens with no brand.
 */
export function assessNameQuality(rawText: string, cleaned: string, hasBrand: boolean): NameQuality {
  const raw = (rawText ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  if (PHONE_RE.test(raw)) return { ok: false, reason: "phone_only" };
  if (EMAIL_RE.test(raw)) return { ok: false, reason: "email_only" };
  if (URL_RE.test(raw)) return { ok: false, reason: "url_only" };

  const meaningful = normalizeAgencyName(cleaned).split(" ").filter((t) => t && !GENERIC_ONLY.has(NORM(t)));
  if (hasBrand) return { ok: true, reason: null };           // a known brand is enough
  if (meaningful.length === 0) return { ok: false, reason: "generic_only" };
  if (meaningful.length < 2) return { ok: false, reason: "too_few_meaningful_tokens" };
  return { ok: true, reason: null };
}
