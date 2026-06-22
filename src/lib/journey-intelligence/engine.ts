// ============================================================================
// ZONO — Journey Intelligence OS · Pure engine (client-safe, deterministic)
// ----------------------------------------------------------------------------
// Models the living journey of every buyer/seller/lead: stage progression,
// health/velocity/conversion/risk scoring, blocker detection, conversion +
// drop prediction, and milestone derivation. No I/O, no LLM. AI may later
// enrich text generators without changing these signatures.
// ============================================================================

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
export const DAY = 86_400_000;

// ── stage catalogs (mirror the seeded journey_stages) ─────────────────────────
export interface StageDef { key: string; label: string; position: number; terminal?: boolean; won?: boolean }
export const BUYER_STAGES: StageDef[] = [
  { key: "new", label: "קונה חדש", position: 1 }, { key: "discovery", label: "גילוי", position: 2 },
  { key: "qualification", label: "הסמכה", position: 3 }, { key: "budget_validation", label: "אימות תקציב", position: 4 },
  { key: "financing", label: "מימון", position: 5 }, { key: "recommendations", label: "המלצות", position: 6 },
  { key: "property_exploration", label: "חקירת נכסים", position: 7 }, { key: "property_comparison", label: "השוואת נכסים", position: 8 },
  { key: "property_visits", label: "ביקורי נכסים", position: 9 }, { key: "shortlist", label: "רשימה קצרה", position: 10 },
  { key: "negotiation", label: "משא ומתן", position: 11 }, { key: "offer", label: "הצעה", position: 12 },
  { key: "deal", label: "עסקה", position: 13 }, { key: "closing", label: "סגירה", position: 14 },
  { key: "completed", label: "הושלם", position: 15, terminal: true, won: true }, { key: "dropped", label: "נשר", position: 16, terminal: true },
];
export const SELLER_STAGES: StageDef[] = [
  { key: "potential", label: "מוכר פוטנציאלי", position: 1 }, { key: "valuation", label: "הערכת שווי", position: 2 },
  { key: "meeting", label: "פגישה", position: 3 }, { key: "proposal", label: "הצעה", position: 4 },
  { key: "exclusive_discussion", label: "דיון בלעדיות", position: 5 }, { key: "signed", label: "חתום", position: 6 },
  { key: "marketing", label: "שיווק", position: 7 }, { key: "lead_generation", label: "יצירת לידים", position: 8 },
  { key: "viewings", label: "צפיות", position: 9 }, { key: "offers", label: "הצעות", position: 10 },
  { key: "negotiation", label: "משא ומתן", position: 11 }, { key: "deal", label: "עסקה", position: 12 },
  { key: "closing", label: "סגירה", position: 13 }, { key: "completed", label: "הושלם", position: 14, terminal: true, won: true },
  { key: "lost", label: "אבד", position: 15, terminal: true },
];
export function stagesFor(journeyType: string): StageDef[] { return journeyType === "seller" ? SELLER_STAGES : BUYER_STAGES; }
export function stageDef(journeyType: string, key: string): StageDef | undefined { return stagesFor(journeyType).find((s) => s.key === key); }
export function stageLabel(journeyType: string, key: string): string { return stageDef(journeyType, key)?.label ?? key; }
/** Active (non-terminal) stage count, used for progress. */
function activeCount(journeyType: string): number { return stagesFor(journeyType).filter((s) => !s.terminal).length; }
export function stageProgress(journeyType: string, key: string): number {
  const def = stageDef(journeyType, key);
  if (!def) return 0;
  if (def.won) return 100;
  if (def.terminal) return 0; // dropped/lost
  return clamp((def.position / activeCount(journeyType)) * 100);
}

// ── velocity ──────────────────────────────────────────────────────────────────
export type VelocityState = "fast" | "normal" | "slow" | "stuck" | "regression";
export const VELOCITY_LABELS: Record<string, string> = { fast: "מהיר", normal: "רגיל", slow: "איטי", stuck: "תקוע", regression: "נסיגה" };
export interface VelocityInput { daysInStage: number; stageChanges30d: number; regressed: boolean; expectedStageDays: number }
export function computeVelocity(i: VelocityInput): { state: VelocityState; score: number } {
  if (i.regressed) return { state: "regression", score: 15 };
  if (i.daysInStage > i.expectedStageDays * 3) return { state: "stuck", score: 10 };
  if (i.stageChanges30d >= 3) return { state: "fast", score: 90 };
  if (i.daysInStage > i.expectedStageDays * 1.6) return { state: "slow", score: 35 };
  return { state: "normal", score: 60 };
}
/** Heuristic days a stage should take before it's "slow". */
export function expectedStageDays(journeyType: string, key: string): number {
  const slow = ["financing", "exclusive_discussion", "negotiation", "marketing", "lead_generation", "viewings", "closing"];
  return slow.includes(key) ? 21 : 10;
}

// ── scores ────────────────────────────────────────────────────────────────────
export interface JourneyScoreInput {
  journeyType: string; stageKey: string; daysSinceActivity: number | null; engagementSignal: number; // 0..100 from comm-intel
  openBlockers: number; openRisks: number; positiveMomentum: boolean; velocityScore: number; leadScore: number; commCount: number;
}
export interface JourneyScores { health: number; engagement: number; conversion: number; risk: number; velocity: number }
export function computeScores(i: JourneyScoreInput): JourneyScores {
  const engagement = clamp(0.5 * i.engagementSignal + Math.min(30, i.commCount * 4) + (i.daysSinceActivity != null && i.daysSinceActivity <= 3 ? 20 : 0));
  let risk = 0;
  risk += Math.min(40, i.openBlockers * 16);
  risk += Math.min(30, i.openRisks * 12);
  if (i.daysSinceActivity != null && i.daysSinceActivity > 14) risk += Math.min(30, (i.daysSinceActivity - 14) * 2);
  risk = clamp(risk);
  const progress = stageProgress(i.journeyType, i.stageKey);
  const conversion = clamp(progress * 0.4 + i.velocityScore * 0.2 + engagement * 0.2 + i.leadScore * 0.2 - risk * 0.3 + (i.positiveMomentum ? 8 : 0));
  const health = clamp(engagement * 0.3 + i.velocityScore * 0.25 + (100 - risk) * 0.25 + progress * 0.2);
  return { health, engagement, conversion, risk, velocity: i.velocityScore };
}

// ── blockers (10 types) ───────────────────────────────────────────────────────
export type BlockerType = "financing" | "price" | "trust" | "communication" | "timing"
  | "partner_approval" | "competition" | "property_fit" | "inventory_gap" | "motivation_loss";
export const BLOCKER_LABELS: Record<string, string> = {
  financing: "מימון", price: "מחיר", trust: "אמון", communication: "תקשורת", timing: "תזמון",
  partner_approval: "אישור בן/בת זוג", competition: "תחרות", property_fit: "התאמת נכס", inventory_gap: "פער מלאי", motivation_loss: "אובדן מוטיבציה",
};
/** Map communication objection types → journey blockers. */
const OBJECTION_TO_BLOCKER: Record<string, BlockerType> = {
  price: "price", financing: "financing", timing: "timing", trust: "trust", competition: "competition",
  location: "property_fit", property_condition: "property_fit", need_to_think: "motivation_loss", need_to_consult: "partner_approval",
};
export interface BlockerInput {
  objectionTypes: string[]; daysSinceActivity: number | null; unansweredOutbound: number;
  journeyType: string; stageKey: string; hasInventoryGap: boolean; lowEngagement: boolean;
}
export function detectBlockers(i: BlockerInput): { type: BlockerType; severity: string }[] {
  const out = new Map<BlockerType, string>();
  for (const o of i.objectionTypes) { const b = OBJECTION_TO_BLOCKER[o]; if (b) out.set(b, b === "price" || b === "financing" || b === "trust" || b === "competition" ? "high" : "medium"); }
  if (i.unansweredOutbound >= 2 || (i.daysSinceActivity ?? 0) > 10) out.set("communication", "medium");
  if (i.lowEngagement && (i.daysSinceActivity ?? 0) > 14) out.set("motivation_loss", "high");
  if (i.journeyType === "buyer" && i.hasInventoryGap && ["recommendations", "property_exploration", "shortlist"].includes(i.stageKey)) out.set("inventory_gap", "medium");
  return Array.from(out.entries()).map(([type, severity]) => ({ type, severity }));
}

// ── prediction engine ─────────────────────────────────────────────────────────
export interface PredictionInput {
  journeyType: string; stageKey: string; conversion: number; risk: number; velocityScore: number;
  daysSinceActivity: number | null; expectedDealValue: number | null; commissionRate: number;
}
export interface Prediction { probabilityConvert: number; probabilityDrop: number; expectedDaysToConvert: number; expectedDealValue: number | null; expectedCommission: number | null }
export function predict(i: PredictionInput): Prediction {
  const def = stageDef(i.journeyType, i.stageKey);
  const progress = stageProgress(i.journeyType, i.stageKey);
  let convert = clamp(i.conversion * 0.6 + progress * 0.3 + i.velocityScore * 0.1 - i.risk * 0.2);
  if (def?.won) convert = 100;
  if (def?.terminal && !def?.won) convert = 0;
  const drop = clamp(100 - convert - 0.2 * i.velocityScore + (i.daysSinceActivity != null && i.daysSinceActivity > 21 ? 15 : 0));
  // remaining active stages → expected days
  const remaining = def && !def.terminal ? Math.max(1, activeCount(i.journeyType) - def.position) : 0;
  const perStage = i.velocityScore >= 80 ? 7 : i.velocityScore >= 50 ? 14 : 25;
  const expectedDaysToConvert = remaining * perStage;
  const expectedDealValue = i.expectedDealValue ?? null;
  const expectedCommission = expectedDealValue != null ? Math.round(expectedDealValue * i.commissionRate) : null;
  return { probabilityConvert: convert, probabilityDrop: drop, expectedDaysToConvert, expectedDealValue, expectedCommission };
}

// ── milestones ────────────────────────────────────────────────────────────────
export interface MilestoneDef { key: string; label: string }
export const BUYER_MILESTONES: MilestoneDef[] = [
  { key: "first_contact", label: "קשר ראשון" }, { key: "first_meeting", label: "פגישה ראשונה" }, { key: "portal_view", label: "צפייה בפורטל" },
  { key: "property_visit", label: "ביקור בנכס" }, { key: "shortlist_created", label: "רשימה קצרה" }, { key: "offer_submitted", label: "הצעה הוגשה" },
  { key: "deal_created", label: "עסקה נוצרה" }, { key: "deal_closed", label: "עסקה נסגרה" },
];
export const SELLER_MILESTONES: MilestoneDef[] = [
  { key: "first_contact", label: "קשר ראשון" }, { key: "first_meeting", label: "פגישה ראשונה" }, { key: "valuation_done", label: "הערכת שווי" },
  { key: "signed", label: "חתימת בלעדיות" }, { key: "marketing_live", label: "שיווק פעיל" }, { key: "first_viewing", label: "צפייה ראשונה" },
  { key: "offer_received", label: "הצעה התקבלה" }, { key: "deal_closed", label: "עסקה נסגרה" },
];
export function milestonesFor(journeyType: string): MilestoneDef[] { return journeyType === "seller" ? SELLER_MILESTONES : BUYER_MILESTONES; }
/** Which milestones are implied reached by the current stage position. */
export function milestonesReachedByStage(journeyType: string, stageKey: string): string[] {
  const pos = stageDef(journeyType, stageKey)?.position ?? 0;
  if (journeyType === "seller") {
    const out: string[] = ["first_contact"];
    if (pos >= 3) out.push("first_meeting"); if (pos >= 2) out.push("valuation_done"); if (pos >= 6) out.push("signed");
    if (pos >= 7) out.push("marketing_live"); if (pos >= 9) out.push("first_viewing"); if (pos >= 10) out.push("offer_received");
    if (stageKey === "completed") out.push("deal_closed");
    return out;
  }
  const out: string[] = ["first_contact"];
  if (pos >= 3) out.push("first_meeting"); if (pos >= 6) out.push("portal_view"); if (pos >= 9) out.push("property_visit");
  if (pos >= 10) out.push("shortlist_created"); if (pos >= 12) out.push("offer_submitted"); if (pos >= 13) out.push("deal_created");
  if (stageKey === "completed") out.push("deal_closed");
  return out;
}

// ── readiness + next best action ────────────────────────────────────────────────
export function isReady(journeyType: string, scores: JourneyScores, stageKey: string): boolean {
  const pos = stageDef(journeyType, stageKey)?.position ?? 0;
  const late = journeyType === "buyer" ? pos >= 9 : pos >= 9;
  return scores.conversion >= 70 && scores.risk < 45 && late;
}
export function nextBestAction(journeyType: string, stageKey: string, blockers: { type: BlockerType }[], velocity: VelocityState): string {
  if (blockers.length) return `הסר חסם: ${BLOCKER_LABELS[blockers[0].type]}`;
  if (velocity === "stuck") return "המסע תקוע — צור קשר יזום והחזר מומנטום";
  if (velocity === "regression") return "זוהתה נסיגה — בדוק מה השתנה והחזר אמון";
  const stages = stagesFor(journeyType);
  const idx = stages.findIndex((s) => s.key === stageKey);
  const next = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;
  return next && !next.terminal ? `קדם לשלב הבא: ${next.label}` : "המשך ליווי שוטף";
}

export function aiSummary(journeyType: string, label: string, stageKey: string, scores: JourneyScores, velocity: VelocityState, prediction: Prediction): string {
  return `${label} בשלב ״${stageLabel(journeyType, stageKey)}״ · בריאות ${scores.health} · המרה ${scores.conversion} · קצב ${VELOCITY_LABELS[velocity]} · סיכוי המרה ${prediction.probabilityConvert}%${prediction.expectedDaysToConvert ? ` (~${prediction.expectedDaysToConvert} ימים)` : ""}.`;
}
