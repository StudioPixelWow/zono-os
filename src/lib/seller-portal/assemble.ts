// ============================================================================
// 🏷️ Seller Portal — view-model assembler (pure). 32.4.
// Turns the normalized SellerPortalInput (built by the server from REUSED engines)
// into seller-facing view models. Seller/public-safe, evidence-only. Nothing
// auto-executes: every actionable item is approval-gated. Buyers stay anonymized.
// ============================================================================
import { aiSummary, whyDemand, shouldPriceChange, marketExplanation, competitionExplanation, nextStep, sellingTips } from "./content";
import type { SellerPortalInput, SellerDashboard, BuyerInterest, PortalAction, PortalNotification, PortalInsight, ActivityEvent } from "./types";

const HEALTH_LABEL = (n: number | null) => (n == null ? "טרם נמדד" : n >= 75 ? "מצוין" : n >= 50 ? "יציב" : n >= 25 ? "דורש תשומת לב" : "בסיכון");

export function buildDashboard(input: SellerPortalInput): SellerDashboard {
  const p = input.property;
  const returning = input.hasActivity;
  const firstName = input.profile.firstName || "ברוכים הבאים";

  const recommendedActions: PortalAction[] = input.strategyPlaybook.slice(0, 5).map((a) => ({ order: a.order, title: a.action, why: a.why, requiresApproval: true }));
  const openItems: PortalAction[] = input.opportunities.slice(0, 4).map((o, i) => ({ order: i + 1, title: o.title, why: o.evidence[0] ?? "", requiresApproval: true }));

  const ns = nextStep(input);
  const insights: PortalInsight[] = [whyDemand(input), shouldPriceChange(input), marketExplanation(input), competitionExplanation(input), ...sellingTips(input)].slice(0, 6);

  const today = todayEvents(input.activity);

  return {
    welcome: { greeting: returning ? `שוב שלום, ${firstName}` : `ברוכים הבאים, ${firstName}`, returning, resume: returning ? resumeLine(input) : null },
    aiSummary: aiSummary(input),
    todayActivity: today,
    propertyHealth: { score: input.healthScore, label: HEALTH_LABEL(input.healthScore) },
    marketPerformance: { marketScore: p.marketScore, competitionPressure: p.competitionPressure, daysOnMarket: p.daysOnMarket, demandScore: p.buyerDemandScore },
    buyerDemand: groupBuyers(input.buyerInterest),
    valuation: { asking: p.askingPrice, estimated: p.estimatedValue, gapPct: p.priceGapPct, position: p.valuationPosition },
    recommendation: ns.title ? { title: ns.title, why: ns.why, requiresApproval: true } : null,
    recommendedActions,
    upcomingAppointments: input.appointments.filter((a) => new Date(a.startAt).getTime() >= Date.now() - 3600_000).slice(0, 5),
    recentConversations: input.conversations.slice(0, 5),
    openItems,
    notifications: buildNotifications(input),
    insights,
  };
}

function resumeLine(input: SellerPortalInput): string {
  const buyers = input.buyerInterest.filter((b) => b.tier === "perfect").length;
  if (buyers > 0) return `${buyers} קונים מובילים תואמים לנכס שלכם`;
  const nextAppt = input.appointments.find((a) => new Date(a.startAt).getTime() >= Date.now());
  if (nextAppt) return `הפגישה הבאה: ${nextAppt.title}`;
  if (input.strategyPlaybook[0]) return `הצעד הבא: ${input.strategyPlaybook[0].action}`;
  return "המשיכו מהמקום שבו עצרתם";
}

export function groupBuyers(interest: BuyerInterest[]): SellerDashboard["buyerDemand"] {
  const perfect = interest.filter((b) => b.tier === "perfect").sort((a, b) => b.score - a.score);
  const emerging = interest.filter((b) => b.tier === "emerging").sort((a, b) => b.score - a.score);
  const waiting = interest.filter((b) => b.tier === "waiting").sort((a, b) => b.score - a.score);
  return { perfect, emerging, waiting, total: interest.length };
}

function todayEvents(activity: ActivityEvent[]): ActivityEvent[] {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return activity.filter((e) => new Date(e.at).getTime() >= start.getTime()).slice(0, 8);
}

export function buildNotifications(input: SellerPortalInput): PortalNotification[] {
  const out: PortalNotification[] = [];
  const perfect = input.buyerInterest.filter((b) => b.tier === "perfect").length;
  if (perfect > 0) out.push({ id: "n-buyer", type: "new_buyer", title: "קונה חדש מתאים", detail: `${perfect} קונים מובילים תואמים לנכס`, at: input.lastActivityAt, requiresApproval: false });
  const nextAppt = input.appointments.find((a) => { const t = new Date(a.startAt).getTime(); return t >= Date.now() && t <= Date.now() + 3 * 86400_000; });
  if (nextAppt) out.push({ id: `n-appt-${nextAppt.id}`, type: "viewing", title: "צפייה מתוכננת", detail: `${nextAppt.title} · ${new Date(nextAppt.startAt).toLocaleString("he-IL")}`, at: nextAppt.startAt, requiresApproval: false });
  if (input.property.valuationPosition === "above" && (input.property.buyerDemandScore ?? 0) < 50)
    out.push({ id: "n-price", type: "price_reco", title: "המלצת מחיר", detail: "מחיר הפרסום מעל השוק — שקלו יישור מחיר (באישורכם).", at: null, requiresApproval: true });
  if (input.hasValuation) out.push({ id: "n-val", type: "valuation", title: "הערכת שווי זמינה", detail: "הערכת השווי העדכנית של הנכס מוצגת בפורטל.", at: null, requiresApproval: false });
  const brokerMsg = input.conversations.find((c) => c.fromBroker);
  if (brokerMsg) out.push({ id: "n-msg", type: "message", title: "הודעה מהברוקר", detail: brokerMsg.summary, at: brokerMsg.at, requiresApproval: false });
  return out.slice(0, 8);
}

export function buildActivityTimeline(input: SellerPortalInput): ActivityEvent[] {
  return [...input.activity].sort((a, b) => +new Date(b.at) - +new Date(a.at));
}
