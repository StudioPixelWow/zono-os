// ============================================================================
// ZONO — Claim My Listings: PURE evidence + confidence engine (P10). No DB —
// deterministic, explainable, unit-tested. Encodes the hard guardrails:
//   • NAME alone never → confirmed/HIGH.   • PHONE alone never → confirmed/HIGH.
//   • OFFICE membership alone ≠ "this specific agent's listing".
//   • A CONTRADICTION (e.g. different phone) reduces confidence.
//   • CROSS-ORG evidence is excluded (tenant isolation wins).
// Confidence is HIGH / MEDIUM / LOW and always carries human-readable reasons.
// ============================================================================
export type Confidence = "high" | "medium" | "low";
export type NameMatch = "exact" | "similar" | "first_only" | "none";
export type PhoneMatch = "exact" | "contradict" | "unknown";

export interface CandidateEvidence {
  sameOrg: boolean;               // link.organization_id === caller org (else EXCLUDE)
  stableAgentIdMatch: boolean;    // linked to the caller's VERIFIED anchor agent id (not by name)
  nameMatch: NameMatch;           // vs the anchor's normalized full name
  phoneMatch: PhoneMatch;         // vs the anchor's known phone(s)
  officeMatch: boolean;           // same office as the anchor
  cityMatch: boolean;             // listing city in the anchor's territory
  priorConfirmedSameIdentity: number; // identity-learning: prior positive claims on this stable id
}

export interface EvidenceVerdict {
  excluded: boolean;              // cross-org / not a candidate for this caller
  confidence: Confidence | null;  // null when excluded
  officeLevelOnly: boolean;       // relevant to the OFFICE, not provably this agent (P11)
  reasons: string[];              // Hebrew, shown in the card ("למה ZONO חושבת שהנכס שלך?")
  cautions: string[];             // contradictions / weaknesses
}

const HIGH_PRIOR_ANCHOR = 3; // confirmed claims on the same stable identity → identity anchor

/** Deterministic verdict for one candidate. Pure. */
export function scoreCandidate(e: CandidateEvidence): EvidenceVerdict {
  const reasons: string[] = [];
  const cautions: string[] = [];

  // Tenant isolation wins: evidence from another org is never a candidate here.
  if (!e.sameOrg) return { excluded: true, confidence: null, officeLevelOnly: false, reasons: [], cautions: ["ראיה משויכת לארגון אחר — לא מוצג"] };

  if (e.stableAgentIdMatch) reasons.push("זהות סוכן יציבה תואמת את הנכס");
  if (e.nameMatch === "exact") reasons.push("שם הסוכן תואם במדויק");
  else if (e.nameMatch === "similar") reasons.push("שם הסוכן דומה");
  else if (e.nameMatch === "first_only") cautions.push("רק שם פרטי תואם");
  if (e.phoneMatch === "exact") reasons.push("טלפון תואם");
  else if (e.phoneMatch === "contradict") cautions.push("הטלפון בפרסום שונה מהטלפון שלך");
  if (e.officeMatch) reasons.push("משויך לאותו משרד");
  if (e.cityMatch) reasons.push("הנכס פורסם באזור הפעילות שלך");
  if (e.priorConfirmedSameIdentity > 0) reasons.push(`אישרת בעבר ${e.priorConfirmedSameIdentity} נכסים מאותה זהות מקור`);

  // Office-level ambiguity (P10 §AA): office matches but nothing ties it to THIS agent.
  const officeLevelOnly = e.officeMatch && !e.stableAgentIdMatch && e.nameMatch === "none" && e.phoneMatch !== "exact";

  // ── Confidence ladder ──────────────────────────────────────────────────────
  // HIGH: a stable identity link (or an established anchor) with no contradiction.
  const stableAnchored = e.stableAgentIdMatch || e.priorConfirmedSameIdentity >= HIGH_PRIOR_ANCHOR;
  if (stableAnchored && e.phoneMatch !== "contradict") {
    return { excluded: false, confidence: "high", officeLevelOnly, reasons, cautions };
  }
  // A phone contradiction caps confidence at LOW — uncertainty must not become certainty.
  if (e.phoneMatch === "contradict") {
    return { excluded: false, confidence: "low", officeLevelOnly, reasons, cautions };
  }
  // MEDIUM: strong multi-signal but no stable listing→agent id.
  const multiSignal =
    (e.nameMatch === "exact" && (e.officeMatch || e.cityMatch)) ||
    (e.nameMatch === "similar" && e.phoneMatch === "exact") ||
    (e.phoneMatch === "exact" && e.officeMatch);
  if (multiSignal) {
    return { excluded: false, confidence: "medium", officeLevelOnly, reasons, cautions };
  }
  // LOW: name/office/city similarity only — surfaced for review, never auto-confirmed.
  return { excluded: false, confidence: "low", officeLevelOnly, reasons, cautions };
}

/** Should this verdict be shown as a candidate at all? (Excludes cross-org.) */
export function isCandidate(v: EvidenceVerdict): boolean { return !v.excluded && v.confidence !== null; }
