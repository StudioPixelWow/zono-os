// ============================================================================
// ZONO — Autonomous Office AI Layer · Pure reasoning engine (client-safe)
// ----------------------------------------------------------------------------
// Reasons over a unified snapshot (sourced from the Decision Brain's
// attention_items + opportunity_signals + guarded metrics) into prioritized
// opportunities, risks, role-specific focus, briefs, growth plans and
// what-if simulations. Deterministic. No I/O, no LLM, no autonomous actions.
// ============================================================================

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

export type Role = "agent" | "manager" | "executive";

/** A normalized signal from the Decision Brain (attention_items / opportunity_signals). */
export interface Signal {
  entity_type: string; entity_id: string | null; title: string; reason: string | null;
  recommended_action: string | null; attention: number; urgency: number; impact: number;
  confidence: number; revenue_impact: number; relationship_impact: number; churn_impact: number;
  kind: "attention" | "opportunity";
}

/** Aggregate office metrics gathered (read-only) from existing modules. */
export interface OfficeMetrics {
  openDeals: number; wonDeals: number; lostDeals: number;
  pipelineWeightedRevenue: number; atRiskRevenue: number;
  financingReady: number; financingRisk: number;
  referralRevenue: number; ambassadors: number;
  territoryOpportunities: number; pendingSignatures: number; blockedDeals: number;
}

export interface Snapshot { signals: Signal[]; metrics: OfficeMetrics }

// ── module classification for a signal (which system it came from) ────────────
const MODULE_BY_ENTITY: Record<string, string> = {
  recommendation: "recommendations", territory: "territory", portal: "portals",
  office_website: "office-website", agent_website: "agent-website", automation: "automation",
  document: "documents", financing: "financing", reputation: "reputation",
  buyer: "buyers", seller: "sellers", property: "properties", match: "matching", deal: "deals",
  property_intelligence: "properties", external_listing: "acquisition", infra: "system",
};
export const moduleOf = (entityType: string) => MODULE_BY_ENTITY[entityType] ?? entityType;

const RISK_ENTITY = new Set(["financing", "document", "deal", "seller", "infra"]);
const isRiskSignal = (s: Signal) =>
  s.churn_impact > 0 || RISK_ENTITY.has(s.entity_type) || /סיכון|חסומ|נכשל|פג|דחוף|ירידה|פער|חסר/.test(s.title + (s.reason ?? ""));
const isOpportunitySignal = (s: Signal) =>
  s.kind === "opportunity" || s.revenue_impact >= 55 || /הזדמנות|מוכן|חם|צמיחה|מומלצ|הפניה|שגריר|שדרוג/.test(s.title);

// ── opportunities ──────────────────────────────────────────────────────────
export interface OpportunityItem { category: string; title: string; reason: string | null; recommended_action: string | null; source_module: string; impact_score: number; revenue_impact: number; score: number; entity_type: string; entity_id: string | null }
const OPP_CATEGORY: Record<string, string> = {
  financing: "revenue", reputation: "referral", territory: "territory", deal: "deal",
  recommendation: "deal", "office-website": "marketing", "agent-website": "marketing", acquisition: "acquisition",
};
export function generateOpportunities(snap: Snapshot): OpportunityItem[] {
  return snap.signals.filter(isOpportunitySignal).map((s) => {
    const mod = moduleOf(s.entity_type);
    const score = clamp(s.attention * 0.5 + s.revenue_impact * 0.35 + s.impact * 0.15);
    return { category: OPP_CATEGORY[mod] ?? "revenue", title: s.title, reason: s.reason, recommended_action: s.recommended_action, source_module: mod, impact_score: s.impact, revenue_impact: s.revenue_impact, score, entity_type: s.entity_type, entity_id: s.entity_id };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
}

// ── risks ───────────────────────────────────────────────────────────────────
export interface RiskItem { category: string; title: string; reason: string | null; recommended_action: string | null; source_module: string; severity: "low" | "medium" | "high" | "critical"; score: number; entity_type: string; entity_id: string | null }
function severityOf(score: number, churn: number): RiskItem["severity"] {
  if (score >= 85 || churn >= 15) return "critical";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  return "low";
}
export function generateRisks(snap: Snapshot): RiskItem[] {
  return snap.signals.filter(isRiskSignal).map((s) => {
    const mod = moduleOf(s.entity_type);
    const score = clamp(s.urgency * 0.45 + s.attention * 0.3 + s.churn_impact * 1.2 + (100 - s.confidence) * 0.1);
    return { category: mod, title: s.title, reason: s.reason, recommended_action: s.recommended_action, source_module: mod, severity: severityOf(score, s.churn_impact), score, entity_type: s.entity_type, entity_id: s.entity_id };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
}

// ── role-specific focus ───────────────────────────────────────────────────────
export interface FocusItem { rank: number; title: string; reason: string | null; recommended_action: string | null; source_module: string; impact_score: number; entity_type: string; entity_id: string | null }
function focusWeight(role: Role, s: Signal): number {
  if (role === "agent") return s.urgency * 0.45 + s.relationship_impact * 0.3 + s.attention * 0.25;
  if (role === "executive") return s.revenue_impact * 0.45 + s.impact * 0.35 + s.attention * 0.2;
  return s.attention * 0.4 + s.impact * 0.35 + s.revenue_impact * 0.25; // manager
}
export function generateFocus(role: Role, snap: Snapshot): FocusItem[] {
  return [...snap.signals].sort((a, b) => focusWeight(role, b) - focusWeight(role, a)).slice(0, 10)
    .map((s, i) => ({ rank: i + 1, title: s.title, reason: s.reason, recommended_action: s.recommended_action, source_module: moduleOf(s.entity_type), impact_score: clamp(focusWeight(role, s)), entity_type: s.entity_type, entity_id: s.entity_id }));
}

// ── brief generation ──────────────────────────────────────────────────────────
export interface BriefSection { title: string; items: string[] }
export interface Brief { headline: string; summary: string; sections: BriefSection[]; opportunityCount: number; riskCount: number; focusCount: number }
const ROLE_LABEL: Record<Role, string> = { agent: "סוכן", manager: "מנהל", executive: "הנהלה" };
export function generateBrief(role: Role, period: "daily" | "weekly" | "monthly" | "executive", snap: Snapshot): Brief {
  const opps = generateOpportunities(snap); const risks = generateRisks(snap); const focus = generateFocus(role, snap);
  const m = snap.metrics;
  const periodLabel = period === "daily" ? "היומי" : period === "weekly" ? "השבועי" : period === "monthly" ? "החודשי" : "להנהלה";
  const headline = `תדריך ${periodLabel} · ${ROLE_LABEL[role]} — ${focus.length} מוקדי פעולה, ${opps.length} הזדמנויות, ${risks.length} סיכונים`;
  const summary = `צנרת משוקללת ${ils(m.pipelineWeightedRevenue)} · בסיכון ${ils(m.atRiskRevenue)} · ${m.openDeals} עסקאות פתוחות · ${m.financingReady} קונים מוכנים מימונית · ${m.ambassadors} שגרירים.`;
  const sections: BriefSection[] = [
    { title: "מוקדי פעולה היום", items: focus.slice(0, 5).map((f) => `${f.rank}. ${f.title}${f.recommended_action ? ` — ${f.recommended_action}` : ""}`) },
    { title: "הזדמנויות מובילות", items: opps.slice(0, 5).map((o) => `${o.title}${o.revenue_impact ? ` (${ils(o.revenue_impact)})` : ""}`) },
    { title: "סיכונים מובילים", items: risks.slice(0, 5).map((r) => `${r.title} [${r.severity}]`) },
    { title: "מדדי מפתח", items: [
      `הכנסה צפויה משוקללת: ${ils(m.pipelineWeightedRevenue)}`,
      `הכנסה בסיכון: ${ils(m.atRiskRevenue)}`,
      `עסקאות חסומות במסמכים: ${m.blockedDeals} · חתימות ממתינות: ${m.pendingSignatures}`,
      `קונים בסיכון מימוני: ${m.financingRisk} · מוכנים: ${m.financingReady}`,
      `הכנסה מהפניות: ${ils(m.referralRevenue)} · שגרירים: ${m.ambassadors}`,
    ] },
  ];
  return { headline, summary, sections, opportunityCount: opps.length, riskCount: risks.length, focusCount: focus.length };
}

// ── growth planning ────────────────────────────────────────────────────────────
export type GrowthPlanType = "growth_90d" | "office" | "territory_expansion" | "recruitment" | "revenue_acceleration" | "market_share";
export interface GrowthStep { phase: string; action: string; metric: string }
export interface GrowthPlan { plan_type: GrowthPlanType; horizon_days: number; title: string; summary: string; steps: GrowthStep[]; expected_revenue_impact: number }
export function generateGrowthPlan(planType: GrowthPlanType, snap: Snapshot): GrowthPlan {
  const m = snap.metrics;
  const base = Math.max(m.pipelineWeightedRevenue, 500_000);
  const TEMPLATES: Record<GrowthPlanType, { title: string; uplift: number; steps: GrowthStep[] }> = {
    growth_90d: { title: "תוכנית צמיחה ל-90 יום", uplift: 0.18, steps: [
      { phase: "ימים 1-30", action: "מימוש 10 ההזדמנויות המובילות וטיפול בעסקאות החסומות", metric: "סגירת חסמים + המרת הזדמנויות" },
      { phase: "ימים 31-60", action: "האצת קונים מוכנים מימונית והפעלת אוטומציות בטוחות", metric: "+המרות, -זמן טיפול" },
      { phase: "ימים 61-90", action: "מינוף שגרירים והפניות + הרחבת מלאי בשטחים לבנים", metric: "+הכנסה מהפניות, +מלאי" },
    ] },
    office: { title: "תוכנית צמיחת משרד", uplift: 0.15, steps: [
      { phase: "שלב 1", action: "חיזוק סוכנים חלשים וצמצום פערי טיפול", metric: "+ביצועי צוות" },
      { phase: "שלב 2", action: "מיקוד טריטוריות חזקות והרחבת נוכחות", metric: "+נתח שוק אזורי" },
      { phase: "שלב 3", action: "בניית מנוע הפניות ומוניטין", metric: "+הכנסה חוזרת" },
    ] },
    territory_expansion: { title: "תוכנית הרחבת טריטוריה", uplift: 0.22, steps: [
      { phase: "מחקר", action: "זיהוי שטחים לבנים והזדמנויות גיוס", metric: "תובנות הזדמנויות" },
      { phase: "כניסה", action: "גיוס מלאי ראשוני ובניית נוכחות", metric: "+מלאי, +לידים" },
      { phase: "ביסוס", action: "בניית מוניטין אזורי והפניות", metric: "+אמון, +עסקאות" },
    ] },
    recruitment: { title: "תוכנית גיוס סוכנים", uplift: 0.20, steps: [
      { phase: "הגדרה", action: "זיהוי טריטוריות ללא בעלות חזקה", metric: "פערי כיסוי" },
      { phase: "גיוס", action: "גיוס 2 סוכנים לאזורים בעלי פוטנציאל", metric: "+קיבולת טיפול" },
      { phase: "הטמעה", action: "הכשרה והקצאת לידים", metric: "+המרות חדשות" },
    ] },
    revenue_acceleration: { title: "תוכנית האצת הכנסה", uplift: 0.25, steps: [
      { phase: "מיידי", action: "תעדוף עסקאות בסיכויי סגירה גבוהים", metric: "+סגירות מהירות" },
      { phase: "קצר", action: "סגירת פערי מימון ומסמכים חוסמים", metric: "-עיכובים" },
      { phase: "מתמשך", action: "מנוע הפניות + נכסים בטווח ריאלי", metric: "+הכנסה חוזרת" },
    ] },
    market_share: { title: "תוכנית הגדלת נתח שוק", uplift: 0.17, steps: [
      { phase: "ניתוח", action: "זיהוי אזורים בשליטת מתחרים", metric: "ניתוח תחרות" },
      { phase: "התקפה", action: "גיוס מלאי ומיתוג אזורי ממוקד", metric: "+נוכחות" },
      { phase: "שימור", action: "מוניטין והפניות לביצור מובילות", metric: "+אמון אזורי" },
    ] },
  };
  const tpl = TEMPLATES[planType];
  return { plan_type: planType, horizon_days: planType === "growth_90d" ? 90 : 120, title: tpl.title, summary: `תוכנית מבוססת מצב נוכחי — פוטנציאל הגדלת הכנסה צפויה בכ-${Math.round(tpl.uplift * 100)}%.`, steps: tpl.steps, expected_revenue_impact: Math.round(base * tpl.uplift) };
}

// ── simulation engine ──────────────────────────────────────────────────────────
export type ScenarioKey = "hire_agents" | "new_city" | "increase_inventory" | "improve_conversion" | "double_referrals";
export interface Projection { label: string; before: string; after: string; delta: string }
export interface Simulation { scenario_key: ScenarioKey; title: string; summary: string; projections: Projection[] }
export function simulate(scenario: ScenarioKey, snap: Snapshot, magnitude = 1): Simulation {
  const m = snap.metrics; const pipe = Math.max(m.pipelineWeightedRevenue, 300_000); const refRev = Math.max(m.referralRevenue, 0);
  const pct = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}%`;
  switch (scenario) {
    case "hire_agents": {
      const agents = 2 * magnitude; const capUplift = 0.12 * agents; const rev = Math.round(pipe * capUplift);
      return { scenario_key: scenario, title: `גיוס ${agents} סוכנים`, summary: `קיבולת טיפול גדלה — פוטנציאל הכנסה נוסף של כ-${ils(rev)} (${pct(capUplift * 100)}).`, projections: [
        { label: "קיבולת טיפול", before: "נוכחית", after: `+${agents} סוכנים`, delta: pct(capUplift * 100) },
        { label: "הכנסה צפויה", before: ils(pipe), after: ils(pipe + rev), delta: ils(rev) },
      ] };
    }
    case "new_city": {
      const rev = Math.round(pipe * 0.2 * magnitude);
      return { scenario_key: scenario, title: "כניסה לעיר חדשה", summary: `הרחבה גאוגרפית — פוטנציאל הכנסה נוסף של כ-${ils(rev)} תוך 6-12 חודשים.`, projections: [
        { label: "טריטוריות", before: "נוכחיות", after: "+עיר", delta: "+1 אזור פעילות" },
        { label: "הכנסה צפויה (שנתי)", before: ils(pipe), after: ils(pipe + rev), delta: ils(rev) },
      ] };
    }
    case "increase_inventory": {
      const up = 0.15 * magnitude; const rev = Math.round(pipe * up * 0.7);
      return { scenario_key: scenario, title: `הגדלת מלאי ב-${Math.round(up * 100)}%`, summary: `יותר נכסים → יותר עסקאות — פוטנציאל הכנסה נוסף של כ-${ils(rev)}.`, projections: [
        { label: "מלאי", before: "נוכחי", after: pct(up * 100), delta: pct(up * 100) },
        { label: "הכנסה צפויה", before: ils(pipe), after: ils(pipe + rev), delta: ils(rev) },
      ] };
    }
    case "improve_conversion": {
      const up = 0.1 * magnitude; const rev = Math.round(pipe * up * 1.5);
      return { scenario_key: scenario, title: `שיפור המרה ב-${Math.round(up * 100)}%`, summary: `שיפור המרה ממנף את כל הצנרת — פוטנציאל הכנסה נוסף של כ-${ils(rev)}.`, projections: [
        { label: "שיעור המרה", before: "נוכחי", after: pct(up * 100), delta: pct(up * 100) },
        { label: "הכנסה צפויה", before: ils(pipe), after: ils(pipe + rev), delta: ils(rev) },
      ] };
    }
    case "double_referrals": {
      const rev = Math.round((refRev || pipe * 0.1) * 1 * magnitude);
      return { scenario_key: scenario, title: "הכפלת שיעור ההפניות", summary: `הכפלת הפניות — פוטנציאל הכנסה חוזרת נוספת של כ-${ils(rev)}.`, projections: [
        { label: "הכנסה מהפניות", before: ils(refRev), after: ils(refRev + rev), delta: ils(rev) },
        { label: "עלות רכישת לקוח", before: "נוכחית", after: "נמוכה יותר", delta: "-עלות" },
      ] };
    }
  }
}

export const SCENARIOS: { key: ScenarioKey; label: string }[] = [
  { key: "hire_agents", label: "גיוס 2 סוכנים" }, { key: "new_city", label: "כניסה לעיר חדשה" },
  { key: "increase_inventory", label: "הגדלת מלאי ב-15%" }, { key: "improve_conversion", label: "שיפור המרה ב-10%" },
  { key: "double_referrals", label: "הכפלת הפניות" },
];
export const SEVERITY_TONE: Record<string, string> = {
  low: "bg-surface text-muted", medium: "bg-warning-soft text-warning", high: "bg-danger-soft text-danger", critical: "bg-danger-soft text-danger",
};
export const ROLE_LABELS: Record<string, string> = { agent: "סוכן", manager: "מנהל", executive: "הנהלה" };
