// ============================================================================
// 🏷️ Franchise Resolver (Phase 26.11). PURE + client-safe — no DB, no AI, no I/O.
// ----------------------------------------------------------------------------
// Detects known Israeli brokerage brand networks from a raw office/broker name
// and normalizes the many Hebrew/English/transliterated variants to one
// canonical brand. Also derives the branch name (the part that isn't the brand).
// Deterministic. Never invents a brand — returns "independent" when no known
// brand is matched.
// ============================================================================

export interface FranchiseMatch {
  brandNetwork: string;       // canonical display (e.g. "RE/MAX") or "independent"
  normalizedBrand: string;    // canonical key (e.g. "remax") or "independent"
  officeBranchName: string | null;   // the residual branch label, if any
  normalizedOfficeName: string;       // normalized full office name
  matched: boolean;           // true when a known brand was detected
}

interface BrandDef { network: string; key: string; patterns: RegExp[] }

// Canonical Israeli brokerage networks + their common variants (he/en/translit).
const BRANDS: BrandDef[] = [
  { network: "RE/MAX", key: "remax", patterns: [/re\s*\/?\s*max/i, /רי\s*\/?\s*מקס/, /רימקס/, /ריmax/i] },
  { network: "Anglo Saxon", key: "anglo_saxon", patterns: [/anglo\s*saxon/i, /anglo[- ]?saxon/i, /אנגלו\s*סקסון/, /אנגלו[\s-]?סכסון/, /\bאנגלו\b/] },
  { network: "Century 21", key: "century21", patterns: [/century\s*21/i, /century21/i, /סנצ'?ורי\s*21/, /סנצ׳ורי\s*21/, /סנצורי\s*21/] },
  { network: "Keller Williams", key: "keller_williams", patterns: [/keller\s*williams/i, /\bkw\b/i, /קלר\s*ויליאמס/, /קלר\s*וויליאמס/] },
  { network: "ERA", key: "era", patterns: [/\bera\b/i, /\bא\.?ר\.?א\b/, /\bעידן\b.*נדל/] },
  { network: "HomeLand", key: "homeland", patterns: [/home\s*land/i, /homeland/i, /הומלנד/, /הום\s*לנד/] },
  { network: "Sotheby's", key: "sothebys", patterns: [/sotheby'?s/i, /סות'?ביס/, /סותביס/] },
  { network: "Coldwell Banker", key: "coldwell_banker", patterns: [/coldwell\s*banker/i, /קולדוול\s*בנקר/] },
  { network: "First", key: "first_israel", patterns: [/\bfirst\b.*(נדל|real)/i, /פירסט\s*ישראל/, /\bפירסט\b/] },
  { network: "Tivuch Shalom", key: "tivuch_shalom", patterns: [/תיווך\s*שלום/, /tivuch\s*shalom/i] },
  { network: "Yaniv Nadlan", key: "yaniv", patterns: [/יניב\s*נדל/] },
];

/** Lightweight normalizer: trims, collapses whitespace, drops common noise. */
export function normalizeOfficeName(raw: string): string {
  return (raw ?? "")
    .replace(/[‎‏]/g, "")
    .replace(/["'`׳״]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\b(נדל"?ן|נדלן|תיווך|real\s*estate|realty|נכסים)\b/gi, "")
    .trim()
    .toLowerCase();
}

/** Detect the brand network and derive the branch name. Pure & deterministic. */
export function detectFranchise(rawName: string): FranchiseMatch {
  const name = (rawName ?? "").trim();
  const normalizedOfficeName = normalizeOfficeName(name);
  for (const b of BRANDS) {
    if (b.patterns.some((re) => re.test(name))) {
      // Branch = the name with the brand tokens stripped (best-effort, observed only).
      let branch = name;
      for (const re of b.patterns) branch = branch.replace(re, " ");
      branch = branch.replace(/[‎‏"'`׳״]/g, "").replace(/\s+/g, " ").trim();
      return {
        brandNetwork: b.network, normalizedBrand: b.key,
        officeBranchName: branch.length >= 2 ? branch : null,
        normalizedOfficeName, matched: true,
      };
    }
  }
  return { brandNetwork: "independent", normalizedBrand: "independent", officeBranchName: null, normalizedOfficeName, matched: false };
}

/** Whether two names likely refer to the same brand (variant match). */
export function sameBrand(a: string, b: string): boolean {
  const fa = detectFranchise(a), fb = detectFranchise(b);
  return fa.matched && fb.matched && fa.normalizedBrand === fb.normalizedBrand;
}

/** The set of canonical brand display names (for UI filters / seeding). */
export const KNOWN_BRAND_NETWORKS: string[] = BRANDS.map((b) => b.network);
