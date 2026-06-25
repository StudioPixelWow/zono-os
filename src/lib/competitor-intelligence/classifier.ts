// ============================================================================
// ZONO — Competitor classifier (pure, deterministic). PUBLIC listing data only.
//   • Private listings are NEVER classified as a competitor.
//   • Infers office/agency from explicit agency, broker office field, contact
//     name, or phone grouping — each with an honest confidence.
//   • Low confidence is surfaced honestly; "unknown" creates no profile.
// No private CRM data. No fabricated certainty.
// ============================================================================
import type { ClassificationResult, ListingSignal, CompetitorConfidenceSource } from "./types";

const CONFIDENCE: Record<CompetitorConfidenceSource, number> = {
  explicit_agency: 95,
  broker_office_field: 85,
  phone_group: 60,
  contact_name: 50,
  unknown: 0,
};

// Suffixes stripped ONLY for the normalized matching key (display name keeps them).
// Listed in their POST-punctuation-strip form (quotes already become spaces).
const SUFFIXES = ["נדל ן", "נדלן", "תיווך", "בע מ", "בעמ", "real estate", "realty", "properties", "group"];

/** Build a stable normalized key for merging duplicate office names. */
export function normalizeCompetitorName(raw: string): string {
  let s = (raw ?? "").trim().toLowerCase();
  s = s.replace(/[“”"׳״'`.,()|\-_/]+/g, " ");
  for (const suf of SUFFIXES) s = s.replace(new RegExp(suf.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const isPrivate = (listingType: string | null): boolean =>
  (listingType ?? "").toLowerCase().trim() === "private";

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s.length >= 2 ? s : null;
};

/** Normalize a phone into a digit-only grouping key (public number only). */
function phoneKey(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D+/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-9); // last 9 digits — stable across +972/0 prefixes
}

/**
 * Classify a single public listing signal into a competitor office (or null).
 * Deterministic: same signal ⇒ same result.
 */
export function classifyListing(sig: ListingSignal): ClassificationResult {
  const none = (): ClassificationResult => ({ competitorName: null, normalizedName: null, confidence: 0, confidenceSource: "unknown", evidence: {} });

  // RULE 1 — private listings are never competitors.
  if (isPrivate(sig.listingType)) return none();

  const agency = clean(sig.agencyName);
  const office = clean(sig.officeName);
  const broker = clean(sig.brokerName);
  const contact = clean(sig.contactName);
  const pkey = phoneKey(sig.phone);

  // RULE 2 — explicit agency name (highest confidence).
  if (agency) {
    return mk(agency, "explicit_agency", { agencyName: agency, provider: sig.provider });
  }
  // RULE 3 — broker/office profile field.
  if (office) {
    return mk(office, "broker_office_field", { officeName: office, provider: sig.provider });
  }
  if (broker) {
    return mk(broker, "broker_office_field", { brokerName: broker, provider: sig.provider });
  }
  // RULE 4 — contact name (low confidence, still public).
  if (contact) {
    // A bare contact name is weak evidence; pair with phone group if present.
    const src: CompetitorConfidenceSource = pkey ? "phone_group" : "contact_name";
    return mk(contact, src, { contactName: contact, phoneGroup: pkey ?? undefined });
  }
  // RULE 5 — phone-only grouping (group anonymous listings by public number).
  if (pkey) {
    return mk(`קבוצת מפרסם ${pkey.slice(-4)}`, "phone_group", { phoneGroup: pkey });
  }

  // Otherwise: unknown → do NOT create a competitor profile.
  return none();
}

function mk(name: string, source: CompetitorConfidenceSource, evidence: Record<string, unknown>): ClassificationResult {
  const normalizedName = normalizeCompetitorName(name);
  if (!normalizedName) return { competitorName: null, normalizedName: null, confidence: 0, confidenceSource: "unknown", evidence: {} };
  return { competitorName: name.trim(), normalizedName, confidence: CONFIDENCE[source], confidenceSource: source, evidence };
}

/** Human label for a confidence level (honest, never overclaiming). */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 90) return "ודאות גבוהה";
  if (confidence >= 80) return "ודאות טובה";
  if (confidence >= 55) return "ודאות בינונית";
  return "ודאות נמוכה — הערכה";
}
