// ============================================================================
// ZONO — Agency brand/franchise detector (Phase 26.2, PURE).
// Detects known real-estate franchises in raw text (HE + EN spellings) and
// returns the canonical brand. Also flags listing PLATFORMS (Yad2/Madlan) which
// are NOT agencies. Deterministic.
// ============================================================================
import type { BrandDetection } from "./agencyIdentityTypes";

interface BrandDef { canonical: string; franchise: boolean; isPlatform?: boolean; tokens: string[] }

// Order matters: more specific tokens first.
const BRANDS: BrandDef[] = [
  { canonical: "RE/MAX", franchise: true, tokens: ["re/max", "remax", "re max", "רימקס", "רי/מקס", "רי מקס", "רי-מקס"] },
  { canonical: "Keller Williams", franchise: true, tokens: ["keller williams", "kw", "קלר וויליאמס", "קיי דאבליו", "קיידאבליו"] },
  { canonical: "Anglo Saxon", franchise: true, tokens: ["anglo saxon", "anglo-saxon", "אנגלו סכסון", "אנגלו-סכסון"] },
  { canonical: "Century 21", franchise: true, tokens: ["century 21", "century21", "סנצ'ורי 21", "סנצורי 21", "סנצ׳ורי 21"] },
  { canonical: "Home Land", franchise: true, tokens: ["home land", "homeland", "הום לנד", "הומלנד"] },
  { canonical: "Nadlan Center", franchise: true, tokens: ["nadlan center", "מרכז הנדלן", "מרכז הנדל\"ן", "נדלן סנטר"] },
  { canonical: "Real Capital", franchise: true, tokens: ["real capital", "ריאל קפיטל"] },
  { canonical: "Homely", franchise: true, tokens: ["homely", "הומלי"] },
  { canonical: "WinWin", franchise: false, isPlatform: true, tokens: ["winwin", "win win", "וין וין", "ווין ווין"] },
  { canonical: "Madlan", franchise: false, isPlatform: true, tokens: ["madlan", "מדלן"] },
  { canonical: "Yad2", franchise: false, isPlatform: true, tokens: ["yad2", "yad 2", "יד2", "יד 2"] },
];

const NORM = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[„""׳]/g, "").replace(/\s+/g, " ").trim();

export function detectAgencyBrand(rawText: string): BrandDetection {
  const hay = NORM(rawText);
  for (const b of BRANDS) {
    for (const tok of b.tokens) {
      const t = NORM(tok);
      // word-ish boundary check (Hebrew has no \b; use surrounding non-letter or ends)
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u");
      if (re.test(` ${hay} `) || hay === t) {
        return {
          brandName: b.canonical, franchiseName: b.franchise ? b.canonical : null,
          normalizedBrand: NORM(b.canonical), matchedToken: tok,
          isFranchise: b.franchise, confidence: b.isPlatform ? 0.5 : 0.95,
        };
      }
    }
  }
  return { brandName: null, franchiseName: null, normalizedBrand: null, matchedToken: null, isFranchise: false, confidence: 0 };
}

/** Is this raw text primarily a listing platform (not an agency)? */
export function isListingPlatform(rawText: string): boolean {
  const hay = NORM(rawText);
  return BRANDS.some((b) => b.isPlatform && b.tokens.some((t) => hay === NORM(t) || hay.includes(NORM(t))));
}
