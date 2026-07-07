// ============================================================================
// 🤝 ZONO — AI Negotiation Assistant — types (pure, client-safe). PHASE 59.0.
// A negotiation CO-PILOT that suggests strategy, scripts and next steps. Hard
// rules baked in: NO legal advice (legal questions are handed off), NO binding
// financial promises (talking points/drafts are hedged, never guarantees), NO
// fabricated valuations (missing valuation → say so, never invent a number), and
// NO automatic messages (every draft is approval-gated and never sent).
// ============================================================================

export const NEGOTIATION_VERSION = "59.0";

export type ObjectionKind = "price_too_high" | "needs_time" | "competing_offer" | "financing" | "condition" | "location" | "other";
export const OBJECTION_HE: Record<ObjectionKind, string> = {
  price_too_high: "מחיר גבוה מדי", needs_time: "צריך זמן", competing_offer: "הצעה מתחרה", financing: "מימון/משכנתא",
  condition: "מצב הנכס", location: "מיקום", other: "אחר",
};

export type Stance = "hold" | "counter" | "accept" | "gather";
export const STANCE_HE: Record<Stance, string> = { hold: "החזק מחיר", counter: "הצעה נגדית", accept: "שקול קבלה", gather: "אסוף הצעות" };

export type DraftChannel = "whatsapp" | "email";
export type RiskLevel = "high" | "medium" | "low";

// ── Inputs (normalized; the service maps existing engines → this) ─────────────
export interface OfferInput {
  id: string; buyerName: string; amount: number | null;
  hasFinancing: boolean; preapproved: boolean; contingencies: string[]; submittedAt: string | null;
}
export interface NegotiationInput {
  property: { id: string; title: string; askingPrice: number | null; city: string | null };
  valuation: { estimated: number | null; low: number | null; high: number | null; confidence: number | null } | null;
  offers: OfferInput[];
  sellerSignals: { flexibility: number | null; daysOnMarket: number | null; priceReductions: number };
  buyerSignals: { urgency: number | null; readiness: number | null; competingInterest: boolean };
  notes: string[];   // CRM notes / voice transcript lines for objection + legal detection
}

// ── Outputs ───────────────────────────────────────────────────────────────────
export interface Objection { kind: ObjectionKind; label: string; evidence: string; rebuttal: string }

export interface RankedOffer {
  id: string; buyerName: string; amount: number | null;
  gapToAskingPct: number | null; gapToValuationPct: number | null;
  certainty: number;         // 0..100 (financing/preapproval/contingencies)
  strength: number;          // 0..100 overall
  rank: number; note: string;
}

export interface PriceStrategy {
  stance: Stance; stanceHe: string;
  counterRange: { minPct: number; maxPct: number } | null;   // relative to asking; null when accepting/gathering
  rationale: string; confidence: number; usesValuation: boolean; note: string;
}

export interface DraftSuggestion {
  channel: DraftChannel; purpose: string; body: string;
  requiresApproval: true;    // ALWAYS — nothing is sent automatically
  autoSend: false;
  disclaimer: string;
}

export interface LegalHandoff { triggered: boolean; message: string; evidence: string[] }

export interface NegotiationPlan {
  version: string; generatedAt: string | null;
  property: { id: string; title: string; askingPrice: number | null };
  objections: Objection[];
  offers: RankedOffer[];
  strategy: PriceStrategy;
  sellerFlexibility: { score: number | null; label: string; note: string };
  buyerUrgency: { score: number | null; label: string; note: string };
  talkingPoints: string[];
  drafts: DraftSuggestion[];
  meetingPrep: string[];
  risk: { level: RiskLevel; confidence: number; missingData: string[]; note: string };
  legalHandoff: LegalHandoff;
  hasData: boolean;
  notes: string[];
}

export const RULES_NOTE =
  "כלי סיוע בלבד: זונו מציע אסטרטגיה ותסריטים — אינו מספק ייעוץ משפטי, אינו נותן התחייבויות פיננסיות מחייבות, אינו ממציא הערכות שווי, ואינו שולח הודעות אוטומטית. כל טיוטה דורשת אישור ועריכה על ידך לפני שליחה.";
