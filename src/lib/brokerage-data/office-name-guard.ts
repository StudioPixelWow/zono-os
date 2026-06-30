// ============================================================================
// 🛡️ Office-name guard (Phase 26.13c). PURE, client-safe — no DB, no AI.
// ----------------------------------------------------------------------------
// THE single source of truth for "is this string an OFFICE name, or just an
// individual broker's personal name?". An office name is acceptable ONLY when it
// carries real company evidence: a known brand (RE/MAX, אנגלו סכסון, …) OR a
// generic office/company keyword (נדל"ן, תיווך, נכסים, משרד, Group, Realty, …).
// Everything else (e.g. "נדב רייזר", "אייל שמול", "ריקי ברק", "בן") is an
// individual person and must NEVER become a brokerage office.
//
// Used at EVERY office-creation path: shared-phone clusters, registry hints +
// candidates + verification, research candidates, AI-suggested names.
// ============================================================================
import { detectFranchise } from "./franchise";

// Generic company / office keywords (Hebrew + English) — presence of any one of
// these is treated as company evidence (a brand is detected separately).
const OFFICE_KEYWORD_RE = new RegExp(
  [
    "נדל\"?ן", "נדלן", "תיווך", "נכסים", "משרד", "סוכנות", "קבוצת", "קבוצה",
    "real\\s*estate", "realty", "properties", "property", "estate", "agency",
    "\\bgroup\\b", "\\bhomes?\\b", "\\bbroker(s|age)?\\b", "re/?max", "רימקס", "רי/?מקס",
    "אנגלו", "century\\s*21", "סנצ'?ורי", "keller\\s*williams", "\\bkw\\b", "\\bera\\b",
    "homeland", "sotheby", "coldwell",
  ].join("|"),
  "i",
);

export interface OfficeNameVerdict {
  acceptable: boolean;         // true → may become an office
  reason: string;              // machine reason when blocked
  brandNetwork: string | null; // detected brand, if any
}

/** Whether a string carries company/brand evidence (vs. a personal name). */
export function isAcceptableOfficeName(rawName: string | null | undefined): boolean {
  return classifyOfficeName(rawName).acceptable;
}

/** Full verdict + reason (for diagnostics / audit). */
export function classifyOfficeName(rawName: string | null | undefined): OfficeNameVerdict {
  const name = (rawName ?? "").trim();
  if (name.length < 2) return { acceptable: false, reason: "candidate_name_empty", brandNetwork: null };
  const fr = detectFranchise(name);
  if (fr.matched) return { acceptable: true, reason: "brand_detected", brandNetwork: fr.brandNetwork };
  if (OFFICE_KEYWORD_RE.test(name)) return { acceptable: true, reason: "office_keyword", brandNetwork: null };
  // No brand, no office keyword → an individual broker name. Never an office.
  return { acceptable: false, reason: "candidate_name_is_individual_broker", brandNetwork: null };
}

/** The canonical SQL fragment for the same rule (for cleanup migrations). Kept
 *  here as documentation; the migration embeds an equivalent regex. */
export const OFFICE_KEYWORD_SQL_REGEX =
  "(נדל\"?ן|נדלן|תיווך|נכסים|משרד|סוכנות|קבוצת|real ?estate|realty|properties|estate|agency|group|home|broker|re/?max|רימקס|רי/?מקס|אנגלו|century ?21|סנצ.?ורי|keller ?williams|kw|era|homeland|sotheby|coldwell)";
