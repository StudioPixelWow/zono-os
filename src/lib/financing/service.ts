// ============================================================================
// ZONO — Mortgage & Financing Intelligence OS · Service (server-only)
// ----------------------------------------------------------------------------
// Stores buyer financial inputs, computes affordability/readiness via the pure
// engine, regenerates financing_signals (Decision Brain + Automation), and
// aggregates org-wide purchasing power. Permission-aware (org-scoped RLS).
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { computeFinancing, deriveFinancingSignals, type FinancialInputs, type FinancingResult } from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default agent */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface BuyerFinancing {
  buyer_id: string; buyer_name: string; desired_budget: number | null;
  recommended_budget: number | null; max_budget: number | null; safe_budget: number | null;
  monthly_payment_estimate: number | null; cash_gap: number | null; financing_gap: number | null;
  approval_probability: number | null; overall_readiness: number | null;
  financing_risk: string; readiness_band: string; primary_gap: string | null; inputs_complete: boolean;
}
export interface FinancingCommandCenter {
  financingReady: number; financingRisks: number; cashGapAlerts: number; readyToPurchase: number;
  totalPurchasingPower: number; profiles: BuyerFinancing[]; isManager: boolean;
}

function mapRow(row: Record<string, unknown>, name: string, desired: number | null): BuyerFinancing {
  return {
    buyer_id: row.buyer_id as string, buyer_name: name, desired_budget: desired,
    recommended_budget: (row.recommended_budget as number) ?? null, max_budget: (row.max_budget as number) ?? null,
    safe_budget: (row.safe_budget as number) ?? null, monthly_payment_estimate: (row.monthly_payment_estimate as number) ?? null,
    cash_gap: (row.cash_gap as number) ?? null, financing_gap: (row.financing_gap as number) ?? null,
    approval_probability: (row.approval_probability as number) ?? null, overall_readiness: (row.overall_readiness as number) ?? null,
    financing_risk: (row.financing_risk as string) ?? "unknown", readiness_band: (row.readiness_band as string) ?? "unknown",
    primary_gap: (row.primary_gap as string) ?? null, inputs_complete: Boolean(row.inputs_complete),
  };
}

// ── command center ─────────────────────────────────────────────────────────
export async function getFinancingCommandCenter(): Promise<FinancingCommandCenter> {
  const { orgId, isManager, supabase } = await ctx();
  const { data: profData } = await supabase.from("buyer_financial_profiles").select("*").eq("organization_id", orgId).order("overall_readiness", { ascending: false, nullsFirst: false }).limit(300);
  const rows = (profData ?? []) as Record<string, unknown>[];
  const buyerIds = rows.map((r) => r.buyer_id as string);
  const nameById = new Map<string, string>(); const desiredById = new Map<string, number | null>();
  if (buyerIds.length) {
    const { data: buyers } = await supabase.from("buyers").select("id,full_name,budget_max").eq("org_id", orgId).in("id", buyerIds);
    for (const b of (buyers ?? []) as { id: string; full_name: string; budget_max: number | null }[]) { nameById.set(b.id, b.full_name); desiredById.set(b.id, b.budget_max ?? null); }
  }
  const profiles = rows.map((r) => mapRow(r, nameById.get(r.buyer_id as string) ?? "קונה", desiredById.get(r.buyer_id as string) ?? null));

  const financingReady = profiles.filter((p) => p.readiness_band === "ready").length;
  const financingRisks = profiles.filter((p) => p.financing_risk === "high" || p.financing_risk === "critical").length;
  const cashGapAlerts = profiles.filter((p) => (p.cash_gap ?? 0) > 0).length;
  const readyToPurchase = profiles.filter((p) => p.readiness_band === "ready" && (p.cash_gap ?? 0) <= 0).length;
  const totalPurchasingPower = profiles.reduce((s, p) => s + (p.max_budget ?? 0), 0);

  return { financingReady, financingRisks, cashGapAlerts, readyToPurchase, totalPurchasingPower, profiles, isManager };
}

// ── per-buyer ─────────────────────────────────────────────────────────────────
export async function getBuyerFinancing(buyerId: string): Promise<BuyerFinancing | null> {
  const { orgId, supabase } = await ctx();
  const { data: buyer } = await supabase.from("buyers").select("full_name,budget_max").eq("org_id", orgId).eq("id", buyerId).maybeSingle();
  const b = buyer as { full_name?: string; budget_max?: number | null } | null;
  const { data } = await supabase.from("buyer_financial_profiles").select("*").eq("organization_id", orgId).eq("buyer_id", buyerId).maybeSingle();
  if (!data) return null;
  return mapRow(data as Record<string, unknown>, b?.full_name ?? "קונה", b?.budget_max ?? null);
}

// ── save inputs + compute + regenerate signals ───────────────────────────────
export async function saveFinancialProfile(buyerId: string, input: FinancialInputs & { employmentType?: string | null; notes?: string | null }): Promise<{ result: FinancingResult }> {
  const { orgId, supabase } = await ctx();
  const { data: buyer } = await supabase.from("buyers").select("full_name,budget_max").eq("org_id", orgId).eq("id", buyerId).maybeSingle();
  const b = buyer as { full_name?: string; budget_max?: number | null } | null;
  if (!b) throw new Error("הקונה לא נמצא");

  const f = computeFinancing({ ...input, desiredBudget: input.desiredBudget ?? b.budget_max ?? null });

  await supabase.from("buyer_financial_profiles").upsert({
    organization_id: orgId, buyer_id: buyerId,
    monthly_income: input.monthlyIncome ?? null, household_income: input.householdIncome ?? null,
    employment_type: input.employmentType ?? null, self_employed: input.selfEmployed ?? false, salary_employed: input.salaryEmployed ?? true,
    existing_mortgage: input.existingMortgage ?? null, monthly_debt: input.monthlyDebt ?? null,
    available_equity: input.availableEquity ?? null, available_down_payment: input.availableDownPayment ?? null, investment_capital: input.investmentCapital ?? null,
    recommended_budget: f.recommendedBudget, max_budget: f.maxBudget, safe_budget: f.safeBudget,
    monthly_payment_estimate: f.monthlyPaymentEstimate, down_payment_gap: f.downPaymentGap, financing_gap: f.financingGap,
    required_equity: f.requiredEquity, cash_gap: f.cashGap,
    financial_readiness_score: f.financialReadinessScore, financing_confidence_score: f.financingConfidenceScore,
    approval_probability: f.approvalProbability, financing_strength: f.financingStrength,
    purchase_readiness: f.purchaseReadiness, overall_readiness: f.overallReadiness,
    financing_risk: f.financingRisk, readiness_band: f.readinessBand, primary_gap: f.primaryGap,
    notes: input.notes ?? null, inputs_complete: f.inputsComplete, computed_at: new Date().toISOString(),
  }, { onConflict: "organization_id,buyer_id" });

  // regenerate this buyer's financing signals
  await supabase.from("financing_signals").delete().eq("organization_id", orgId).eq("buyer_id", buyerId).eq("status", "open");
  const specs = deriveFinancingSignals(b.full_name ?? "קונה", f);
  if (specs.length) {
    await supabase.from("financing_signals").insert(specs.map((s) => ({
      organization_id: orgId, buyer_id: buyerId, signal_type: s.signal_type, score: s.score, title: s.title, reason: s.reason, recommended_action: s.recommended_action, status: "open",
    })));
  }
  return { result: f };
}

// ── recompute all profiles (refresh after assumptions change) ─────────────────
export async function recomputeAllFinancing(): Promise<{ updated: number }> {
  const { orgId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול לחשב מחדש את כל הפרופילים");
  const { data } = await supabase.from("buyer_financial_profiles").select("buyer_id,monthly_income,household_income,employment_type,self_employed,salary_employed,existing_mortgage,monthly_debt,available_equity,available_down_payment,investment_capital").eq("organization_id", orgId);
  const rows = (data ?? []) as Record<string, unknown>[];
  let updated = 0;
  for (const r of rows) {
    try {
      await saveFinancialProfile(r.buyer_id as string, {
        monthlyIncome: (r.monthly_income as number) ?? null, householdIncome: (r.household_income as number) ?? null,
        employmentType: (r.employment_type as string) ?? null, selfEmployed: Boolean(r.self_employed), salaryEmployed: Boolean(r.salary_employed),
        existingMortgage: (r.existing_mortgage as number) ?? null, monthlyDebt: (r.monthly_debt as number) ?? null,
        availableEquity: (r.available_equity as number) ?? null, availableDownPayment: (r.available_down_payment as number) ?? null, investmentCapital: (r.investment_capital as number) ?? null,
      });
      updated++;
    } catch { /* skip individual failures */ }
  }
  return { updated };
}
