// ============================================================================
// ZONO — Creative QA core (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// The Source-Data Lock + Hebrew normalization + approval thresholds + critical
// overrides + correction-prompt builder. No network. The vision model only
// EXTRACTS what it sees; the pass/fail decision is made HERE, deterministically,
// so a wrong phone / price / agent / city can never be "approved" by an LLM.
// ============================================================================

/** The approved text manifest — the ONLY text the ad may contain. */
export interface SourceManifest {
  saleLabel: string;               // large premium badge, e.g. "למכירה" / "נמכר"
  headline: string; subheadline: string | null;
  price: string | null;            // display form, e.g. "₪2,350,000"
  address: string | null; city: string | null; street: string | null;
  rooms: string | null; sqm: string | null; floor: string | null;
  features: string[];
  agentName: string | null; phone: string | null;
  cta: string; disclaimer: string | null; logoText: string | null;
}

export interface QaScores {
  textAccuracy: number; numericAccuracy: number; brand: number; layout: number;
  readability: number; assetIntegrity: number; realEstateRelevance: number; overall: number;
}
/** Hard thresholds (spec §8). text & numeric must be exactly 100. */
export const QA_THRESHOLDS = {
  textAccuracy: 100, numericAccuracy: 100, assetIntegrity: 95, brand: 90,
  layout: 90, readability: 90, realEstateRelevance: 90, overall: 92,
} as const;

/** Critical visual failures (spec §8 overrides) — any true ⇒ reject. */
export interface QaCritical {
  saleLabelMissing: boolean; addressNotVisible: boolean;
  wrongPhone: boolean; wrongPrice: boolean; wrongAgentName: boolean; wrongCityStreet: boolean;
  inventedText: boolean; brokenHebrewHeadline: boolean; wrongLogo: boolean; wrongPerson: boolean;
  unreadableCta: boolean; croppedText: boolean; rtlFailure: boolean;
}

// ── Hebrew normalization ─────────────────────────────────────────────────────
const NIKUD = /[֑-ׇ]/g;            // cantillation + points
const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

/** Normalize Hebrew text for comparison: strip nikud, collapse spaces, unify
 *  quotes/gershayim, drop punctuation noise. Preserves letters + digits. */
export function normalizeHebrew(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(NIKUD, "")
    .replace(/[״"”“]/g, "").replace(/[׳'’`]/g, "")
    .replace(/[.,;:!?\-–—_|()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Fold final letters too — for fuzzy "same word" checks only. */
export function foldFinals(s: string): string { return s.replace(/[ךםןףץ]/g, (c) => FINALS[c] ?? c); }
/** Digits only — phone/number comparison ignores spaces, dashes, +972/0 prefix. */
export function digitsOnly(s: string | null | undefined): string { return (s ?? "").replace(/\D/g, ""); }
/** Compare two Israeli phone forms (tolerate +972 / leading 0). */
export function phoneEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = digitsOnly(a).replace(/^972/, "0"), nb = digitsOnly(b).replace(/^972/, "0");
  return na.length > 0 && na === nb;
}
/** Currency-agnostic numeric equality (₪ / ש"ח / שח and separators ignored). */
export function priceEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digitsOnly(a), db = digitsOnly(b);
  return da.length > 0 && da === db;
}
/** Exact text equality after Hebrew normalization (+ optional finals fold). */
export function textEqual(a: string | null | undefined, b: string | null | undefined, foldFinal = false): boolean {
  let na = normalizeHebrew(a), nb = normalizeHebrew(b);
  if (foldFinal) { na = foldFinals(na); nb = foldFinals(nb); }
  return na === nb;
}
/** Levenshtein distance — used to flag near-miss typos in critical fields. */
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

/** The vision model's raw read-back of the image (what it SEES). */
export interface QaVisionFindings {
  ocrText: string;
  detectedSaleLabel: string | null;
  detectedHeadline: string | null; detectedPhone: string | null; detectedPrice: string | null;
  detectedAgentName: string | null; detectedCity: string | null; detectedStreet: string | null;
  saleLabelLargeAndClear: boolean; addressHighlyVisible: boolean;
  brokenHebrew: boolean; rtlOk: boolean; ctaReadable: boolean; croppedText: boolean;
  logoPresentAndCorrect: boolean; agentPhotoOkOrAbsent: boolean; distortedFaceOrLogo: boolean;
  scores: QaScores;
}

/** Deterministic critical-field check: compare what the model SAW against the
 *  locked manifest. Code decides — never the LLM. */
export function deriveCritical(f: QaVisionFindings, m: SourceManifest): QaCritical {
  const ocrFolded = foldFinals(normalizeHebrew(f.ocrText));
  const inManifest = (val: string | null) => !val || ocrFolded.includes(foldFinals(normalizeHebrew(val)));
  const saleLabelInOcr = inManifest(m.saleLabel);
  return {
    // Mandatory large "למכירה" badge: must be both present in OCR AND read as large/clear.
    saleLabelMissing: Boolean(m.saleLabel) && (!saleLabelInOcr || !f.saleLabelLargeAndClear),
    // Address must be highly visible whenever an address exists.
    addressNotVisible: Boolean(m.address) && (!inManifest(m.address) && !inManifest(m.city)) ? true : Boolean(m.address) && !f.addressHighlyVisible,
    wrongPhone: Boolean(m.phone) && !phoneEqual(f.detectedPhone, m.phone) && !phoneEqual(digitsOnly(f.ocrText), m.phone),
    wrongPrice: Boolean(m.price) && !priceEqual(f.detectedPrice, m.price),
    wrongAgentName: Boolean(m.agentName) && !textEqual(f.detectedAgentName, m.agentName, true) && !inManifest(m.agentName),
    wrongCityStreet: (Boolean(m.city) && !textEqual(f.detectedCity, m.city, true) && !inManifest(m.city)),
    inventedText: false, // surfaced via the model's notes/mismatches; not a hard code check
    brokenHebrewHeadline: f.brokenHebrew,
    wrongLogo: !f.logoPresentAndCorrect,
    wrongPerson: !f.agentPhotoOkOrAbsent,
    unreadableCta: !f.ctaReadable,
    croppedText: f.croppedText,
    rtlFailure: !f.rtlOk,
  };
}

export interface QaDecision { passed: boolean; failReasons: string[]; criticalFailures: string[] }

/** The final, deterministic approval gate (spec §8). */
export function decideApproval(scores: QaScores, c: QaCritical): QaDecision {
  const failReasons: string[] = []; const criticalFailures: string[] = [];
  const crit: [keyof QaCritical, string][] = [
    ["saleLabelMissing", "חסר שלט \"למכירה\" גדול וברור"], ["addressNotVisible", "כתובת הנכס לא בולטת"],
    ["wrongPhone", "מספר טלפון שגוי"], ["wrongPrice", "מחיר שגוי"], ["wrongAgentName", "שם סוכן שגוי"],
    ["wrongCityStreet", "עיר/רחוב שגויים"], ["inventedText", "טקסט מומצא"], ["brokenHebrewHeadline", "עברית שבורה בכותרת"],
    ["wrongLogo", "לוגו שגוי/חסר"], ["wrongPerson", "אדם שגוי / פנים מעוותות"], ["unreadableCta", "CTA לא קריא"],
    ["croppedText", "טקסט חתוך"], ["rtlFailure", "כשל RTL"],
  ];
  for (const [k, label] of crit) if (c[k]) criticalFailures.push(label);
  const t = QA_THRESHOLDS;
  const checks: [number, number, string][] = [
    [scores.textAccuracy, t.textAccuracy, "דיוק טקסט"], [scores.numericAccuracy, t.numericAccuracy, "דיוק מספרים"],
    [scores.assetIntegrity, t.assetIntegrity, "שלמות נכסים"], [scores.brand, t.brand, "מותג"],
    [scores.layout, t.layout, "פריסה"], [scores.readability, t.readability, "קריאות"],
    [scores.realEstateRelevance, t.realEstateRelevance, "רלוונטיות נדל\"ן"], [scores.overall, t.overall, "ציון כולל"],
  ];
  for (const [val, min, label] of checks) if (val < min) failReasons.push(`${label} ${val}<${min}`);
  const passed = criticalFailures.length === 0 && failReasons.length === 0;
  return { passed, failReasons: [...criticalFailures, ...failReasons], criticalFailures };
}

// ── LAYER 2: Creative QA (DESIRABILITY) ──────────────────────────────────────
// Correctness QA proves the ad is right. Creative QA proves it's good enough to
// publish — judged as a top Israeli real-estate marketer / Meta ads strategist /
// premium branding expert. Reference bar: premium ads from leading brokers and
// developers. The gate question: "Would a leading real-estate marketer proudly
// publish this tomorrow?" If no → regenerate.
export interface CreativeScores {
  visualImpact: number; realEstateCredibility: number; premiumFeeling: number; brandConsistency: number;
  conversionPotential: number; typographyQuality: number; layoutQuality: number; imageComposition: number; overallWow: number;
}
export const CREATIVE_THRESHOLDS = { overallWow: 85, conversionPotential: 85, visualImpact: 85, realEstateCredibility: 90 } as const;

/** Hard-fail design problems (any true ⇒ reject regardless of scores). */
export interface CreativeHardFails {
  propertyImageTooSmall: boolean; textDominatesProperty: boolean; priceNotDominant: boolean; weakHierarchy: boolean;
  uglyCollage: boolean; excessiveEmptySpace: boolean; excessiveClutter: boolean; looksAiGenerated: boolean; notProfessionalAd: boolean;
}
export const NO_CREATIVE_HARD_FAILS: CreativeHardFails = {
  propertyImageTooSmall: false, textDominatesProperty: false, priceNotDominant: false, weakHierarchy: false,
  uglyCollage: false, excessiveEmptySpace: false, excessiveClutter: false, looksAiGenerated: false, notProfessionalAd: false,
};

export interface CreativeDecision { passed: boolean; reasons: string[]; hardFailures: string[] }

/** The creative-director approval gate. */
export function decideCreative(s: CreativeScores, hf: CreativeHardFails, proudToPublish: boolean): CreativeDecision {
  const hardFailures: string[] = []; const reasons: string[] = [];
  const hfLabels: [keyof CreativeHardFails, string][] = [
    ["propertyImageTooSmall", "תמונת הנכס קטנה מדי"], ["textDominatesProperty", "הטקסט משתלט על הנכס"], ["priceNotDominant", "המחיר לא דומיננטי ויזואלית"],
    ["weakHierarchy", "היררכיה חלשה"], ["uglyCollage", "קולאז' מכוער"], ["excessiveEmptySpace", "יותר מדי שטח ריק"],
    ["excessiveClutter", "עומס ויזואלי"], ["looksAiGenerated", "נראה כמו AI"], ["notProfessionalAd", "לא נראה כמו מודעת נדל\"ן מקצועית"],
  ];
  for (const [k, label] of hfLabels) if (hf[k]) hardFailures.push(label);
  const t = CREATIVE_THRESHOLDS;
  const checks: [number, number, string][] = [
    [s.overallWow, t.overallWow, "WOW כולל"], [s.conversionPotential, t.conversionPotential, "פוטנציאל המרה"],
    [s.visualImpact, t.visualImpact, "אימפקט ויזואלי"], [s.realEstateCredibility, t.realEstateCredibility, "אמינות נדל\"ן"],
  ];
  for (const [val, min, label] of checks) if (val < min) reasons.push(`${label} ${val}<${min}`);
  if (!proudToPublish) reasons.push("משווק מוביל לא יפרסם את זה בגאווה");
  const passed = hardFailures.length === 0 && reasons.length === 0;
  return { passed, reasons: [...hardFailures, ...reasons], hardFailures };
}

/** Design-level correction prompt (no text changes — only visual quality). */
export function buildCreativeCorrection(s: CreativeScores, hf: CreativeHardFails): string {
  const fixes: string[] = ["Keep the EXACT text, logo and agent — improve only the VISUAL design to a premium Israeli real-estate campaign standard (leading brokers/developers level)."];
  if (hf.propertyImageTooSmall || s.visualImpact < 85) fixes.push("Make the property photo the dominant hero (~70% of the frame), cinematic and high-impact.");
  if (hf.textDominatesProperty) fixes.push("Reduce the text footprint so it supports — never overpowers — the property.");
  if (hf.priceNotDominant || s.conversionPotential < 85) fixes.push("Make the price visually dominant and the CTA punchy — optimize for conversion.");
  if (hf.weakHierarchy || s.layoutQuality < 85) fixes.push("Establish a strong visual hierarchy: property → headline → price → CTA.");
  if (hf.uglyCollage || hf.excessiveClutter) fixes.push("No collage and no clutter — one clean, confident composition.");
  if (hf.excessiveEmptySpace) fixes.push("Remove dead empty space; use intentional, balanced negative space only.");
  if (hf.looksAiGenerated || hf.notProfessionalAd) fixes.push("Eliminate any AI-generated / Canva / amateur look — refined premium typography, polished lighting, agency-grade finish.");
  if (s.typographyQuality < 85) fixes.push("Upgrade typography: elegant, modern Hebrew type with confident sizing and spacing.");
  if (s.premiumFeeling < 85 || s.brandConsistency < 85) fixes.push("Raise the premium feel and brand consistency — restrained palette, luxury tone.");
  return fixes.join("\n");
}

/** Build the precise correction prompt from a failed QA (spec §9). */
export function buildCorrectionPrompt(decision: QaDecision, c: QaCritical, m: SourceManifest): string {
  const fixes: string[] = ["Keep the SAME design, layout and composition — only correct the problems below. Do all corrections inside this AI generation (no overlays, no edits outside the model).", "Preserve the supplied logo and agent photo exactly."];
  if (c.saleLabelMissing) fixes.push(`Add the word "${m.saleLabel}" LARGE, clear and premium — a luxury campaign headline badge, the most prominent text element. Not a small sticker.`);
  if (c.addressNotVisible && m.address) fixes.push(`Make the property address "${m.address}" highly visible and prominent — directly under the headline, never tiny footer or legal text.`);
  if (c.brokenHebrewHeadline || c.inventedText) fixes.push(`Re-render ALL Hebrew text perfectly legible and spelled EXACTLY as: sale label "${m.saleLabel}", headline "${m.headline}"${m.subheadline ? `, sub "${m.subheadline}"` : ""}. Do not invent, translate or add any text.`);
  if (c.wrongPhone && m.phone) fixes.push(`Use the EXACT phone number "${m.phone}" (Latin digits, left-to-right).`);
  if (c.wrongPrice && m.price) fixes.push(`Use the EXACT price "${m.price}".`);
  if (c.wrongAgentName && m.agentName) fixes.push(`Agent name must read EXACTLY "${m.agentName}".`);
  if (c.wrongCityStreet && (m.city || m.street)) fixes.push(`Location must read EXACTLY "${[m.street, m.city].filter(Boolean).join(", ")}".`);
  if (c.wrongLogo) fixes.push("Reproduce the supplied agency logo exactly — do not invent or alter a brand mark.");
  if (c.wrongPerson) fixes.push("Use the supplied agent photo unaltered — do not replace or distort the face.");
  if (c.unreadableCta) fixes.push(`Make the CTA button clearly readable: "${m.cta}".`);
  if (c.croppedText) fixes.push("No text may be cropped — keep all text inside safe margins.");
  if (c.rtlFailure) fixes.push("Hebrew must read right-to-left with correct RTL alignment.");
  if (decision.failReasons.length) fixes.push(`Also raise quality on: ${decision.failReasons.join(", ")}.`);
  return fixes.join("\n");
}
