// ============================================================================
// 🏢 Office Intelligence — profile extraction (pure). 26.4.18.
// ----------------------------------------------------------------------------
// Turns real public search hits into an evidence-backed OfficeProfileDraft +
// the verification signals (strong sources / independent domains) using the
// SAME rule the verifier uses (proven = ≥1 strong OR ≥2 domains). Deterministic
// (regex + domain classification); AI is optional and never verifies. Nothing is
// fabricated — a field is null/empty unless a real source supports it.
// ============================================================================
import type { EvidenceRef, OfficeProfileDraft, ProfileSignals } from "./types";

export interface Hit { title: string | null; url: string | null; snippet: string | null }

const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
export function normLite(raw: string | null | undefined): string {
  return (raw ?? "").toString().toLowerCase().replace(/["'`׳״]/g, "").replace(/[-־–—_/]/g, " ")
    .replace(/קריי/g, "קרי").replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c).replace(/\s+/g, " ").trim();
}
const phoneRe = /(?:0\d|\+972)[\d\s-]{7,12}\d/g;
const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const BROKERAGE = /תיווך|נדל|מתווכ|נכס|real\s*estate|realty|realtor|re\/?max|remax|anglo|אנגלו|century\s*21|keller|sotheby/i;
const domainOf = (url: string): string => { const m = url.toLowerCase().match(/^https?:\/\/([^/]+)/); return m ? m[1].replace(/^www\./, "") : ""; };
const isFacebook = (d: string) => /facebook\.com/.test(d);
const isInstagram = (d: string) => /instagram\.com/.test(d);
const isLinkedin = (d: string) => /linkedin\.com/.test(d);
const isSocial = (d: string) => isFacebook(d) || isInstagram(d) || isLinkedin(d);
const isDirectory = (d: string) => /b144|dun|yellow|zap\.co|d\.co\.il|easy\.co\.il|144\./.test(d);
const isPortal = (d: string) => /yad2|madlan|nadlan|homeless|onmap|komo/.test(d);
const uniq = (xs: string[]): string[] => [...new Set(xs.filter(Boolean))];

/** Build an evidence-backed profile + verification signals from real hits. */
export function buildProfileDraft(name: string, brand: string | null, branch: string | null, city: string, hits: Hit[]): { profile: OfficeProfileDraft; signals: ProfileSignals } {
  const nameTokens = normLite(name).split(" ").filter((t) => t.length >= 2);
  const cityNorm = normLite(city);
  const brandKnown = !!brand;

  const phones: EvidenceRef[] = [];
  const emails: EvidenceRef[] = [];
  const domains = new Set<string>();
  const socialLinks: string[] = [], directoryLinks: string[] = [], portalLinks: string[] = [], listingLinks: string[] = [];
  const evidenceFound: string[] = [], publicUrls: string[] = [];
  const nameDomains = new Set<string>();          // domains on a name-mention hit → independent evidence
  let strong = 0;
  let website: string | null = null;
  let cityConfirmed = false, brokerageKeywordFound = false;
  let address: string | null = null;
  const otherCities = new Set<string>();
  const CITY_RE = /קריי?ת\s+\S+|תל\s*אביב|חיפה|ירושלים|רעננה|הרצליה|נהריה|עכו|נשר/g;

  for (const h of hits) {
    const text = `${h.title ?? ""} ${h.snippet ?? ""}`.trim();
    const normText = normLite(text);
    const mentionsName = (nameTokens.length > 0 && nameTokens.every((t) => normText.includes(t))) || (brandKnown && BROKERAGE.test(text));
    const brokerage = BROKERAGE.test(text);
    if (brokerage) brokerageKeywordFound = true;
    const cityHit = cityNorm.length > 0 && normText.includes(cityNorm);
    if (mentionsName && cityHit) cityConfirmed = true;
    const dom = h.url ? domainOf(h.url) : "";

    // Phones / emails (only from name-mention hits to avoid unrelated numbers).
    if (mentionsName) {
      for (const p of text.match(phoneRe) ?? []) phones.push({ value: p.replace(/[\s-]/g, ""), sourceUrl: h.url, sourceTitle: h.title });
      for (const e of text.match(emailRe) ?? []) emails.push({ value: e, sourceUrl: h.url, sourceTitle: h.title });
    }
    // Domain classification.
    if (dom) {
      domains.add(dom);
      if (h.url) publicUrls.push(h.url);
      if (mentionsName) nameDomains.add(dom);
      if (isSocial(dom)) { if (h.url) socialLinks.push(h.url); }
      else if (isDirectory(dom)) { if (h.url) directoryLinks.push(h.url); }
      else if (isPortal(dom)) { if (h.url) { portalLinks.push(h.url); listingLinks.push(h.url); } }
      else if (mentionsName && !website) website = dom;   // first real business domain
    }
    // Address (best-effort): a name+city hit that also has a street number.
    if (mentionsName && cityHit && !address && /\d{1,3}/.test(text) && /רחוב|רח׳|שדרות|דרך|כתובת/.test(text)) address = text.slice(0, 120);
    // Contradiction: a name hit mentioning a DIFFERENT city prominently.
    if (mentionsName) for (const m of text.match(CITY_RE) ?? []) { if (!normLite(m).includes(cityNorm) && cityNorm && !cityNorm.includes(normLite(m))) otherCities.add(m.trim()); }

    // Strong source (existing rule): name + brokerage + (in-city OR domain OR phone).
    if (mentionsName && brokerage && (cityHit || dom || (text.match(phoneRe)?.length))) {
      strong++;
      evidenceFound.push(`מקור ציבורי חזק: ${(h.title ?? dom ?? "תוצאה").slice(0, 70)}`);
    }
  }

  const independentDomains = nameDomains.size;
  const proven = strong >= 1 || independentDomains >= 2;   // EXISTING verification rule — unchanged
  const phone = phones[0]?.value ?? null;
  if (phone) evidenceFound.push(`טלפון: ${phone}`);
  for (const d of nameDomains) evidenceFound.push(`${isFacebook(d) ? "Facebook" : isInstagram(d) ? "Instagram" : isLinkedin(d) ? "LinkedIn" : isDirectory(d) ? "מדריך" : isPortal(d) ? "פורטל" : "אתר"}: ${d}`);

  const missingFields: string[] = [];
  if (!website) missingFields.push("אתר/דומיין");
  if (!phone) missingFields.push("טלפון");
  if (!cityConfirmed) missingFields.push("אישור עיר");
  if (socialLinks.length === 0) missingFields.push("רשת חברתית");
  if (!brokerageKeywordFound) missingFields.push("מילת מפתח תיווך");
  if (independentDomains < 2 && strong < 1) missingFields.push("מקור שני בלתי תלוי");
  if (!address) missingFields.push("כתובת");

  const contradictions: string[] = [];
  if (otherCities.size > 0) contradictions.push(`ראיה מזכירה עיר אחרת: ${[...otherCities].slice(0, 3).join(", ")}`);

  // Completeness — fraction of the key evidence-backed fields present.
  const fieldsPresent = [!!website, !!phone, cityConfirmed, socialLinks.length > 0, brokerageKeywordFound, portalLinks.length > 0 || listingLinks.length > 0, !!address, independentDomains >= 2 || strong >= 1];
  const completeness = Math.round((fieldsPresent.filter(Boolean).length / fieldsPresent.length) * 100);

  const profile: OfficeProfileDraft = {
    name, normalizedName: normLite(name), brand, branch, city, cityConfirmed, address,
    phones, emails, website, domains: [...domains], socialLinks: uniq(socialLinks), directoryLinks: uniq(directoryLinks),
    portalLinks: uniq(portalLinks), listingLinks: uniq(listingLinks), brokerNames: [], logoUrl: null,
    brokerageKeywordFound, evidenceSummary: `${strong} מקורות חזקים · ${independentDomains} דומיינים · ${phones.length} טלפונים · ${socialLinks.length} חברתי`,
    missingFields, contradictions, completeness,
  };
  const signals: ProfileSignals = { strongSources: strong, independentDomains, proven, phone, publicUrls: uniq(publicUrls), evidenceFound: [...new Set(evidenceFound)].slice(0, 12) };
  return { profile, signals };
}
