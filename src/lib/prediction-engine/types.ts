// ============================================================================
// 🔮 ZONO — Prediction Engine — types (pure, client-safe). PHASE 52.0.
// Forecasts likely outcomes by CONSUMING existing engine signals (agent
// scorecards, twins, Daily OS, Territory, Chief-of-Staff) — it NEVER recomputes
// those scores. No certainty theater: every prediction carries confidence, data
// sufficiency, evidence, missing data, risk, a recommended (approval-gated)
// action, and an expiration. Nothing here auto-executes.
// ============================================================================

export const PREDICTION_ENGINE_VERSION = "52.0";

export type PredictionKind =
  | "seller_churn" | "buyer_close" | "lead_conversion" | "listing_velocity"
  | "campaign_fatigue" | "broker_overload" | "missed_followup" | "deal_close" | "territory_growth";

export const PREDICTION_HE: Record<PredictionKind, string> = {
  seller_churn: "נטישת מוכרים", buyer_close: "סגירת קונים", lead_conversion: "המרת לידים",
  listing_velocity: "מהירות מכירה", campaign_fatigue: "שחיקת קמפיינים", broker_overload: "עומס ברוקר",
  missed_followup: "מעקבים שיפוספסו", deal_close: "סגירת עסקאות", territory_growth: "צמיחת טריטוריה",
};

export type DataSufficiency = "high" | "medium" | "low" | "none";
export type RiskLevel = "high" | "medium" | "low";
export type Trend = "up" | "down" | "flat" | "unknown";

export interface PredictionSubject { name: string; href: string; score: number | null }
export interface PredictionAction { label: string; href: string | null; requiresApproval: boolean }

export interface Prediction {
  kind: PredictionKind;
  label: string;
  headline: string;
  probability: number | null;      // 0..100, or null when data is insufficient
  outcome: string;                 // human phrasing of the forecast
  confidence: number;              // 0..100 — capped by data sufficiency
  dataSufficiency: DataSufficiency;
  trend: Trend;
  evidence: string[];
  missingData: string[];           // what would sharpen the forecast
  risk: { level: RiskLevel; note: string };
  action: PredictionAction | null; // recommendation only — approval-gated, never auto-run
  subjects: PredictionSubject[];
  horizonDays: number;             // forecast horizon
  expiresAt: string | null;        // stamped by the service (now + horizon)
}

// ── Normalized signals (the service maps existing engines → this) ─────────────
export interface SignalEntity {
  kind: string; id: string; name: string; score: number | null;
  reason: string | null; riskLabel: string | null; href: string; lastActivityAt: string | null;
}
export interface PerfSignal { daily: number; weekly: number; followUpRatePct: number; conversionOpportunities: number; weakSpots: { title: string; detail: string; impact: string }[] }
export interface ConvSignal { whatsappUnread: number; whatsappWaiting: number; facebookComments: number; facebookLeads: number }
export interface MktSignal { scheduledToday: number; commentsWaiting: number; leadApprovals: number; groupsToPublish: number }
export interface TerrSignal { score: number | null; growth: number | null; band: string | null }

export interface PredictionSignals {
  sellersAtRisk: SignalEntity[];
  hotBuyers: SignalEntity[];
  staleListings: SignalEntity[];
  leadFollowUps: SignalEntity[];
  performance: PerfSignal | null;
  conversation: ConvSignal | null;
  marketing: MktSignal | null;
  territory: TerrSignal | null;
  orgScore: number | null;
  orgRiskCount: number;
}

export interface PredictionReport {
  version: string;
  generatedAt: string | null;
  predictions: Prediction[];
  counts: { total: number; actionable: number; highConfidence: number; insufficient: number };
  notes: string[];
}

export const NO_CERTAINTY_NOTE =
  "אלה תחזיות הסתברותיות מבוססות אותות קיימים — לא ודאויות. כל תחזית מציגה ביטחון, מספיקות נתונים, ראיות, מה חסר ותוקף. שום תחזית אינה מבצעת פעולה אוטומטית — כל פעולה דורשת אישור שלך.";
