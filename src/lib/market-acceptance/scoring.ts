// ============================================================================
// Market Acceptance Intelligence™ — MAI-3 scoring (PURE, deterministic).
//
// Interprets the MAI-2 signal-set into three cautious confidence models +
// a classification + explainable evidence. NO LLM calls, NO randomness, NO fake
// data. DISAPPEARED is a fact; SOLD is not — so the strongest claim is "likely".
// OFFICIAL_TRANSACTION_FOUND is only emitted when a real official transaction
// match is supplied (none exists in MAI-3, so it is never produced here).
// ============================================================================
import type {
  AcceptanceEvidence, MarketAcceptanceClassification, MarketAcceptanceScore, SignalSet,
} from "./types";

export interface AcceptanceScoringInput {
  signals: SignalSet;
  /** A REAL per-listing official transaction match. Absent in MAI-3 (city-level
   *  proximity is NOT a match) — defaults false so we never imply a sale. */
  officialTransactionMatched?: boolean;
}

// ── Thresholds (single source of truth; cautious by design) ─────────────────
export const EXIT_LIKELY = 70;
export const EXIT_ACCEPTED = 80;
export const ACCEPTED_MIN = 70;
export const REJECTED_MIN = 75;
const REAL_AGE_DAYS = 7;       // a listing this old is "real" enough to interpret
const REALISTIC_DOM_MIN = 14;  // realistic marketing duration before an exit
const REALISTIC_DOM_MAX = 365;
const DUP_HIGH = 60;           // suspected-duplicate confidence considered "high"

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const sval = (s: SignalSet, n: string): number | boolean | string | null => s[n]?.value ?? null;
const snum = (s: SignalSet, n: string): number | null => { const v = s[n]?.value; return typeof v === "number" && Number.isFinite(v) ? v : null; };
const sbool = (s: SignalSet, n: string): boolean | null => { const v = s[n]?.value; return typeof v === "boolean" ? v : null; };
const sconf = (s: SignalSet, n: string): number => s[n]?.confidence ?? 0;

function ev(
  type: AcceptanceEvidence["type"], label: string, signal: string,
  value: AcceptanceEvidence["value"], weight: number, s: SignalSet,
): AcceptanceEvidence {
  return { type, label, signal, value, weight, source: s[signal]?.source ?? "market_listing_signals", confidence: sconf(s, signal) };
}

/**
 * Deterministically score one listing's market acceptance. Same signals always
 * produce the same scores, classification and evidence.
 */
export function scoreMarketAcceptance(input: AcceptanceScoringInput): MarketAcceptanceScore {
  const s = input.signals;
  const evidence: AcceptanceEvidence[] = [];

  const missing = sbool(s, "CurrentlyMissing") === true;
  const active = sbool(s, "StillActive") === true;
  const returned = sbool(s, "ReturnedAfterDisappear") === true;
  const lastSeen = snum(s, "LastSeenDaysAgo");
  const age = snum(s, "ListingAge") ?? snum(s, "DaysOnMarket");
  const dom = snum(s, "DaysOnMarket") ?? age;
  const timesDisappeared = snum(s, "TimesDisappeared") ?? 0;
  const dupConf = snum(s, "DuplicateConfidence") ?? 0;
  const providerCount = snum(s, "ProviderCount") ?? 1;
  const priceChanges = snum(s, "PriceChangesCount") ?? 0;
  const avgReduction = snum(s, "AveragePriceReduction");
  const momentum = snum(s, "PriceMomentum");
  const dealsNearby = snum(s, "RecentOfficialDealsNearby") ?? 0;
  const dealsAvailable = sconf(s, "RecentOfficialDealsNearby") >= 1;

  // ── 1) Market EXIT confidence ──────────────────────────────────────────────
  let exit = 0;
  if (missing) {
    exit += 35; evidence.push(ev("positive", "הנכס אינו מוצג יותר במקור החיצוני", "CurrentlyMissing", true, 35, s));
    if (lastSeen != null) {
      const lb = Math.min(28, Math.round(lastSeen * 2));
      exit += lb;
      if (lb > 0) evidence.push(ev("positive", `הנכס נעלם מהשוק לפני ${lastSeen} ימים`, "LastSeenDaysAgo", lastSeen, lb, s));
    }
    if (age != null) {
      if (age >= REAL_AGE_DAYS) { exit += 10; evidence.push(ev("positive", "משך חיים ריאלי למודעה לפני ההיעלמות", "ListingAge", age, 10, s)); }
      else if (age < 3) { exit -= 15; evidence.push(ev("negative", "משך החיים של המודעה קצר מדי", "ListingAge", age, -15, s)); }
    }
    if (providerCount <= 1) { exit += 5; evidence.push(ev("neutral", "המודעה מופיעה במקור יחיד", "ProviderCount", providerCount, 5, s)); }
    if (dupConf >= DUP_HIGH) { exit -= 20; evidence.push(ev("negative", "קיימת אפשרות למודעה כפולה", "DuplicateConfidence", dupConf, -20, s)); }
    if (dealsAvailable && dealsNearby > 0) { exit += 5; evidence.push(ev("positive", "פעילות עסקאות רשמית באזור תומכת", "RecentOfficialDealsNearby", dealsNearby, 5, s)); }
    if (returned) { exit -= 30; evidence.push(ev("negative", "הנכס חזר בעבר אחרי היעלמות", "ReturnedAfterDisappear", true, -30, s)); }
  } else {
    evidence.push(ev("neutral", "הנכס עדיין פעיל במקור החיצוני", "StillActive", active, 0, s));
  }
  exit = clamp(exit);

  // ── 2) Market ACCEPTANCE confidence (implies exit → capped at exit) ─────────
  let acceptance = 0;
  if (missing) {
    if (dom != null) {
      if (dom >= REALISTIC_DOM_MIN && dom <= REALISTIC_DOM_MAX) { acceptance += 20; evidence.push(ev("positive", "הנכס נעלם לאחר משך שיווק ריאלי", "DaysOnMarket", dom, 20, s)); }
      else if (dom < REAL_AGE_DAYS) { acceptance -= 10; evidence.push(ev("negative", "ההיעלמות מוקדמת מדי מכדי להעיד על קבלה", "DaysOnMarket", dom, -10, s)); }
    }
    if (avgReduction != null && avgReduction > 0) { acceptance += 15; evidence.push(ev("positive", "זוהו הורדות מחיר לפני ההיעלמות", "AveragePriceReduction", avgReduction, 15, s)); }
    else if (priceChanges > 0) { acceptance += 8; evidence.push(ev("positive", "זוהו שינויי מחיר לפני ההיעלמות", "PriceChangesCount", priceChanges, 8, s)); }
    if (dealsAvailable && dealsNearby > 0) { acceptance += 15; evidence.push(ev("positive", "עסקאות רשמיות באזור תומכות בטווח המחיר", "RecentOfficialDealsNearby", dealsNearby, 15, s)); }
    if (age != null && age >= REAL_AGE_DAYS) acceptance += 10;
    if (dupConf >= DUP_HIGH) { acceptance -= 15; evidence.push(ev("negative", "חשד למודעה כפולה מחליש את אות הקבלה", "DuplicateConfidence", dupConf, -15, s)); }
    if (returned) acceptance -= 20;
  }
  acceptance = Math.min(clamp(acceptance), exit); // acceptance can never exceed exit

  // ── 3) Market REJECTION confidence (price pushed back while still listed) ───
  let rejection = 0;
  if (active) {
    const d = dom ?? 0;
    let band = 0;
    if (d >= 120) band = 35; else if (d >= 90) band = 25; else if (d >= 60) band = 15; else if (d >= 30) band = 8;
    if (band > 0) { rejection += band; evidence.push(ev("positive", `הנכס עדיין פעיל לאחר ${d} ימים`, "DaysOnMarket", d, band, s)); }
    if (priceChanges >= 2) { rejection += 20; evidence.push(ev("positive", `${priceChanges} הורדות מחיר ללא מכירה`, "PriceChangesCount", priceChanges, 20, s)); }
    else if (priceChanges === 1) { rejection += 8; evidence.push(ev("positive", "הורדת מחיר אחת ללא מכירה", "PriceChangesCount", 1, 8, s)); }
    if (momentum != null && momentum < 0) { rejection += 15; evidence.push(ev("positive", "מגמת מחיר יורדת", "PriceMomentum", momentum, 15, s)); }
    if (timesDisappeared === 0) { rejection += 5; evidence.push(ev("neutral", "הנכס מעולם לא נעלם מהשוק", "TimesDisappeared", 0, 5, s)); }
    if (d < 21) rejection = Math.min(rejection, 30); // too new to strongly reject
  }
  rejection = clamp(rejection);

  // ── Classification (cautious, ordered) ──────────────────────────────────────
  let classification: MarketAcceptanceClassification;
  if (input.officialTransactionMatched) classification = "OFFICIAL_TRANSACTION_FOUND";
  else if (active && rejection >= REJECTED_MIN) classification = "LIKELY_REJECTED";
  else if (missing && exit >= EXIT_ACCEPTED && acceptance >= ACCEPTED_MIN) classification = "LIKELY_ACCEPTED";
  else if (missing && exit >= EXIT_LIKELY) classification = "LIKELY_MARKET_EXIT";
  else if (returned) classification = "RETURNED";
  else if (active) classification = "ACTIVE";
  else classification = "UNCERTAIN";

  if (!evidence.length) evidence.push(ev("neutral", "אין מספיק עדויות לסיווג", "CurrentState", sval(s, "CurrentState"), 0, s));

  const confidenceInputs = {
    missing, active, returned, lastSeenDaysAgo: lastSeen, listingAge: age, daysOnMarket: dom,
    timesDisappeared, duplicateConfidence: dupConf, providerCount, priceChanges,
    hadReductions: avgReduction != null && avgReduction > 0, priceMomentum: momentum,
    officialDealsAvailable: dealsAvailable, recentOfficialDealsNearby: dealsNearby,
    officialTransactionMatched: !!input.officialTransactionMatched,
  };

  return {
    marketExitConfidence: exit,
    marketAcceptanceConfidence: acceptance,
    marketRejectionConfidence: rejection,
    classification, evidence, confidenceInputs,
  };
}
