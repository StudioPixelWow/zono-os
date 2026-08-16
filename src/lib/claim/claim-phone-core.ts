// ============================================================================
// ZONO — Claim My Listings: PURE phone classification (P10A §13). No DB.
// A different phone number is NOT automatically a contradiction. We classify the
// listing's contact phone against everything we actually know, and only a phone
// VERIFIED to belong to a DIFFERENT broker is treated as negative evidence.
//   POSITIVE  → EXACT_PERSONAL_MATCH · KNOWN_OFFICE_PHONE · KNOWN_SOURCE_PHONE
//   NEUTRAL   → MASKED_OR_RELAY · UNKNOWN            (no penalty — just no help)
//   NEGATIVE  → VERIFIED_OTHER_BROKER_PHONE          (a real contradiction)
// This stops the "different phone = different broker" regression (§13).
// ============================================================================
import type { PhoneMatch } from "./claim-evidence-core";

export type PhoneClass =
  | "EXACT_PERSONAL_MATCH"
  | "KNOWN_OFFICE_PHONE"
  | "KNOWN_SOURCE_PHONE"
  | "MASKED_OR_RELAY"
  | "UNKNOWN"
  | "VERIFIED_OTHER_BROKER_PHONE";

export type PhonePolarity = "positive" | "neutral" | "negative";

/** Normalize to Israeli local digits: strip non-digits, 972→0. */
export function normalizePhone(s: string | null | undefined): string {
  const d = (s ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return "0" + d.slice(3);
  if (d.startsWith("0")) return d;
  // bare 9-digit mobile/landline without leading 0 → add it
  return d.length === 9 ? "0" + d : d;
}

// Relay / masked patterns real portals use so the true number is hidden. A masked
// number tells us NOTHING about identity — it must never count as a contradiction.
const RELAY_PREFIXES = ["072", "073", "076", "077", "1700", "1800", "*"];
const RELAY_HINTS = /relay|masked|proxy|virtual|חסוי|ממסר/i;

export function looksMaskedOrRelay(rawPhone: string | null | undefined, hint?: string | null): boolean {
  if (hint && RELAY_HINTS.test(hint)) return true;
  const n = normalizePhone(rawPhone);
  if (!n) return false;
  return RELAY_PREFIXES.some((p) => n.startsWith(p));
}

export interface PhoneKnowledge {
  personalPhones: string[];       // the caller's own verified phone(s)
  officePhones: string[];         // the caller's office / brokerage switchboard(s)
  sourcePhones: string[];         // agency/source phones known to belong to the caller's side
  otherBrokerPhones: string[];    // phones VERIFIED to belong to a DIFFERENT broker (same org directory)
  relayHint?: string | null;      // free-text hint (e.g. source flag) that a number is a relay
}

/**
 * Classify a listing phone against known numbers. Order matters: a positive
 * personal match wins over everything; a verified-other-broker phone is the only
 * negative; masked/relay and truly unknown numbers are NEUTRAL (§13).
 */
export function classifyPhone(listingPhoneRaw: string | null | undefined, k: PhoneKnowledge): PhoneClass {
  const n = normalizePhone(listingPhoneRaw);
  if (!n) return "UNKNOWN";
  const has = (arr: string[]) => arr.map(normalizePhone).includes(n);

  if (has(k.personalPhones)) return "EXACT_PERSONAL_MATCH";
  if (has(k.officePhones)) return "KNOWN_OFFICE_PHONE";
  if (has(k.sourcePhones)) return "KNOWN_SOURCE_PHONE";
  if (looksMaskedOrRelay(listingPhoneRaw, k.relayHint)) return "MASKED_OR_RELAY";
  // Only a phone proven to belong to a different broker is a contradiction.
  if (has(k.otherBrokerPhones)) return "VERIFIED_OTHER_BROKER_PHONE";
  return "UNKNOWN";
}

export function phonePolarity(c: PhoneClass): PhonePolarity {
  switch (c) {
    case "EXACT_PERSONAL_MATCH":
    case "KNOWN_OFFICE_PHONE":
    case "KNOWN_SOURCE_PHONE":
      return "positive";
    case "VERIFIED_OTHER_BROKER_PHONE":
      return "negative";
    default:
      return "neutral"; // MASKED_OR_RELAY · UNKNOWN
  }
}

/** Bridge the §13 class to the evidence engine's PhoneMatch (which drives the
 *  confidence ladder). NEUTRAL maps to "unknown" so it never caps confidence. */
export function phoneClassToMatch(c: PhoneClass): PhoneMatch {
  const p = phonePolarity(c);
  return p === "positive" ? "exact" : p === "negative" ? "contradict" : "unknown";
}

/** Short Hebrew explanation for the review card. */
export function phoneClassLabel(c: PhoneClass): string {
  switch (c) {
    case "EXACT_PERSONAL_MATCH": return "הטלפון בפרסום זהה לטלפון שלך";
    case "KNOWN_OFFICE_PHONE": return "הטלפון בפרסום הוא טלפון המשרד שלך";
    case "KNOWN_SOURCE_PHONE": return "הטלפון בפרסום מוכר כטלפון מהצד שלך";
    case "MASKED_OR_RELAY": return "הטלפון בפרסום חסוי/ממסר — לא ניתן להסיק ממנו";
    case "VERIFIED_OTHER_BROKER_PHONE": return "הטלפון בפרסום שייך למתווך אחר מאומת";
    case "UNKNOWN": return "הטלפון בפרסום אינו מוכר — ניטרלי";
  }
}
