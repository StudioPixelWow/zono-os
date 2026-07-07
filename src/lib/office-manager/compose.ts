// ============================================================================
// 🏢 ZONO — Office AI Manager — composer (pure & deterministic). PHASE 55.0.
// Turns normalized team inputs into the manager command center: workload/capacity
// per broker, morning briefing, follow-up compliance, risk-by-broker, delegation
// SUGGESTIONS (approval-gated, never auto-assigned) and the approval center.
// It composes existing engine outputs — no score is recomputed here.
// ============================================================================
import {
  OFFICE_MANAGER_VERSION, AVAIL_HE, WORKLOAD_HE, NO_AUTO_ASSIGN_NOTE,
  type BrokerInput, type OfficeInput, type BrokerCard, type WorkloadLevel,
  type DelegationSuggestion, type OfficeBriefing, type FollowUpCompliance, type RiskByBroker,
  type VacationView, type OfficeManagerReport,
} from "./types";

const DAY = 86_400_000;
const OPEN_LEAD_CONCERN = 8;      // open leads above this → follow-up concern
const OVERLOAD = 25, HIGH = 15, BALANCED = 6;

function workloadScore(b: BrokerInput): number {
  return Math.round(b.todayEvents * 3 + b.activeBuyers + b.activeSellers + b.openLeads * 1.5 + b.sellersAtRisk * 2 + b.hotBuyers * 2);
}
function workloadLevel(score: number): WorkloadLevel {
  return score >= OVERLOAD ? "overloaded" : score >= HIGH ? "high" : score >= BALANCED ? "balanced" : "low";
}
function isInactive(b: BrokerInput, now: number): boolean {
  if (b.state === "offline") return true;
  if (b.lastActiveAt) return now - new Date(b.lastActiveAt).getTime() > 14 * DAY;
  return false;
}

function toCard(b: BrokerInput, now: number): BrokerCard {
  const ws = workloadScore(b);
  const level = workloadLevel(ws);
  const onVacation = b.state === "vacation";
  const inactive = isInactive(b, now);
  const overloaded = level === "overloaded";
  const followUpConcern = b.openLeads >= OPEN_LEAD_CONCERN;
  // Capacity: available to take work — free, not overloaded, not out.
  const hasCapacity = !onVacation && !inactive && (b.state === "free") && level !== "overloaded" && level !== "high";

  const flags: string[] = [];
  if (overloaded) flags.push("עומס יתר");
  if (onVacation) flags.push("בחופשה");
  if (inactive && !onVacation) flags.push("לא פעיל");
  if (followUpConcern) flags.push("סיכון מעקב");
  if (b.sellersAtRisk > 0) flags.push(`${b.sellersAtRisk} מוכרים בסיכון`);
  if (b.hotBuyers > 0) flags.push(`${b.hotBuyers} קונים חמים`);

  return {
    id: b.id, name: b.name, score: b.score, scoreLabel: b.scoreLabel, note: b.note,
    state: b.state, stateHe: AVAIL_HE[b.state], workloadLevel: level, workloadHe: WORKLOAD_HE[level], workloadScore: ws,
    todayEvents: b.todayEvents, activeBuyers: b.activeBuyers, activeSellers: b.activeSellers, openLeads: b.openLeads,
    sellersAtRisk: b.sellersAtRisk, hotBuyers: b.hotBuyers,
    isOverloaded: overloaded, isInactive: inactive, isOnVacation: onVacation, hasCapacity, followUpConcern, flags,
  };
}

/** Suggest re-balancing work from overloaded/out brokers to those with capacity. */
function buildDelegations(cards: BrokerCard[]): DelegationSuggestion[] {
  const out: DelegationSuggestion[] = [];
  const capacity = cards.filter((c) => c.hasCapacity).sort((a, b) => a.workloadScore - b.workloadScore);
  const sources = cards.filter((c) => c.isOverloaded || c.isOnVacation || (c.isInactive && (c.openLeads + c.sellersAtRisk + c.hotBuyers) > 0));

  for (const src of sources) {
    const target = capacity.find((c) => c.id !== src.id) ?? null;
    const item = src.sellersAtRisk > 0 ? `מוכר בסיכון (${src.sellersAtRisk})` : src.hotBuyers > 0 ? `קונה חם (${src.hotBuyers})` : src.openLeads > 0 ? `לידים פתוחים (${src.openLeads})` : "עומס משימות";
    const reason = src.isOnVacation ? `${src.name} בחופשה — יש לוודא כיסוי.` : src.isOverloaded ? `${src.name} בעומס יתר (${src.workloadScore}).` : `${src.name} לא פעיל אך יש פריטים פתוחים.`;
    out.push({
      fromBrokerId: src.id, fromName: src.name,
      toBrokerId: target?.id ?? null, toName: target?.name ?? null,
      item, reason: target ? `${reason} מומלץ להאציל ל${target.name} (${target.workloadHe}).` : `${reason} אין כרגע סוכן פנוי — שקול חלוקה ידנית או גיוס.`,
      requiresApproval: true, autoAssign: false,
    });
  }
  return out;
}

function buildBriefing(cards: BrokerCard[], input: OfficeInput): OfficeBriefing {
  const needsHelp = cards.filter((c) => c.isOverloaded || c.followUpConcern).map((c) => ({ name: c.name, reason: c.isOverloaded ? "עומס יתר" : "סיכון מעקב" }));
  const overloaded = cards.filter((c) => c.isOverloaded).map((c) => ({ name: c.name, workloadHe: c.workloadHe }));
  const hotTotal = cards.reduce((s, c) => s + c.hotBuyers, 0);
  const riskTotal = cards.reduce((s, c) => s + c.sellersAtRisk, 0);
  const todayFocus = `${cards.reduce((s, c) => s + c.todayEvents, 0)} אירועים היום · ${hotTotal} קונים חמים · ${riskTotal} מוכרים בסיכון · ${input.approvals.count} ממתינים לאישור.`;
  return {
    headline: overloaded.length ? `${overloaded.length} סוכנים בעומס יתר — נדרשת האצלה` : needsHelp.length ? `${needsHelp.length} סוכנים זקוקים לתשומת לב` : "הצוות מאוזן",
    needsHelp, overloaded, todayFocus, losingMoney: input.losingMoney.slice(0, 5),
  };
}

/** Compose the full Office AI Manager report. */
export function composeOfficeManager(input: OfficeInput, now: number = Date.now()): OfficeManagerReport {
  const cards = input.brokers.map((b) => toCard(b, now)).sort((a, b) => b.workloadScore - a.workloadScore);

  const delegations = buildDelegations(cards);

  const brokersAtRisk = cards.filter((c) => c.followUpConcern).map((c) => ({ name: c.name, openLeads: c.openLeads })).sort((a, b) => b.openLeads - a.openLeads);
  const followUp: FollowUpCompliance = {
    teamRatePct: input.teamFollowUpRatePct,
    brokersAtRisk,
    note: brokersAtRisk.length ? "סוכנים עם ריכוז גבוה של לידים פתוחים — סיכון לפספוס מעקב." : "אין ריכוזי לידים חריגים.",
  };

  const riskByBroker: RiskByBroker[] = cards
    .filter((c) => c.sellersAtRisk > 0 || c.hotBuyers > 0 || c.openLeads > 0)
    .map((c) => ({ name: c.name, sellersAtRisk: c.sellersAtRisk, hotBuyers: c.hotBuyers, openLeads: c.openLeads }));

  const onVac = cards.filter((c) => c.isOnVacation);
  const vacation: VacationView = {
    onVacation: onVac.map((c) => ({ name: c.name, state: c.stateHe })),
    note: onVac.length ? "ודא כיסוי ללקוחות ולמעקבים של הסוכנים בחופשה." : "אין סוכנים בחופשה כרגע.",
  };

  const notes = [NO_AUTO_ASSIGN_NOTE];
  if (!cards.length) notes.unshift("אין עדיין נתוני צוות. הוסף סוכנים וזמינות כדי לקבל תמונת ניהול מלאה.");

  return {
    version: OFFICE_MANAGER_VERSION, generatedAt: input.generatedAt ?? null,
    orgScore: input.orgScore,
    briefing: buildBriefing(cards, input),
    brokers: cards,
    delegations,
    followUp,
    riskByBroker,
    vacation,
    approvals: input.approvals,
    totals: {
      brokers: cards.length,
      overloaded: cards.filter((c) => c.isOverloaded).length,
      inactive: cards.filter((c) => c.isInactive && !c.isOnVacation).length,
      onVacation: onVac.length,
    },
    hasData: cards.length > 0,
    notes,
  };
}
