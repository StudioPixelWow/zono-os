// ============================================================================
// ✅ Research Agent — public-evidence verifier (server-only-safe, pure logic).
// Phase 26.4.13.
// ----------------------------------------------------------------------------
// An office is only VERIFIED by real public evidence: its name + a brokerage
// signal + (in-city OR a real domain/phone). AI never verifies. Promotion rule:
// ≥1 strong public source OR ≥2 independent public domains.
// ============================================================================
import { detectFranchise } from "../franchise";
import { normalizeHebrewName, normalizePhoneNumber } from "../normalize";
import { crossRefQueries, type Vendor } from "./search";

const phoneRe = /(?:0\d|\+972)[\d\s-]{7,12}\d/;
const BROKERAGE_SIGNAL = /תיווך|נדל|מתווכ|נכס|real\s*estate|realty|realtor|re\/?max|remax|anglo|אנגלו|century\s*21|keller|sotheby/i;
const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
function normCity(raw: string): string {
  return (raw ?? "").trim().replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ")
    .replace(/קריי/g, "קרי").replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ").trim().toLowerCase();
}
const urlDomain = (url: string): string => { const m = url.toLowerCase().match(/^https?:\/\/([^/]+)/); return m ? m[1].replace(/^www\./, "") : ""; };

export interface VerifyOutcome {
  strong: number; domains: Set<string>; evidenceFound: string[]; sourcesChecked: string[];
  phone: string | null; publicUrls: string[]; proven: boolean;
}

/** Cross-reference an office name against public sources (bounded). */
export async function verifyOffice(vendor: Vendor, name: string, city: string, brandKnown: boolean, maxQueries = 2): Promise<VerifyOutcome> {
  const out: VerifyOutcome = { strong: 0, domains: new Set(), evidenceFound: [], sourcesChecked: [], phone: null, publicUrls: [], proven: false };
  const cityNorm = normCity(city);
  const nameTokens = normalizeHebrewName(name).split(/\s+/).filter((t) => t.length >= 2);
  const queries = crossRefQueries(name, city).slice(0, maxQueries);
  const runs = await Promise.all(queries.map(async (q) => {
    out.sourcesChecked.push(q);
    try { return await vendor.run(q); } catch { return []; }
  }));
  for (const hits of runs) {
    for (const h of hits.slice(0, 5)) {
      const text = `${h.title ?? ""} ${h.snippet ?? ""}`.trim();
      const normText = normalizeHebrewName(text);
      const mentionsName = (nameTokens.length > 0 && nameTokens.every((t) => normText.includes(t))) || (brandKnown && detectFranchise(text).matched);
      const brokerage = BROKERAGE_SIGNAL.test(text) || detectFranchise(text).matched;
      const cityHit = cityNorm.length > 0 && normCity(text).includes(cityNorm);
      const dom = h.url ? urlDomain(h.url) : "";
      const ph = text.match(phoneRe)?.[0] ?? null;
      if (mentionsName && dom) { out.domains.add(dom); if (h.url && !out.publicUrls.includes(h.url)) out.publicUrls.push(h.url); }
      if (mentionsName && ph && !out.phone) { const np = normalizePhoneNumber(ph); if (np) { out.phone = np; out.evidenceFound.push(`טלפון: ${np}`); } }
      if (mentionsName && dom) out.evidenceFound.push(`${/facebook\.com/.test(dom) ? "Facebook" : "אתר/דומיין"}: ${dom}`);
      if (mentionsName && brokerage && (cityHit || dom || ph)) { out.strong++; out.evidenceFound.push(`מקור ציבורי חזק: ${(h.title ?? dom ?? "תוצאה").slice(0, 70)}`); }
    }
  }
  out.evidenceFound = [...new Set(out.evidenceFound)].slice(0, 8);
  out.proven = out.strong >= 1 || out.domains.size >= 2;
  return out;
}

/** Evidence-based system confidence (0..92) — never the AI's own confidence. */
export function systemConfidenceFrom(v: VerifyOutcome): number {
  return Math.max(0, Math.min(92, (v.strong > 0 ? 30 : 0) + Math.min(2, v.strong) * 18 + Math.min(3, v.domains.size) * 8 + (v.phone ? 6 : 0)));
}
