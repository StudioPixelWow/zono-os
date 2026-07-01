// ============================================================================
// 🧩 Office Inventory Attribution (pure). Phase 26.5 · Part 4/8.
// ----------------------------------------------------------------------------
// Decides whether a listing belongs to an office and WHY: a direct office link,
// a phone/website match, or DERIVED from a broker who belongs to the office.
// Never overwrites a stronger explicit link with a weaker derived one; flags
// conflicts instead of silently overwriting. Deterministic. No DB, no AI.
// ============================================================================
export type AttributionKind = "direct" | "office_phone" | "office_website" | "derived_broker";

export interface LinkFacts { linkOfficeId: string | null; agentId: string | null; matchReasons: string[] }

export interface Attribution {
  included: boolean;
  kind: AttributionKind | null;
  derived: boolean;
  conflict: boolean;
  reason: string;
  conflictNote: string | null;
  strength: number;                 // 3 direct/phone/site, 1 derived — for dedupe
}

const NOT_INCLUDED: Attribution = { included: false, kind: null, derived: false, conflict: false, reason: "", conflictNote: null, strength: 0 };

/** Attribute one listing link to a target office (Part 8 explainability). */
export function attributeLink(
  link: LinkFacts, brokerOfficeId: string | null, targetOfficeId: string,
  brokerName: string | null, officeName: string | null,
): Attribution {
  // Explicit link to THIS office → strongest (direct / phone / website).
  if (link.linkOfficeId && link.linkOfficeId === targetOfficeId) {
    const r = link.matchReasons.map((x) => x.toLowerCase());
    if (r.some((x) => /office_phone|matched.*phone|phone/.test(x))) return { included: true, kind: "office_phone", derived: false, conflict: false, reason: "הותאם לפי טלפון המשרד", conflictNote: null, strength: 3 };
    if (r.some((x) => /office_website|domain|website/.test(x))) return { included: true, kind: "office_website", derived: false, conflict: false, reason: "הותאם לפי אתר/דומיין המשרד", conflictNote: null, strength: 3 };
    return { included: true, kind: "direct", derived: false, conflict: false, reason: "מקושר ישירות למשרד ממקור המודעה", conflictNote: null, strength: 3 };
  }
  // Derived from a broker who belongs to this office.
  if (link.agentId && brokerOfficeId && brokerOfficeId === targetOfficeId) {
    const conflict = !!link.linkOfficeId && link.linkOfficeId !== targetOfficeId;
    return {
      included: true, kind: "derived_broker", derived: true, conflict,
      reason: `נגזר ממתווך: ${brokerName ?? "מתווך"} מקושר ל-${officeName ?? "משרד זה"}`,
      conflictNote: conflict ? "המתווך מקושר למשרד זה, אך מקור המודעה מרמז על משרד אחר — לא נדרס" : null,
      strength: 1,
    };
  }
  return NOT_INCLUDED;
}

/** Keep the strongest attribution per listing (explicit beats derived). */
export function stronger(a: Attribution, b: Attribution): Attribution { return a.strength >= b.strength ? a : b; }
