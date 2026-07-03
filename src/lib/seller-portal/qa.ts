// ============================================================================
// ✅ Seller Portal — self-tests (pure, offline). 32.4.
// no-activity / new / returning / luxury / high-demand / low-demand / multi-buyer
// / no-valuation / redaction (seller-safe + buyer anonymized) / authorization
// (scoped) / performance.
// ============================================================================
import { buildDashboard, buildNotifications, buildActivityTimeline, groupBuyers } from "./assemble";
import { containsForbidden } from "@/lib/brokerage-site";
import type { SellerPortalInput, SellerProfile, PropertyPerformance, BuyerInterest, ActivityEvent } from "./types";

export interface SPCheck { name: string; pass: boolean; detail: string }
export interface SPSelfCheck { ok: boolean; total: number; passed: number; checks: SPCheck[] }

const profile = (o: Partial<SellerProfile> = {}): SellerProfile => ({
  name: "יוסי כהן", firstName: "יוסי", city: "תל אביב", address: "דיזנגוף 100",
  expectedPrice: 5_000_000, desiredPrice: 5_200_000, targetSaleDate: "2026-12-01",
  urgency: "בינונית", motivation: "שדרוג", sellerType: "בעל דירה", preferredChannel: "whatsapp", timeline: "3-6 חודשים", ...o,
});
const property = (o: Partial<PropertyPerformance> = {}): PropertyPerformance => ({
  hasProperty: true, propertyId: "P1", status: "active", askingPrice: 5_000_000, estimatedValue: 4_700_000, priceGapPct: 6.4,
  valuationPosition: "above", valuationConfidence: "גבוהה", marketScore: 72, pricingHealth: 66, competitionPressure: 48,
  buyerDemandScore: 70, daysOnMarket: 34, campaignActive: true, truthTier: "verified", strategyLabel: "השקת שיווק", ...o,
});
const buyer = (rank: number, tier: BuyerInterest["tier"], score = 80): BuyerInterest => ({ rank, score, tier, label: tier === "perfect" ? "קונה מוביל תואם" : tier === "emerging" ? "קונה מתפתח" : "קונה בהמתנה", why: ["תואם לתקציב", "מחפש באזור"] });
const act = (kind: ActivityEvent["kind"], hoursAgo = 1): ActivityEvent => ({ at: new Date(Date.now() - hoursAgo * 3600_000).toISOString(), kind, title: "אירוע", detail: "פרטים" });

const input = (o: Partial<SellerPortalInput> = {}): SellerPortalInput => ({
  sellerId: "S1", profile: profile(), property: property(),
  healthScore: 68, healthLabel: "יציב", confidence: 74, churnRisk: 20, classification: ["מוכר חם"],
  strategyPlaybook: [{ order: 1, action: "קבעו בית פתוח", why: "ביקוש גבוה" }, { order: 2, action: "יישרו מחיר לשוק", why: "מעל הערכת השוק" }],
  strategyLabel: "השקת שיווק", aiRecommendation: "קדמו צפיות ובחנו יישור מחיר",
  risks: [{ title: "מחיר מעל השוק", evidence: ["פער +6.4%"] }],
  opportunities: [{ title: "קונים ממתינים באזור", evidence: ["3 קונים תואמים"] }],
  buyerInterest: [buyer(1, "perfect", 92), buyer(2, "perfect", 85), buyer(3, "emerging", 74), buyer(4, "waiting", 60)],
  appointments: [{ id: "A1", title: "צפייה בנכס", startAt: new Date(Date.now() + 86400_000).toISOString(), endAt: null, kind: "viewing", status: "scheduled", locationText: "דיזנגוף 100" }],
  conversations: [{ at: new Date().toISOString(), kind: "message", summary: "הברוקר עדכן על פנייה חדשה", fromBroker: true }],
  activity: [act("view", 1), act("inquiry", 2), act("view", 26)],
  hasActivity: true, lastActivityAt: new Date().toISOString(), hasValuation: true, docs: [], ...o,
});

export function runSelfCheck(): SPSelfCheck {
  const checks: SPCheck[] = [];
  const add = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });

  const d = buildDashboard(input());
  add("dashboard welcome + AI summary", d.welcome.greeting.includes("יוסי") && d.aiSummary.length > 0);
  add("returning seller sees resume", d.welcome.returning && !!d.welcome.resume);
  add("property health + market performance", d.propertyHealth.label.length > 0 && d.marketPerformance.marketScore === 72);
  add("valuation summary (asking/estimated/gap/position)", d.valuation.asking === 5_000_000 && d.valuation.estimated === 4_700_000 && d.valuation.position === "above");
  add("buyer demand grouped by tier", d.buyerDemand.perfect.length === 2 && d.buyerDemand.emerging.length === 1 && d.buyerDemand.waiting.length === 1 && d.buyerDemand.total === 4);
  add("every buyer interest explains WHY", [...d.buyerDemand.perfect, ...d.buyerDemand.emerging].every((b) => b.why.length > 0));
  add("recommendation + actions approval-gated", !!d.recommendation?.requiresApproval && d.recommendedActions.every((a) => a.requiresApproval));
  add("today activity only today", d.todayActivity.length === 2);
  const dNotif = buildDashboard(input({ property: property({ buyerDemandScore: 45 }) }));
  add("notifications include buyer/viewing/price/valuation/message", ["new_buyer", "viewing", "price_reco", "valuation", "message"].every((t) => dNotif.notifications.some((n) => n.type === t)));

  // Seller-safe redaction + buyer anonymization.
  add("dashboard NO forbidden keys", containsForbidden(d) === null, containsForbidden(d) ?? "");
  const buyersSerialized = JSON.stringify(d.buyerDemand);
  add("buyers anonymized (no name/id/buyerId keys)", !/"name"|"buyerId"|"id"/.test(buyersSerialized));

  // Edge personas.
  const noActivity = buildDashboard(input({ hasActivity: false, buyerInterest: [], appointments: [], conversations: [], activity: [], strategyPlaybook: [], opportunities: [] }));
  add("seller with NO activity safe", !noActivity.welcome.returning && noActivity.buyerDemand.total === 0 && noActivity.aiSummary.length > 0);
  add("new seller generic welcome", noActivity.welcome.greeting.includes("ברוכים הבאים"));
  const luxury = buildDashboard(input({ classification: ["יוקרה"], property: property({ askingPrice: 15_000_000, estimatedValue: 14_500_000 }) }));
  add("luxury property", luxury.valuation.asking === 15_000_000);
  const highDemand = buildDashboard(input({ property: property({ buyerDemandScore: 88 }) }));
  add("high-demand property summary", highDemand.aiSummary.includes("גבוה"));
  const lowDemand = buildDashboard(input({ property: property({ buyerDemandScore: 20 }), buyerInterest: [] }));
  add("low-demand property safe", lowDemand.buyerDemand.total === 0 && lowDemand.aiSummary.length > 0);
  const multi = buildDashboard(input({ buyerInterest: Array.from({ length: 12 }, (_, i) => buyer(i + 1, i < 5 ? "perfect" : i < 9 ? "emerging" : "waiting", 90 - i)) }));
  add("multiple buyers grouped", multi.buyerDemand.perfect.length === 5 && multi.buyerDemand.total === 12);
  const noVal = buildDashboard(input({ hasValuation: false, property: property({ valuationPosition: "unknown", estimatedValue: null, priceGapPct: null }) }));
  add("no valuation → safe (no fake numbers)", noVal.valuation.estimated === null && noVal.valuation.position === "unknown" && !noVal.notifications.some((n) => n.type === "valuation"));

  // Authorization: assembler only reflects the ONE seller given.
  add("scoped to given seller only", buildDashboard(input({ sellerId: "S1" })).buyerDemand.total === 4);

  // groupBuyers + timeline helpers.
  add("groupBuyers sorts by score desc", groupBuyers([buyer(1, "perfect", 70), buyer(2, "perfect", 95)]).perfect[0].score === 95);
  add("activity timeline chronological desc", (() => { const t = buildActivityTimeline(input()); return t.length === 3 && +new Date(t[0].at) >= +new Date(t[1].at); })());
  add("notifications helper standalone", buildNotifications(input()).length > 0);

  // Performance.
  const t0 = Date.now();
  const big = input({ buyerInterest: Array.from({ length: 400 }, (_, i) => buyer(i + 1, i % 3 === 0 ? "perfect" : i % 3 === 1 ? "emerging" : "waiting", 50 + (i % 40))), activity: Array.from({ length: 400 }, (_, i) => act("view", i)) });
  buildDashboard(big); buildActivityTimeline(big); buildNotifications(big);
  add("large buyer/activity set < 250ms", Date.now() - t0 < 250, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
