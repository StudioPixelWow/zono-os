// ============================================================================
// ZONO Creative Truth & Asset Validation (pure) — prevents hallucinations. If a
// detail isn't in the property data / user input, it must not appear in the
// creative. Returns property_truth + agent/logo authenticity scores + reasons.
// ============================================================================

export interface TruthInput {
  text: string; // headline + subheadline + body + cta + chips, concatenated
  /** Real facts the agent provided (e.g. "מרפסת", "חניה", "5 חדרים"). */
  providedFeatures: string[];
  propertyType?: string | null;
  hasPrice: boolean;
  hasPropertyImage: boolean;
  /** Brand assets that genuinely exist. */
  hasAgentPhoto: boolean;
  hasOfficeLogo: boolean;
  /** Whether the creative visually claims an agent photo / logo. */
  claimsAgentPhoto?: boolean;
  claimsLogo?: boolean;
}

export interface TruthResult {
  propertyTruthScore: number;
  agentAuthenticityScore: number;
  logoAuthenticityScore: number;
  violations: string[];
}

// Detail-claim tokens guarded against the provided facts.
const GUARDS: { token: RegExp; backed: (i: TruthInput) => boolean; label: string }[] = [
  { token: /נוף ?לים|נשקף לים|מול הים|sea ?view/i, backed: () => false, label: "נוף לים שלא סופק" },
  { token: /בריכה/i, backed: (i) => i.providedFeatures.some((f) => /בריכה/.test(f)), label: "בריכה שלא סופקה" },
  { token: /פנטהאוז|penthouse/i, backed: (i) => /penthouse/i.test(i.propertyType ?? ""), label: "פנטהאוז שלא תואם סוג הנכס" },
  { token: /גינה|דירת גן/i, backed: (i) => /garden/i.test(i.propertyType ?? "") || i.providedFeatures.some((f) => /גינה/.test(f)), label: "גינה שלא סופקה" },
  { token: /מרפסת/i, backed: (i) => i.providedFeatures.some((f) => /מרפסת/.test(f)), label: "מרפסת שלא סופקה" },
  { token: /חניה|חנייה/i, backed: (i) => i.providedFeatures.some((f) => /חניה|חנייה/.test(f)), label: "חניה שלא סופקה" },
  { token: /מחסן/i, backed: (i) => i.providedFeatures.some((f) => /מחסן/.test(f)), label: "מחסן שלא סופק" },
  { token: /מעלית/i, backed: (i) => i.providedFeatures.some((f) => /מעלית/.test(f)), label: "מעלית שלא סופקה" },
  { token: /משופצת|שופצה|לאחר שיפוץ/i, backed: (i) => i.providedFeatures.some((f) => /שיפוץ|משופצת/.test(f)), label: "שיפוץ שלא סופק" },
];

export function validateTruth(i: TruthInput): TruthResult {
  const violations: string[] = [];
  let truth = 100;
  for (const g of GUARDS) {
    if (g.token.test(i.text) && !g.backed(i)) { truth -= 25; violations.push(g.label); }
  }
  // Price claims (₪ or "מחיר") with no price provided.
  if (/(₪|מחיר)/.test(i.text) && !i.hasPrice) { truth -= 20; violations.push("מחיר שלא סופק"); }

  // Authenticity: never fabricate brand assets.
  let agent = 100, logo = 100;
  if (i.claimsAgentPhoto && !i.hasAgentPhoto) { agent = 0; violations.push("תמונת סוכן מזויפת"); }
  if (i.claimsLogo && !i.hasOfficeLogo) { logo = 0; violations.push("לוגו משרד מזויף"); }

  return { propertyTruthScore: Math.max(0, truth), agentAuthenticityScore: agent, logoAuthenticityScore: logo, violations };
}
