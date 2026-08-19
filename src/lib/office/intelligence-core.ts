// ============================================================================
// ZONO — Office Intelligence: PURE explainable-analysis core (no IO, no clock, no
// LLM). Real facts in → deterministic analysis → explainable insight (with
// evidence, sample size and an HONEST confidence) → a management question/action.
// It NEVER fabricates a metric, NEVER emits a black-box score, and NEVER claims
// causality — every generated sentence uses associative language ("בקרב", "אחרי",
// "התקדמו בשיעור גבוה יותר"), never "גרם". When the sample is too small it says so
// ("אין עדיין מספיק נתונים") instead of inventing an insight. Self-contained so the
// deterministic suite runs under `node --test`.
// ============================================================================

export type Confidence = "strong" | "moderate" | "insufficient_data";
export type Severity = "info" | "attention" | "critical";
export type InsightType =
  | "funnel" | "lead_source" | "response_time" | "followup_gap" | "deal_bottleneck"
  | "lost_reasons" | "property_demand" | "inventory_gap" | "marketing" | "viewing_feedback";

export interface Insight {
  id: string;
  type: InsightType;
  severity: Severity;
  title: string;            // the takeaway, in plain Hebrew
  explanation: string;      // why / how it was derived (associative, never causal)
  evidence: string[];       // the real numbers behind it
  sampleSize?: number;
  confidence: Confidence;
  route?: string;           // deep-link into an existing engine
  actionLabel?: string;
}

// ── Sample thresholds (single source of truth) ───────────────────────────────
export const MIN_STRONG = 30;
export const MIN_MODERATE = 12;
export const MIN_INSIGHT = 8;     // below this, an insight is "insufficient_data"
export const NEW_OFFICE_TOTAL = 10;  // fewer signals than this ⇒ "ZONO still learning"

export function confidenceForSample(n: number): Confidence {
  if (n >= MIN_STRONG) return "strong";
  if (n >= MIN_MODERATE) return "moderate";
  return "insufficient_data";
}

// ── Safe math ────────────────────────────────────────────────────────────────
export function ratePct(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal
}
export function pctChange(current: number, previous: number): number | null {
  if (!previous || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
function fmtPct(v: number | null): string { return v == null ? "—" : `${v}%`; }

// ── Funnel (Phase 3) ─────────────────────────────────────────────────────────
export interface FunnelStepInput { key: string; label: string; count: number }
export interface FunnelStep { key: string; label: string; count: number; conversionFromPrev: number | null }

/** Build the office funnel from ONLY the steps the server could truly derive. */
export function buildFunnel(steps: FunnelStepInput[]): FunnelStep[] {
  return steps.map((s, i) => ({
    ...s,
    conversionFromPrev: i === 0 ? null : ratePct(s.count, steps[i - 1].count),
  }));
}

// ── Lead source quality (Phase 4) ────────────────────────────────────────────
// "progressed" = reached the qualified stage or beyond (reliably lead-derived).
// Viewings are NOT attributed to a lead source (that link isn't reliable), so the
// progression measure is stage progression, stated as such.
export interface LeadSourceInput { source: string; label: string; leads: number; contacted: number; progressed: number; deals: number }
export interface LeadSourceRow extends LeadSourceInput { progressionShare: number | null }
export interface LeadSourceAnalysis { rows: LeadSourceRow[]; insight: Insight | null }

/** Per-source progression. Never calls a source "best" by lead count alone — the
 *  insight compares progression SHARE, and only when both sources have enough leads. */
export function analyzeLeadSources(inputs: LeadSourceInput[]): LeadSourceAnalysis {
  const rows: LeadSourceRow[] = inputs
    .map((s) => ({ ...s, progressionShare: ratePct(s.progressed, s.leads) }))
    .sort((a, b) => b.leads - a.leads);

  let insight: Insight | null = null;
  const eligible = rows.filter((r) => r.leads >= MIN_INSIGHT && r.progressionShare != null);
  if (eligible.length >= 2) {
    const byShare = [...eligible].sort((a, b) => (b.progressionShare ?? 0) - (a.progressionShare ?? 0));
    const top = byShare[0], bottom = byShare[byShare.length - 1];
    // Only surface when the difference is meaningful.
    if ((top.progressionShare ?? 0) - (bottom.progressionShare ?? 0) >= 10) {
      const sample = eligible.reduce((s, r) => s + r.leads, 0);
      insight = {
        id: "lead_source:progression", type: "lead_source",
        severity: "info", confidence: confidenceForSample(sample), sampleSize: sample,
        title: `${top.label} מוביל בשיעור ההתקדמות של לידים`,
        explanation: `${top.label} הביא ${top.leads} לידים, ומתוכם ${fmtPct(top.progressionShare)} התקדמו לשלב מוסמך ומעלה — לעומת ${fmtPct(bottom.progressionShare)} ב${bottom.label}. זו התאמה שנצפתה בתקופה, לא קביעה סיבתית.`,
        evidence: eligible.map((r) => `${r.label}: ${r.leads} לידים · ${fmtPct(r.progressionShare)} התקדמו`),
        route: "/leads", actionLabel: "צפייה בלידים",
      };
    }
  }
  return { rows, insight };
}

// ── Response time vs progression (Phase 5) — CORRELATION ONLY ────────────────
export interface ResponseBandInput { band: string; leads: number; progressed: number }
export interface ResponseBandRow extends ResponseBandInput { progressionRate: number | null }
export interface ResponseTimeAnalysis { bands: ResponseBandRow[]; insight: Insight | null; confidence: Confidence }

/** Group leads by first-response delay and compare progression SHARE. Never claims
 *  fast response CAUSED progression — only that progression was higher AMONG faster
 *  cohorts. Gated by total sample; small samples → insufficient_data. */
export function analyzeResponseTime(inputs: ResponseBandInput[]): ResponseTimeAnalysis {
  const bands: ResponseBandRow[] = inputs.map((b) => ({ ...b, progressionRate: ratePct(b.progressed, b.leads) }));
  const total = inputs.reduce((s, b) => s + b.leads, 0);
  const confidence = confidenceForSample(total);
  if (confidence === "insufficient_data") {
    return { bands, insight: { id: "response_time:insufficient", type: "response_time", severity: "info", confidence, sampleSize: total, title: "אין עדיין מספיק נתונים על זמני מענה", explanation: "כשיצטברו יותר לידים עם מגע ראשון מתועד, ZONO תוכל להשוות בין זמני המענה להתקדמות.", evidence: [`נבדקו ${total} לידים`] }, confidence };
  }
  // Compare the fastest populated band to the slowest populated band.
  const populated = bands.filter((b) => (b.leads >= MIN_INSIGHT) && b.progressionRate != null);
  let insight: Insight | null = null;
  if (populated.length >= 2) {
    const fast = populated[0], slow = populated[populated.length - 1];
    const diff = (fast.progressionRate ?? 0) - (slow.progressionRate ?? 0);
    if (diff >= 10) {
      const ratio = slow.progressionRate && slow.progressionRate > 0 ? Math.round(((fast.progressionRate ?? 0) / slow.progressionRate) * 10) / 10 : null;
      insight = {
        id: "response_time:progression", type: "response_time", severity: "attention", confidence, sampleSize: total,
        title: `לידים שקיבלו מענה מהיר התקדמו יותר`,
        explanation: `בקרב לידים שקיבלו מגע ראשון תוך ${fast.band}, ${fmtPct(fast.progressionRate)} התקדמו — לעומת ${fmtPct(slow.progressionRate)} בקרב מי שהמענה אליהם ארך ${slow.band}${ratio ? ` (פי ${ratio})` : ""}. זו התאמה שנצפתה, לא הוכחת סיבתיות.`,
        evidence: populated.map((b) => `${b.band}: ${b.leads} לידים · ${fmtPct(b.progressionRate)} התקדמו`),
        route: "/office", actionLabel: "בדיקת תהליך המענה",
      };
    }
  }
  return { bands, insight, confidence };
}

// ── Follow-up gap (Phase 6) ──────────────────────────────────────────────────
export function analyzeFollowupGap(input: { activeLeads: number; noNextAction: number; overdue: number }): Insight | null {
  if (input.activeLeads < MIN_INSIGHT) return null;
  const share = ratePct(input.noNextAction, input.activeLeads);
  if (input.noNextAction === 0 && input.overdue === 0) return null;
  const severity: Severity = (share ?? 0) >= 25 ? "attention" : "info";
  return {
    id: "followup:gap", type: "followup_gap", severity, confidence: confidenceForSample(input.activeLeads), sampleSize: input.activeLeads,
    title: `${fmtPct(share)} מהלידים הפעילים ללא פעולה הבאה`,
    explanation: `מתוך ${input.activeLeads} לידים פעילים, ל-${input.noNextAction} אין פעולה הבאה מתוזמנת ו-${input.overdue} במעקב שחלף זמנו.`,
    evidence: [`${input.activeLeads} לידים פעילים`, `${input.noNextAction} ללא פעולה הבאה`, `${input.overdue} מעקבים באיחור`],
    route: "/office", actionLabel: "פתח חריגים",
  };
}

// ── Deal stage bottleneck (Phase 7) ──────────────────────────────────────────
export interface StageDurationInput { stage: string; label: string; medianDays: number | null; count: number }
export interface DealBottleneckAnalysis { stages: StageDurationInput[]; insight: Insight | null }

/** Surface the stage that holds deals markedly longer than the rest. */
export function analyzeDealBottleneck(stages: StageDurationInput[]): DealBottleneckAnalysis {
  const withData = stages.filter((s) => s.medianDays != null && s.count >= 3);
  let insight: Insight | null = null;
  if (withData.length >= 2) {
    const sorted = [...withData].sort((a, b) => (b.medianDays ?? 0) - (a.medianDays ?? 0));
    const worst = sorted[0];
    const others = sorted.slice(1);
    const othersAvg = others.reduce((s, x) => s + (x.medianDays ?? 0), 0) / others.length;
    if ((worst.medianDays ?? 0) >= othersAvg * 2 && (worst.medianDays ?? 0) - othersAvg >= 3) {
      const totalCount = withData.reduce((s, x) => s + x.count, 0);
      insight = {
        id: "deal_bottleneck", type: "deal_bottleneck", severity: "attention", confidence: confidenceForSample(totalCount), sampleSize: totalCount,
        title: `שלב "${worst.label}" מחזיק עסקאות זמן רב יותר`,
        explanation: `בשלב "${worst.label}" עסקאות שוהות בממוצע ${worst.medianDays} ימים, לעומת כ-${Math.round(othersAvg)} ימים בשאר השלבים.`,
        evidence: withData.map((s) => `${s.label}: חציון ${s.medianDays} ימים (${s.count} עסקאות)`),
        route: "/deals", actionLabel: "בדיקת השלב",
      };
    }
  }
  return { stages, insight };
}

// ── Lost reasons (Phase 8) — ONLY from structured objections ─────────────────
export interface LostReasonInput { reason: string; label: string; count: number }
export function analyzeLostReasons(reasons: LostReasonInput[]): Insight | null {
  const total = reasons.reduce((s, r) => s + r.count, 0);
  if (total < MIN_INSIGHT) return null;
  const top = [...reasons].sort((a, b) => b.count - a.count)[0];
  return {
    id: "lost_reasons", type: "lost_reasons", severity: "info", confidence: confidenceForSample(total), sampleSize: total,
    title: `הסיבה הנפוצה להתנגדות: ${top.label}`,
    explanation: `מתוך ${total} התנגדויות מתועדות בעסקאות, ${top.label} חוזרת הכי הרבה. מבוסס על שדה התנגדות מובנה בלבד.`,
    evidence: reasons.sort((a, b) => b.count - a.count).map((r) => `${r.label}: ${r.count}`),
  };
}

// ── Property demand classification (Phase 9) ─────────────────────────────────
export interface PropertyDemandInput { propertyId: string; title: string; matches: number; interested: number; viewings: number; deals: number }
export type DemandClass = "high_demand_low_progression" | "low_demand" | "active_progression" | "normal";
export interface PropertyDemandRow extends PropertyDemandInput { demandClass: DemandClass }
export interface PropertyDemandAnalysis { rows: PropertyDemandRow[]; highDemandLowProgression: PropertyDemandRow[]; lowDemand: PropertyDemandRow[]; insight: Insight | null }

export const DEMAND_STRONG_MATCHES = 5;   // interest signals that count as "demand"
export const DEMAND_INTEREST = 2;

export function classifyPropertyDemand(props: PropertyDemandInput[]): PropertyDemandAnalysis {
  const rows: PropertyDemandRow[] = props.map((p) => {
    const demand = p.matches >= DEMAND_STRONG_MATCHES || p.interested >= DEMAND_INTEREST;
    const progressing = p.viewings > 0 || p.deals > 0;
    let demandClass: DemandClass = "normal";
    if (demand && !progressing) demandClass = "high_demand_low_progression";
    else if (!demand && p.matches === 0 && p.interested === 0) demandClass = "low_demand";
    else if (progressing) demandClass = "active_progression";
    return { ...p, demandClass };
  });
  const highDemandLowProgression = rows.filter((r) => r.demandClass === "high_demand_low_progression").sort((a, b) => (b.matches + b.interested) - (a.matches + a.interested));
  const lowDemand = rows.filter((r) => r.demandClass === "low_demand");

  let insight: Insight | null = null;
  if (highDemandLowProgression.length > 0) {
    const top = highDemandLowProgression[0];
    insight = {
      id: "property_demand:stuck", type: "property_demand", severity: "attention", confidence: "moderate", sampleSize: props.length,
      title: `${highDemandLowProgression.length} נכסים מושכים עניין אך לא מתקדמים לביקור`,
      explanation: `לדוגמה "${top.title}" — ${top.matches} התאמות ו-${top.interested} מתעניינים, אך ${top.viewings} ביקורים. שווה לבדוק תמחור/הצגה או לקדם ביקורים.`,
      evidence: highDemandLowProgression.slice(0, 5).map((p) => `${p.title}: ${p.matches} התאמות · ${p.interested} מתעניינים · ${p.viewings} ביקורים`),
      route: `/properties/${top.propertyId}`, actionLabel: "פתח מרכז שליטה",
    };
  }
  return { rows, highDemandLowProgression, lowDemand, insight };
}

// ── Inventory gap / demand map (Phase 12-13) — from real demand clusters ─────
export interface DemandClusterInput { area: string; propertyType: string | null; roomsBucket: string | null; activeBuyers: number; inventory: number; gapBand: string }
export interface InventoryGapAnalysis { gaps: DemandClusterInput[]; insight: Insight | null }

export function analyzeInventoryGaps(clusters: DemandClusterInput[]): InventoryGapAnalysis {
  const gaps = clusters
    .filter((c) => c.activeBuyers >= 3 && (c.gapBand === "critical" || c.gapBand === "very_high" || c.gapBand === "high" || c.inventory === 0 || c.activeBuyers >= c.inventory * 3))
    .sort((a, b) => (b.activeBuyers - b.inventory) - (a.activeBuyers - a.inventory))
    .slice(0, 8);
  let insight: Insight | null = null;
  if (gaps.length > 0) {
    const top = gaps[0];
    const desc = [top.roomsBucket, top.propertyType, `ב${top.area}`].filter(Boolean).join(" ");
    insight = {
      id: "inventory_gap", type: "inventory_gap", severity: "info", confidence: "moderate", sampleSize: clusters.length,
      title: `הזדמנות מלאי: ביקוש גבוה ל${desc}`,
      explanation: `${top.activeBuyers} קונים פעילים מחפשים ${desc}, ורק ${top.inventory} נכסים פעילים מתאימים. פער שמצדיק מיקוד בגיוס נכסים.`,
      evidence: gaps.map((g) => `${[g.roomsBucket, g.propertyType, g.area].filter(Boolean).join(" · ")}: ${g.activeBuyers} קונים · ${g.inventory} נכסים`),
      actionLabel: "מיקוד גיוס נכסים",
    };
  }
  return { gaps, insight };
}

// ── Marketing (Phase 14) — correlation-safe summary ──────────────────────────
export interface MarketingInput { publications: number; propertiesPublished: number; matchSends: number; responses: number; failures: number; propertiesNoMarketing: number }
export function analyzeMarketing(m: MarketingInput): Insight | null {
  if (m.publications === 0 && m.matchSends === 0 && m.propertiesNoMarketing === 0) return null;
  const responseRate = ratePct(m.responses, m.matchSends);
  const severity: Severity = m.failures > 0 ? "attention" : "info";
  return {
    id: "marketing:summary", type: "marketing", severity, confidence: confidenceForSample(m.publications + m.matchSends), sampleSize: m.publications + m.matchSends,
    title: m.propertiesNoMarketing > 0 ? `${m.propertiesNoMarketing} נכסים פעילים ללא שיווק בתקופה` : "סיכום פעילות שיווק",
    explanation: `בתקופה: ${m.publications} פרסומים על ${m.propertiesPublished} נכסים, ${m.matchSends} שליחות התאמה ללקוחות${responseRate != null ? ` (${fmtPct(responseRate)} הגיבו)` : ""}. ${m.failures > 0 ? `${m.failures} פרסומים נכשלו.` : ""} מדובר בפעולות ותגובות שנצפו אחריהן — לא בייחוס סיבתי של עסקה לפרסום.`,
    evidence: [`${m.publications} פרסומים`, `${m.matchSends} שליחות`, `${m.responses} תגובות`, `${m.failures} כשלים`, `${m.propertiesNoMarketing} נכסים ללא שיווק`],
    route: "/distribution/week", actionLabel: "הכן תוכנית שיווק",
  };
}

// ── Recommendations (Phase 20) — rule-based from insights ─────────────────────
export interface Recommendation { id: string; text: string; route?: string; actionLabel?: string }
export function buildRecommendations(insights: Insight[]): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const i of insights) {
    if (i.confidence === "insufficient_data") continue;
    if (i.type === "followup_gap") recs.push({ id: i.id, text: "לבדוק את חלוקת המשימות והמעקבים — יש לידים פעילים ללא פעולה הבאה.", route: "/office", actionLabel: "צפה בלידים" });
    else if (i.type === "response_time") recs.push({ id: i.id, text: "לבחון את תהליך המענה הראשוני ללידים.", route: "/office", actionLabel: "תהליך מענה" });
    else if (i.type === "inventory_gap") recs.push({ id: i.id, text: "למקד גיוס נכסים באזור/סוג עם הביקוש הגבוה.", actionLabel: i.actionLabel });
    else if (i.type === "property_demand") recs.push({ id: i.id, text: "לבדוק נכסים עם עניין גבוה שאינם מתקדמים לביקור.", route: i.route, actionLabel: "פתח מרכז שליטה" });
    else if (i.type === "deal_bottleneck") recs.push({ id: i.id, text: "לבחון את השלב שמחזיק עסקאות זמן רב.", route: "/deals", actionLabel: "בדיקת השלב" });
    else if (i.type === "marketing") recs.push({ id: i.id, text: "להשלים שיווק לנכסים פעילים ללא פרסום.", route: "/distribution/week", actionLabel: "הכן תוכנית" });
  }
  return recs.slice(0, 6);
}

// ── Hero insight + office learning state ─────────────────────────────────────
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, attention: 1, info: 2 };
const CONFIDENCE_RANK: Record<Confidence, number> = { strong: 0, moderate: 1, insufficient_data: 2 };

export function pickHeroInsight(insights: Insight[]): Insight | null {
  const real = insights.filter((i) => i.confidence !== "insufficient_data");
  if (!real.length) return null;
  return [...real].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence])[0];
}

/** A brand-new office with almost no data → learning state (not a wall of noise). */
export function isLearningOffice(totals: { leads: number; deals: number; properties: number }): boolean {
  return (totals.leads + totals.deals + totals.properties) < NEW_OFFICE_TOTAL;
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = { strong: "ביטחון גבוה", moderate: "ביטחון בינוני", insufficient_data: "אין מספיק נתונים" };
export const SEVERITY_LABEL: Record<Severity, string> = { info: "מידע", attention: "לתשומת לב", critical: "קריטי" };
