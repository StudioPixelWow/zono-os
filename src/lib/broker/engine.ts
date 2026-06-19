/**
 * Broker Intelligence — normalization + deterministic matching engine.
 * Pure, client-safe, no LLM, no network. Public business info only.
 * Evidence-first: weak/semantic-only evidence never auto-matches.
 */

export type SellerType = "private_seller" | "broker" | "agency" | "office" | "exclusive" | "unknown";
export type BrokerMatchStatus = "auto_matched" | "needs_review" | "approved" | "rejected" | "unmatched";
export type MatchType =
  | "exact_phone" | "normalized_phone" | "exact_name" | "alias"
  | "agency_name" | "website" | "semantic" | "service_area" | "repeated_listing";

// ── Normalization ────────────────────────────────────────────────────────────
const HEB_NIQQUD = /[֑-ׇ]/g;
const AGENCY_WORDS = ["תיווך", "נדל\"ן", "נדלן", "נכסים", "ריבית", "remax", "re/max", "anglo", "אנגלו", "century", "כל נכס", "realty", "real estate", "properties", "homes", "group", "קבוצת"];
const BROKER_WORDS = ["מתווך", "מתווכת", "סוכן", "סוכנת", "agent", "broker", "משרד"];

/** Strip niqqud, quotes, punctuation, collapse whitespace, lowercase. */
export function normalizeHebrewName(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(HEB_NIQQUD, "")
    .replace(/["'`׳״]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Israeli phone → canonical digits (drop +972/0 prefixes, keep national form). */
export function normalizePhoneNumber(input: string | null | undefined): string {
  if (!input) return "";
  let d = String(input).replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (d.length >= 9 && !d.startsWith("0")) d = "0" + d;
  return d;
}

export function normalizeBrokerName(input: string | null | undefined): string {
  return normalizeHebrewName(input);
}

/** Normalize an agency name (drop generic agency words to compare the core). */
export function normalizeAgencyName(input: string | null | undefined): string {
  let n = normalizeHebrewName(input);
  for (const w of AGENCY_WORDS) n = n.replace(new RegExp(`\\b${w.toLowerCase()}\\b`, "g"), " ");
  return n.replace(/\s+/g, " ").trim();
}

// ── Comparators (0..1) ───────────────────────────────────────────────────────
export function comparePhones(a: string | null | undefined, b: string | null | undefined): number {
  const x = normalizePhoneNumber(a), y = normalizePhoneNumber(b);
  if (!x || !y) return 0;
  return x === y ? 1 : 0;
}

/** Token-overlap (Jaccard-ish) similarity of two names, 0..1. */
export function compareNames(a: string | null | undefined, b: string | null | undefined): number {
  const x = normalizeHebrewName(a), y = normalizeHebrewName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ax = new Set(x.split(" ").filter(Boolean));
  const by = new Set(y.split(" ").filter(Boolean));
  if (!ax.size || !by.size) return 0;
  let inter = 0;
  for (const t of ax) if (by.has(t)) inter++;
  const union = ax.size + by.size - inter;
  const jaccard = inter / union;
  // A contained full-name (e.g. "שי הולי" within "שי הולי נדל\"ן") scores high.
  const contained = x.includes(y) || y.includes(x) ? 0.85 : 0;
  return Math.max(jaccard, contained);
}

export interface AliasLike { alias_type: string; normalized_value: string }

/** Best alias match (0..1) of a listing's name/phone/agency against aliases. */
export function compareAliases(
  candidate: { name?: string | null; phone?: string | null; agency?: string | null },
  aliases: AliasLike[],
): number {
  let best = 0;
  const nName = normalizeHebrewName(candidate.name);
  const nPhone = normalizePhoneNumber(candidate.phone);
  const nAgency = normalizeAgencyName(candidate.agency);
  for (const a of aliases) {
    if ((a.alias_type === "phone") && nPhone && a.normalized_value === nPhone) best = Math.max(best, 1);
    else if ((a.alias_type === "name" || a.alias_type === "nickname") && nName) best = Math.max(best, compareNames(nName, a.normalized_value));
    else if (a.alias_type === "agency_name" && nAgency) best = Math.max(best, compareNames(nAgency, a.normalized_value));
    else if ((a.alias_type === "website" || a.alias_type === "social" || a.alias_type === "email") && candidate.name) {
      /* url/email aliases compared elsewhere */
    }
  }
  return best;
}

// ── Listing source-type classification (no broker_profiles needed) ───────────
export interface ListingContact {
  hasAgent: boolean | null;
  contactType: string | null;
  contactName: string | null;
}

/** Classify a listing's publisher from its own public fields (heuristic). */
export function classifyListingSourceType(c: ListingContact): { sourceType: SellerType; badge: string; confidence: number } {
  const name = normalizeHebrewName(c.contactName);
  const type = normalizeHebrewName(c.contactType);
  const hasAgencyWord = AGENCY_WORDS.some((w) => name.includes(w.toLowerCase()) || type.includes(w.toLowerCase()));
  const hasBrokerWord = BROKER_WORDS.some((w) => name.includes(w.toLowerCase()) || type.includes(w.toLowerCase()));

  if (hasAgencyWord) return { sourceType: "agency", badge: "משרד תיווך", confidence: 70 };
  if (c.hasAgent === true || hasBrokerWord) return { sourceType: "broker", badge: "פרסום מתווך", confidence: 65 };
  if (c.hasAgent === false) return { sourceType: "private_seller", badge: "מוכר פרטי", confidence: 75 };
  return { sourceType: "unknown", badge: "לא ידוע", confidence: 30 };
}

export const SOURCE_TYPE_BADGE: Record<SellerType, string> = {
  private_seller: "מוכר פרטי",
  broker: "פרסום מתווך",
  agency: "משרד תיווך",
  office: "נכס בבלעדיות",
  exclusive: "נכס בבלעדיות",
  unknown: "לא ידוע",
};

// ── Broker match confidence ──────────────────────────────────────────────────
export interface BrokerCandidate {
  id: string;
  normalizedName: string;
  normalizedAgency: string | null;
  normalizedPhone: string | null;
  primaryCity: string | null;
  aliases: AliasLike[];
}

export interface ListingForMatch {
  contactName: string | null;
  contactPhone: string | null;
  agencyName?: string | null;
  city: string | null;
}

export interface MatchResult {
  brokerId: string;
  matchType: MatchType;
  confidence: number; // 0..100
  status: BrokerMatchStatus;
  evidence: Record<string, unknown>;
}

const cityMatch = (a: string | null, b: string | null) => {
  const x = normalizeHebrewName(a), y = normalizeHebrewName(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/**
 * Deterministic confidence for a listing→broker pairing.
 * exact phone + same city = very high; exact name + same city = high;
 * alias + same city = medium/high; semantic-only = needs review.
 */
export function calculateBrokerMatchConfidence(listing: ListingForMatch, broker: BrokerCandidate): MatchResult | null {
  const sameCity = cityMatch(listing.city, broker.primaryCity) || broker.primaryCity == null;
  const phoneEq = comparePhones(listing.contactPhone, broker.normalizedPhone) === 1;
  const nameSim = compareNames(listing.contactName, broker.normalizedName);
  const agencySim = listing.agencyName ? compareNames(listing.agencyName, broker.normalizedAgency) : 0;
  const aliasSim = compareAliases({ name: listing.contactName, phone: listing.contactPhone, agency: listing.agencyName }, broker.aliases);

  const ev: Record<string, unknown> = { phoneEq, nameSim: Math.round(nameSim * 100), agencySim: Math.round(agencySim * 100), aliasSim: Math.round(aliasSim * 100), sameCity };

  // Exact phone — strongest deterministic signal.
  if (phoneEq) {
    return { brokerId: broker.id, matchType: "exact_phone", confidence: sameCity ? 97 : 90, status: "auto_matched", evidence: ev };
  }
  // Exact (or near-exact) name + same city.
  if (nameSim >= 0.95 && cityMatch(listing.city, broker.primaryCity)) {
    return { brokerId: broker.id, matchType: "exact_name", confidence: 85, status: "auto_matched", evidence: ev };
  }
  // Alias match + same city.
  if (aliasSim >= 0.9 && sameCity) {
    return { brokerId: broker.id, matchType: "alias", confidence: 80, status: cityMatch(listing.city, broker.primaryCity) ? "auto_matched" : "needs_review", evidence: ev };
  }
  // Agency name match.
  if (agencySim >= 0.9 && sameCity) {
    return { brokerId: broker.id, matchType: "agency_name", confidence: 72, status: "needs_review", evidence: ev };
  }
  // Semantic-only / fuzzy — never auto-match.
  if (nameSim >= 0.6 || aliasSim >= 0.6 || agencySim >= 0.7) {
    return { brokerId: broker.id, matchType: "semantic", confidence: Math.round(Math.max(nameSim, aliasSim, agencySim) * 60), status: "needs_review", evidence: ev };
  }
  return null;
}

/** Pick the best match among candidates (highest confidence). */
export function bestBrokerMatch(listing: ListingForMatch, brokers: BrokerCandidate[]): MatchResult | null {
  let best: MatchResult | null = null;
  for (const b of brokers) {
    const r = calculateBrokerMatchConfidence(listing, b);
    if (r && (!best || r.confidence > best.confidence)) best = r;
  }
  return best;
}
