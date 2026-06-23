/**
 * Buyer insights engine — deterministic, client + server safe (NO server-only
 * imports). Turns a raw BuyerRow (+ optional intelligence enrichment) into the
 * derived signals the Buyers command center needs: urgency, next best action,
 * financing risk, lifecycle flags, and KPI aggregation.
 *
 * Everything degrades gracefully: when a field is missing we fall back to a
 * neutral value and never throw. Intelligence-board membership (when the buyer
 * digital twin has been initialized) sharpens the signals but is never required.
 */
import type { BadgeTone } from "@/components/ui/Badge";
import type { BuyerRow } from "@/lib/buyers/labels";
import {
  TEMPERATURE_LABELS,
  buyerBudgetLine,
  buyerMissingPreferences,
} from "@/lib/buyers/labels";

const DAY = 86_400_000;

export type NextActionKind =
  | "call"
  | "whatsapp"
  | "send_properties"
  | "update_budget"
  | "schedule_meeting"
  | "mark_handled";

export interface NextAction {
  kind: NextActionKind;
  label: string;
}

export type FinancingRisk = "low" | "medium" | "high" | "unknown";

/**
 * Intelligence-board membership sets (buyerIds), all optional. Derived on the
 * server from listBuyerIntelBoard() so the client can sharpen its deterministic
 * signals when the digital twin exists.
 */
export interface IntelSets {
  needingAttention?: Set<string>;
  closeToPurchase?: Set<string>;
  financingRisks?: Set<string>;
  highEngagement?: Set<string>;
  noActivity?: Set<string>;
}

export interface BuyerInsight {
  buyer: BuyerRow;
  /** 0–100 composite — higher means "act sooner". */
  urgency: number;
  urgencyTone: BadgeTone;
  /** Short Hebrew explanation of WHY this buyer is surfacing. */
  urgencyReason: string;
  nextAction: NextAction;
  financingRisk: FinancingRisk;
  /** Human Hebrew label for the lifecycle stage. */
  stageLabel: string;
  /** "לפני יומיים" / "אתמול" / "טרם נוצר קשר" … */
  lastActivityLabel: string;
  daysSinceContact: number | null;
  /** Number of matched properties, or null when not computed yet. */
  matchCount: number | null;
  // Flags (used by KPIs + filters)
  isNew: boolean;
  needsFollowUp: boolean;
  isInactive: boolean;
  isCloseToBuy: boolean;
  isFinancingRisk: boolean;
  hasMatches: boolean;
  missingPreferences: boolean;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / DAY);
}

/** Hebrew relative-time label, RTL-friendly. */
export function relativeLabel(iso: string | null): string {
  const d = daysSince(iso);
  if (d == null) return "טרם נוצר קשר";
  if (d <= 0) return "היום";
  if (d === 1) return "אתמול";
  if (d < 7) return `לפני ${d} ימים`;
  if (d < 14) return "לפני שבוע";
  if (d < 30) return `לפני ${Math.floor(d / 7)} שבועות`;
  if (d < 60) return "לפני חודש";
  return `לפני ${Math.floor(d / 30)} חודשים`;
}

const STAGE_BY_TEMPERATURE: Record<string, string> = {
  hot: "מוכן לרכישה",
  warm: "בתהליך חיפוש",
  cold: "ליד ראשוני",
};

function hasBudget(b: BuyerRow): boolean {
  return b.budget_min != null || b.budget_max != null;
}

/**
 * Deterministic financing-risk read. Intelligence board (when present) wins;
 * otherwise we infer from pre-approval + budget signals on the buyer row.
 */
function financingRisk(b: BuyerRow, intel?: IntelSets): FinancingRisk {
  if (intel?.financingRisks?.has(b.id)) return "high";
  if (b.has_preapproval) return "low";
  // No pre-approval but a real budget defined → worth checking financing.
  if (hasBudget(b)) return "medium";
  return "unknown";
}

/** The single most important thing to do next for this buyer. */
function pickNextAction(args: {
  needsFollowUp: boolean;
  isInactive: boolean;
  missingPreferences: boolean;
  isCloseToBuy: boolean;
  isNew: boolean;
  hasPhone: boolean;
}): NextAction {
  const { needsFollowUp, isInactive, missingPreferences, isCloseToBuy, isNew, hasPhone } = args;
  if (isCloseToBuy) return { kind: "send_properties", label: "שלח נכסים מתאימים" };
  if (needsFollowUp || isInactive) {
    return hasPhone
      ? { kind: "call", label: "התקשר עכשיו" }
      : { kind: "whatsapp", label: "שלח הודעת מעקב" };
  }
  if (missingPreferences) return { kind: "update_budget", label: "עדכן תקציב והעדפות" };
  if (isNew) return { kind: "schedule_meeting", label: "קבע פגישת היכרות" };
  return { kind: "send_properties", label: "שלח נכסים מתאימים" };
}

/** Compute the full insight bundle for one buyer. */
export function buyerInsight(
  buyer: BuyerRow,
  opts: { matchCount?: number | null; intel?: IntelSets } = {},
): BuyerInsight {
  const { matchCount = null, intel } = opts;
  const createdDays = daysSince(buyer.created_at) ?? 999;
  const daysSinceContact = daysSince(buyer.last_contacted_at);
  const updatedDays = daysSince(buyer.updated_at) ?? 999;

  const isHotWarm = buyer.temperature === "hot" || buyer.temperature === "warm";
  const missingPreferences = buyerMissingPreferences(buyer);

  const isNew = createdDays <= 7;
  const needsFollowUp =
    intel?.needingAttention?.has(buyer.id) ||
    (isHotWarm && (daysSinceContact == null || daysSinceContact >= 7));
  const isInactive =
    intel?.noActivity?.has(buyer.id) ||
    ((daysSinceContact == null || daysSinceContact >= 30) && updatedDays >= 30);
  const isCloseToBuy =
    intel?.closeToPurchase?.has(buyer.id) ||
    (buyer.temperature === "hot" && hasBudget(buyer) && buyer.preferred_areas.length > 0);
  const risk = financingRisk(buyer, intel);
  const isFinancingRisk = risk === "high";

  // ── Urgency composite (0–100) ──────────────────────────────────────────────
  let urgency = 0;
  if (needsFollowUp) urgency += 35;
  if (isInactive) urgency += 22;
  if (buyer.temperature === "hot") urgency += 20;
  else if (buyer.temperature === "warm") urgency += 10;
  if (isFinancingRisk) urgency += 18;
  else if (risk === "medium") urgency += 7;
  if (isCloseToBuy) urgency += 12;
  if (isNew && daysSinceContact == null) urgency += 15;
  if (missingPreferences) urgency += 8;
  urgency = Math.min(100, urgency);

  // ── Dominant reason (single, human) ──────────────────────────────────────
  let urgencyReason: string;
  if (isCloseToBuy) urgencyReason = "קרוב לסגירה — כדאי לדחוף נכסים מתאימים";
  else if (needsFollowUp && (daysSinceContact == null))
    urgencyReason = "קונה חם שטרם נוצר איתו קשר";
  else if (needsFollowUp)
    urgencyReason = `קונה ${buyer.temperature ? TEMPERATURE_LABELS[buyer.temperature] : ""} ללא מעקב ${daysSinceContact} ימים`;
  else if (isInactive) urgencyReason = "ללא פעילות תקופה ארוכה — סיכון לנטישה";
  else if (isFinancingRisk) urgencyReason = "סיכון מימון — מומלץ לבדוק יכולת מימון";
  else if (missingPreferences) urgencyReason = "חסרים פרטי תקציב והעדפות";
  else if (isNew) urgencyReason = "קונה חדש — כדאי ליצור קשר ראשוני";
  else urgencyReason = "המשך טיפול שוטף";

  const urgencyTone: BadgeTone =
    urgency >= 70 ? "danger" : urgency >= 40 ? "warning" : "brand";

  const nextAction = pickNextAction({
    needsFollowUp: Boolean(needsFollowUp),
    isInactive: Boolean(isInactive),
    missingPreferences,
    isCloseToBuy: Boolean(isCloseToBuy),
    isNew,
    hasPhone: Boolean(buyer.phone),
  });

  const stageLabel = isCloseToBuy
    ? "קרוב לרכישה"
    : buyer.temperature
      ? STAGE_BY_TEMPERATURE[buyer.temperature]
      : "ליד חדש";

  return {
    buyer,
    urgency,
    urgencyTone,
    urgencyReason,
    nextAction,
    financingRisk: risk,
    stageLabel,
    lastActivityLabel: relativeLabel(buyer.last_contacted_at ?? buyer.updated_at),
    daysSinceContact,
    matchCount,
    isNew,
    needsFollowUp: Boolean(needsFollowUp),
    isInactive: Boolean(isInactive),
    isCloseToBuy: Boolean(isCloseToBuy),
    isFinancingRisk,
    hasMatches: (matchCount ?? 0) > 0,
    missingPreferences,
  };
}

export interface BuyerKpis {
  total: number;
  newThisMonth: number;
  followUp: number;
  closeToBuy: number;
  financingRisk: number;
  inactive: number;
  withMatches: number;
}

/** Aggregate KPIs from a list of insights. */
export function computeKpis(insights: BuyerInsight[]): BuyerKpis {
  const monthAgo = Date.now() - 30 * DAY;
  let newThisMonth = 0;
  let followUp = 0;
  let closeToBuy = 0;
  let financingRisk = 0;
  let inactive = 0;
  let withMatches = 0;
  for (const i of insights) {
    if (new Date(i.buyer.created_at).getTime() >= monthAgo) newThisMonth++;
    if (i.needsFollowUp) followUp++;
    if (i.isCloseToBuy) closeToBuy++;
    if (i.isFinancingRisk) financingRisk++;
    if (i.isInactive) inactive++;
    if (i.hasMatches) withMatches++;
  }
  return {
    total: insights.length,
    newThisMonth,
    followUp,
    closeToBuy,
    financingRisk,
    inactive,
    withMatches,
  };
}

/** Short interest summary: areas · rooms · types. RTL-safe. */
export function buyerInterestLine(b: BuyerRow): string {
  const parts: string[] = [];
  if (b.preferred_areas.length) parts.push(b.preferred_areas.slice(0, 2).join(", "));
  if (b.rooms_min != null || b.rooms_max != null) {
    if (b.rooms_min != null && b.rooms_max != null) parts.push(`${b.rooms_min}–${b.rooms_max} חד׳`);
    else if (b.rooms_max != null) parts.push(`עד ${b.rooms_max} חד׳`);
    else parts.push(`${b.rooms_min}+ חד׳`);
  }
  return parts.length ? parts.join(" · ") : "ללא העדפות מוגדרות";
}

export { buyerBudgetLine };
