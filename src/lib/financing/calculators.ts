/**
 * Pure, client-safe mortgage & financing calculators for the Israeli market.
 * Estimates only — NOT financial advice and NOT a bank approval.
 */

export interface MortgageInputs {
  propertyPrice: number;
  equity: number; // down payment / הון עצמי
  annualRatePct: number;
  years: number;
  monthlyIncome: number;
  monthlyObligations: number;
  buyerType: "first_home" | "upgrader" | "investor";
}

export interface MortgageResult {
  loanAmount: number;
  monthlyPayment: number;
  financingPct: number; // LTV
  maxFinancingPct: number; // regulatory ceiling for the buyer type
  equityGap: number; // extra equity needed to meet the LTV ceiling
  dtiPct: number; // debt-to-income including the new payment
  safeMonthlyPayment: number; // 33% of income minus existing obligations
  maxBudget: number; // affordable property price at the LTV ceiling
  readinessScore: number; // 0..100
  risk: "low" | "medium" | "high";
  nextStep: string;
}

/** Bank of Israel LTV ceilings by buyer type. */
export const MAX_LTV: Record<MortgageInputs["buyerType"], number> = {
  first_home: 75,
  upgrader: 70,
  investor: 50,
};

export const BUYER_TYPE_LABELS: Record<MortgageInputs["buyerType"], string> = {
  first_home: "דירה ראשונה",
  upgrader: "משפר דיור",
  investor: "משקיע",
};

/** Standard fixed-rate amortized monthly payment. */
export function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Inverse: largest principal whose payment fits a monthly budget. */
export function maxPrincipalForPayment(payment: number, annualRatePct: number, years: number): number {
  if (payment <= 0 || years <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return payment * n;
  return (payment * (1 - Math.pow(1 + r, -n))) / r;
}

export function computeMortgage(input: MortgageInputs): MortgageResult {
  const price = Math.max(0, input.propertyPrice);
  const equity = Math.max(0, input.equity);
  const loanAmount = Math.max(0, price - equity);
  const payment = monthlyPayment(loanAmount, input.annualRatePct, input.years);
  const financingPct = price > 0 ? (loanAmount / price) * 100 : 0;
  const maxFinancingPct = MAX_LTV[input.buyerType];

  // Equity needed so LTV <= ceiling.
  const minEquityForCeiling = price * (1 - maxFinancingPct / 100);
  const equityGap = Math.max(0, minEquityForCeiling - equity);

  const safeMonthlyPayment = Math.max(0, input.monthlyIncome * 0.33 - input.monthlyObligations);
  const dtiPct =
    input.monthlyIncome > 0 ? ((input.monthlyObligations + payment) / input.monthlyIncome) * 100 : 0;

  // Affordable property price: payment capacity → max loan, capped by LTV + equity.
  const affordableLoan = maxPrincipalForPayment(safeMonthlyPayment, input.annualRatePct, input.years);
  const budgetByLtv = equity / (1 - maxFinancingPct / 100 || 1);
  const maxBudget = Math.max(0, Math.min(affordableLoan + equity, budgetByLtv));

  // Readiness: penalise high LTV, high DTI, and equity gaps.
  let score = 100;
  if (financingPct > maxFinancingPct) score -= 30;
  if (dtiPct > 40) score -= 30;
  else if (dtiPct > 33) score -= 15;
  if (equityGap > 0) score -= 20;
  if (payment > safeMonthlyPayment && safeMonthlyPayment > 0) score -= 15;
  score = Math.max(0, Math.min(100, score));

  const risk: MortgageResult["risk"] =
    score >= 75 ? "low" : score >= 45 ? "medium" : "high";

  let nextStep: string;
  if (equityGap > 0) nextStep = `יש להגדיל הון עצמי בכ-${Math.round(equityGap).toLocaleString("he-IL")} ₪ כדי לעמוד במגבלת המימון.`;
  else if (dtiPct > 40) nextStep = "יחס ההחזר גבוה — כדאי להאריך תקופה, להקטין הלוואה או להפחית התחייבויות.";
  else if (risk === "low") nextStep = "פרופיל מימוני בריא — אפשר להתקדם לאישור עקרוני מהבנק.";
  else nextStep = "מומלץ לבדוק אישור עקרוני ולבחון תמהיל משכנתא מותאם.";

  return {
    loanAmount,
    monthlyPayment: payment,
    financingPct,
    maxFinancingPct,
    equityGap,
    dtiPct,
    safeMonthlyPayment,
    maxBudget,
    readinessScore: score,
    risk,
    nextStep,
  };
}

// ── Investment yield ─────────────────────────────────────────────────────────
export interface YieldInputs {
  propertyPrice: number;
  monthlyRent: number;
  monthlyExpenses: number;
}
export interface YieldResult {
  grossYieldPct: number;
  netYieldPct: number;
  annualNetIncome: number;
}
export function computeYield(input: YieldInputs): YieldResult {
  const price = Math.max(0, input.propertyPrice);
  const annualGross = Math.max(0, input.monthlyRent) * 12;
  const annualNet = (Math.max(0, input.monthlyRent) - Math.max(0, input.monthlyExpenses)) * 12;
  return {
    grossYieldPct: price > 0 ? (annualGross / price) * 100 : 0,
    netYieldPct: price > 0 ? (annualNet / price) * 100 : 0,
    annualNetIncome: annualNet,
  };
}

export const FINANCING_DISCLAIMER =
  "החישוב הוא הערכה בלבד ואינו ייעוץ משכנתאות ואינו אישור בנקאי.";
