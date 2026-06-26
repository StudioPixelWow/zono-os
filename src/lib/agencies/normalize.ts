// ============================================================================
// ZONO — Agency normalization utilities (Phase 26.0, PURE / client-safe).
// Canonicalize agency names for matching + generate stable slugs. Handles both
// Hebrew and English: strips legal suffixes, collapses whitespace, lowercases,
// removes punctuation/niqqud. Deterministic — same input → same output.
// ============================================================================

// Legal / business suffixes to drop (Hebrew + English).
const LEGAL_SUFFIXES = [
  "בעמ", "בע״מ", "בע״מ", 'בע"מ',
  "חברה", "נדלן", "נדל״ן", 'נדל"ן', "תיווך", "נכסים", "ריאלטי",
  "ltd", "limited", "inc", "incorporated", "llc", "co", "company",
  "realty", "real estate", "properties", "group", "holdings", "re/max", "remax",
];

const NIQQUD = /[֑-ׇ]/g;        // Hebrew cantillation + vowel points
// Quote family (straight + curly + Hebrew geresh ׳ / gershayim ״): part of Hebrew
// acronyms (נדל״ן, בע״מ) — strip WITHOUT a space so the word stays intact.
const QUOTES = /['"`’‘“”״׳]/g;
const PUNCT = /[.,()\[\]{}|/\\\-_–—•·:;!?@#$%^&*+=~]/g;

/** Collapse runs of whitespace to a single space and trim. */
function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Canonical, comparison-grade name. Lowercased, niqqud + punctuation stripped,
 * legal suffixes removed, whitespace collapsed. Never throws; "" → "".
 */
export function normalizeAgencyName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.normalize("NFKC").replace(NIQQUD, "").toLowerCase();
  s = s.replace(QUOTES, "");      // acronym quotes vanish (no split)
  s = s.replace(PUNCT, " ");
  s = collapseSpaces(s);
  if (!s) return "";
  // Remove standalone legal-suffix tokens (whole-word only).
  const drop = new Set(LEGAL_SUFFIXES.map((x) => x.toLowerCase()));
  const kept = s.split(" ").filter((tok) => tok && !drop.has(tok));
  // "real estate" is two tokens — also strip the bigram if present.
  const out = collapseSpaces(kept.join(" ")).replace(/\breal estate\b/g, "");
  return collapseSpaces(out) || collapseSpaces(s);
}

/**
 * URL/route-safe slug. Latin → kebab-case; Hebrew (and other non-latin) is kept
 * as readable unicode kebab so slugs stay meaningful for RTL agencies.
 */
export function agencySlug(raw: string | null | undefined): string {
  const base = normalizeAgencyName(raw);
  if (!base) return "agency";
  const slug = base
    .replace(/[^a-z0-9֐-׿]+/g, "-") // keep latin alphanum + Hebrew block
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "agency";
}

/** Digits-only phone for comparison (drops +, spaces, dashes, leading 0/972). */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

/** Bare host for comparison: lowercased, no scheme / www / trailing slash. */
export function normalizeWebsite(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .split("/")[0] ?? "";
}

/** Lowercased, trimmed email for comparison. */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}
