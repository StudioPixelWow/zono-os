// ============================================================================
// ZONO — Mortgage & Financing Intelligence OS · Pure engine (deterministic)
// ----------------------------------------------------------------------------
// Financial intelligence, not a calculator. Given a buyer's financial inputs +
// desired budget, derive affordability (recommended/max/safe budget, monthly
// payment, gaps), approval probability, financing risk and readiness scores.
// Israeli-market assumptions (configurable constants). No I/O, no LLM.
// ============================================================================

// Market assumptions (first-home oriented; conservative).
const MAX_LTV = 0.75;                 // max loan-to-value (equity must be >= 25%)
const PAYMENT_TO_INCOME = 0.35;       // max share of income to housing payment
const ANNUAL_RATE = 0.054;            // assumed mortgage rate
const TERM_MONTHS = 300;              // 25 years
const PURCHASE_COSTS = 0.07;          // taxes/fees/legal as share of price
const SAFE_FACTOR = 0.85;             // safe budget = max * 0.85

export interface FinancialInputs {
  monthlyIncome?: number | null;
  householdIncome?: number | null;
  employmentType?: string | null;
  selfEmployed?: boolean;
  salaryEmployed?: boolean;
  existingMortgage?: number | null;   // monthly payment on existing mortgage
  monthlyDebt?: number | null;        // other monthly debt obligations
  availableEquity?: number | null;
  availableDownPayment?: number | null;
  investmentCapital?: number | null;
  desiredBudget?: number | null;      // buyer's stated budget_max
}

export interface FinancingResult {
  recommendedBudget: number; maxBudget: number; safeBudget: number;
  monthlyPaymentEstimate: number; requiredEquity: number; downPaymentGap: number;
  cashGap: number; financingGap: number;
  financialReadinessScore: number; financingConfidenceScore: number; approvalProbability: number;
  financingStrength: number; purchaseReadiness: number; overallReadiness: number;
  financingRisk: "low" | "medium" | "high" | "critical"; readinessBand: "not_ready" | "needs_help" | "nearly_ready" | "ready";
  primaryGap: string | null; inputsComplete: boolean;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const money = (n: number) => Math.max(0, Math.round(n));

/** Present value of a loan from an affordable monthly payment (annuity). */
function loanFromPayment(monthlyPayment: number): number {
  if (monthlyPayment <= 0) return 0;
  const r = ANNUAL_RATE / 12;
  return monthlyPayment * (1 - Math.pow(1 + r, -TERM_MONTHS)) / r;
}
/** Monthly payment for a given loan principal. */
function paymentForLoan(loan: number): number {
  if (loan <= 0) return 0;
  const r = ANNUAL_RATE / 12;
  return loan * r / (1 - Math.pow(1 + r, -TERM_MONTHS));
}

export function computeFinancing(input: FinancialInputs): FinancingResult {
  const income = input.householdIncome || input.monthlyIncome || 0;
  const debt = (input.monthlyDebt || 0) + (input.existingMortgage || 0);
  const equity = (input.availableDownPayment || 0) + (input.availableEquity || 0) + (input.investmentCapital || 0);
  const desired = input.desiredBudget || 0;

  const inputsComplete = Boolean(income > 0 && equity > 0);

  // capacity-based loan
  const monthlyCapacity = Math.max(0, income * PAYMENT_TO_INCOME - debt);
  const capacityLoan = loanFromPayment(monthlyCapacity);

  // budget capped by both capacity (loan + equity) and LTV (equity must be >= 25%)
  const ltvCap = equity > 0 ? equity / (1 - MAX_LTV) : 0;       // equity / 0.25
  const capacityBudget = capacityLoan + equity;
  const maxBudget = money(Math.min(capacityBudget, ltvCap || capacityBudget));
  const safeBudget = money(maxBudget * SAFE_FACTOR);
  // recommended: align to the buyer's desire but never above safe budget
  const recommendedBudget = money(desired > 0 ? Math.min(desired, safeBudget) : safeBudget);

  const loanAtRecommended = Math.max(0, recommendedBudget - equity);
  const monthlyPaymentEstimate = money(paymentForLoan(loanAtRecommended));
  const requiredEquity = money(recommendedBudget * (1 - MAX_LTV));
  const downPaymentGap = money(requiredEquity - equity);
  const cashGap = money(downPaymentGap + recommendedBudget * PURCHASE_COSTS - Math.max(0, equity - requiredEquity));
  const financingGap = money(desired - maxBudget); // how far the desire exceeds the ceiling

  // ── scores ───────────────────────────────────────────────────────────────
  const dti = income > 0 ? (debt + monthlyPaymentEstimate) / income : 1;       // debt-to-income
  const equityRatio = recommendedBudget > 0 ? equity / recommendedBudget : 0;  // share funded by equity
  const employmentStability = input.salaryEmployed ? 1 : input.selfEmployed ? 0.7 : 0.5;

  const financialReadinessScore = clamp(
    (income > 0 ? 35 : 0) + (equity > 0 ? 25 : 0) + (1 - Math.min(1, dti / 0.45)) * 25 + employmentStability * 15);
  const approvalProbability = clamp(
    (1 - Math.min(1, dti / 0.45)) * 45 + Math.min(1, equityRatio / 0.30) * 35 + employmentStability * 20);
  const financingStrength = clamp(approvalProbability * 0.6 + Math.min(1, equityRatio / 0.35) * 40);
  const financingConfidenceScore = clamp((approvalProbability + financingStrength) / 2);
  const purchaseReadiness = clamp(
    (cashGap <= 0 ? 45 : Math.max(0, 45 - (cashGap / Math.max(1, recommendedBudget)) * 120)) +
    Math.min(1, equityRatio / 0.25) * 30 + (desired > 0 && desired <= maxBudget ? 25 : 10));
  const overallReadiness = clamp(financialReadinessScore * 0.3 + financingConfidenceScore * 0.35 + purchaseReadiness * 0.35);

  // ── risk + band ────────────────────────────────────────────────────────────
  let financingRisk: FinancingResult["financingRisk"] = "low";
  if (!inputsComplete) financingRisk = "high";
  else if (cashGap > 0 && approvalProbability < 45) financingRisk = "critical";
  else if (cashGap > 0 || approvalProbability < 55 || dti > 0.42) financingRisk = "high";
  else if (approvalProbability < 70 || dti > 0.35) financingRisk = "medium";

  let readinessBand: FinancingResult["readinessBand"] = "not_ready";
  if (overallReadiness >= 80 && cashGap <= 0) readinessBand = "ready";
  else if (overallReadiness >= 60) readinessBand = "nearly_ready";
  else if (overallReadiness >= 40) readinessBand = "needs_help";

  // ── primary gap (the single most important blocker) ─────────────────────────
  let primaryGap: string | null = null;
  if (!inputsComplete) primaryGap = "חסרים נתונים פיננסיים (הכנסה/הון עצמי)";
  else if (cashGap > 0) primaryGap = `פער מזומן של ${cashGap.toLocaleString("he-IL")} ₪ להון העצמי הנדרש`;
  else if (approvalProbability < 55) primaryGap = "סבירות אישור משכנתא נמוכה — מומלץ ייעוץ מימוני";
  else if (financingGap > 0) primaryGap = `התקציב הרצוי גבוה בכ-${financingGap.toLocaleString("he-IL")} ₪ מהיכולת`;

  return {
    recommendedBudget, maxBudget, safeBudget, monthlyPaymentEstimate, requiredEquity, downPaymentGap,
    cashGap, financingGap, financialReadinessScore, financingConfidenceScore, approvalProbability,
    financingStrength, purchaseReadiness, overallReadiness, financingRisk, readinessBand, primaryGap, inputsComplete,
  };
}

// ── labels ─────────────────────────────────────────────────────────────────────
export const RISK_LABELS: Record<string, string> = {
  unknown: "לא ידוע", low: "נמוך", medium: "בינוני", high: "גבוה", critical: "קריטי",
};
export const BAND_LABELS: Record<string, string> = {
  unknown: "לא ידוע", not_ready: "לא מוכן", needs_help: "זקוק לסיוע", nearly_ready: "כמעט מוכן", ready: "מוכן לרכישה",
};
export const RISK_TONE: Record<string, string> = {
  low: "bg-success-soft text-success", medium: "bg-warning-soft text-warning",
  high: "bg-danger-soft text-danger", critical: "bg-danger-soft text-danger", unknown: "bg-surface text-muted",
};
export const BAND_TONE: Record<string, string> = {
  ready: "bg-success-soft text-success", nearly_ready: "bg-brand-soft text-brand-strong",
  needs_help: "bg-warning-soft text-warning", not_ready: "bg-danger-soft text-danger", unknown: "bg-surface text-muted",
};

// ── financing signal derivation (pure) ──────────────────────────────────────
export interface FinancingSignalSpec { signal_type: string; score: number; title: string; reason: string; recommended_action: string }
export function deriveFinancingSignals(buyerName: string, f: FinancingResult): FinancingSignalSpec[] {
  const out: FinancingSignalSpec[] = [];
  if (!f.inputsComplete) {
    out.push({ signal_type: "buyer_missing_financing_data", score: 70, title: `נתוני מימון חסרים — ${buyerName}`, reason: "ללא נתונים פיננסיים לא ניתן להעריך כושר רכישה", recommended_action: "השלם פרופיל פיננסי לקונה" });
    return out;
  }
  if (f.readinessBand === "ready") out.push({ signal_type: "financing_ready", score: 88, title: `קונה מוכן מימונית — ${buyerName}`, reason: "כושר רכישה גבוה והון עצמי מספק", recommended_action: "תעדף הצגת נכסים מתאימים וקדם לעסקה" });
  if (f.overallReadiness >= 75) out.push({ signal_type: "high_readiness_buyer", score: 84, title: `קונה בעל מוכנות גבוהה — ${buyerName}`, reason: "מוכנות פיננסית ורכישה גבוהות מהממוצע", recommended_action: "האץ את התהליך מול קונה זה" });
  if (f.overallReadiness < 40) out.push({ signal_type: "low_readiness_buyer", score: 60, title: `קונה בעל מוכנות נמוכה — ${buyerName}`, reason: "מוכנות פיננסית נמוכה — סיכון לעיכוב או ביטול", recommended_action: "הפנה לייעוץ מימוני לפני השקעת זמן רב" });
  if (f.cashGap > 0) out.push({ signal_type: "cash_gap", score: 78, title: `פער מזומן — ${buyerName}`, reason: `חסר הון עצמי של כ-${f.cashGap.toLocaleString("he-IL")} ₪`, recommended_action: "בחן מקורות הון נוספים או התאם תקציב" });
  if (f.financingRisk === "high" || f.financingRisk === "critical") out.push({ signal_type: "financing_risk", score: 82, title: `סיכון מימוני — ${buyerName}`, reason: "סבירות אישור נמוכה או פער מזומן", recommended_action: "הפנה לייעוץ מימוני וודא ריאליות התקציב" });
  if (f.financingGap > 0) out.push({ signal_type: "buyer_budget_unrealistic", score: 66, title: `תקציב לא ריאלי — ${buyerName}`, reason: `התקציב הרצוי גבוה מהיכולת בכ-${f.financingGap.toLocaleString("he-IL")} ₪`, recommended_action: "התאם ציפיות או הצג נכסים בטווח הריאלי" });
  if (f.financingGap < 0 && f.cashGap <= 0 && f.readinessBand === "ready") out.push({ signal_type: "buyer_can_upgrade_budget", score: 64, title: `אפשרות שדרוג תקציב — ${buyerName}`, reason: "כושר הרכישה גבוה מהתקציב המוצהר", recommended_action: "הצג נכסים איכותיים יותר בטווח הגבוה" });
  if (f.readinessBand === "ready" || f.overallReadiness >= 70) out.push({ signal_type: "financing_opportunity", score: 72, title: `הזדמנות מימונית — ${buyerName}`, reason: "כוח קנייה ממומש שכדאי לתעדף", recommended_action: "התאם נכסים בטווח הריאלי וקדם" });
  return out;
}
