// ============================================================================
// ✅ ZONO Daily AI Operating System™ — pure self-tests (offline). 40.0.
// Validates the daily re-composition (briefing, timeline merge, ranked action
// feed, conversation, marketing, deals, approvals) + executive mode. No I/O.
// ============================================================================
import { assembleDailyOS, buildExecutiveDaily } from "./assemble";
import type { ExecInput } from "./types";
import type { BrokerWorkspace, ScoredEntity, WsMission } from "@/lib/broker-workspace/types";

const NOW = Date.parse("2026-07-06T08:00:00.000Z");
const at = (h: number) => new Date(NOW + h * 3600_000).toISOString();

const buyer = (id: string, o: Partial<ScoredEntity> = {}): ScoredEntity => ({ kind: "buyer", id, name: `קונה ${id}`, healthScore: 80, healthLabel: "בריא", score: 85, stage: null, reason: "התאמות פעילות", lastActivityAt: at(-24), riskLabel: null, href: `/buyers/${id}`, ...o });
const seller = (id: string, o: Partial<ScoredEntity> = {}): ScoredEntity => ({ kind: "seller", id, name: `מוכר ${id}`, healthScore: 40, healthLabel: "בסיכון", score: 60, stage: null, reason: null, lastActivityAt: at(-240), riskLabel: "סיכון נטישה", href: `/sellers/${id}`, ...o });
const mission = (id: string, o: Partial<WsMission> = {}): WsMission => ({ id, title: `משימה ${id}`, entityType: "buyer", entityId: "b1", entityName: "קונה b1", owner: "broker-1", priority: "high", status: "open", reason: "דחוף", dueAt: at(3), ...o });

function ws(): BrokerWorkspace {
  return {
    version: "35.0", brokerId: "broker-1", brokerName: "דני", generatedAt: new Date(NOW).toISOString(),
    dashboard: {
      todaysPriorities: [mission("m1", { dueAt: at(3), priority: "high" }), mission("m2", { dueAt: at(1), priority: "low", title: "משימה m2" })],
      hotBuyers: [buyer("b1", { score: 90 }), buyer("b2", { score: 50 })],
      sellersAtRisk: [seller("s1")],
      criticalListings: [], leadFollowUps: [buyer("l1", { kind: "lead" })],
      pendingApprovals: [{ id: "i1", agentName: "Buyer", entityType: "buyer", entityId: "b1", entityName: "קונה b1", recommendation: "צור קשר עם b1", reason: "חם", impact: "high", confidence: 0.8, status: "pending", requiresApproval: true }],
      activeWorkflows: [], upcomingMeetings: [{ id: "mt1", title: "פגישת קונה", type: "buyer_meeting", status: "scheduled", startAt: at(2), endAt: at(3), entityLabel: "קונה b1" }],
    },
    briefing: { generatedAt: new Date(NOW).toISOString(), items: [{ question: "מה היום?", answer: "יום עמוס עם 3 פעולות דחופות.", evidence: [], targets: [] }] },
    calendar: { upcoming: [], suggested: [{ id: "se1", propertyId: "p1", title: "בית פתוח", planType: "open_house", suggestedDate: at(5), status: "pending" }], note: "" },
    comms: { items: [{ kind: "lead", entityId: "l1", entityName: "ליד l1", intent: "first_response", why: "ליד חדש", channelHint: "whatsapp", href: "/communication?entityKind=lead&entityId=l1" }], note: "" },
    inbox: [{ id: "i1", agentName: "Buyer", entityType: "buyer", entityId: "b1", entityName: "קונה b1", recommendation: "צור קשר עם b1", reason: "חם", impact: "high", confidence: 0.8, status: "pending", requiresApproval: true }],
    performance: { activeListings: 5, activeBuyers: 8, activeSellers: 3, leadsHandled: 4, followUpRatePct: 80, conversionOpportunities: 2, weakSpots: [{ title: "לידים ללא מענה", detail: "3 לידים", impact: "high" }] },
    whatsapp: { unread: 4, waiting: 2, urgent: 1, today: 3, waitingConversations: [{ id: "c1", contactName: "יוסי", reason: "שאל על מחיר", href: "/whatsapp/inbox?c=c1", urgency: 85 }] },
    facebook: { scheduledToday: 2, commentsWaiting: 5, leadApprovals: 1, groupsToPublish: 3, tasks: [{ title: "תגובות ממתינות", detail: "5 תגובות", href: "/facebook" }] },
    website: { hasSite: true, published: false, healthScore: 60, seoAlerts: 1, landingDrafts: 1, approvalsPending: 1, alerts: [] },
    territory: { acquisitionStreets: [{ street: "הרצל", city: "חיפה", score: 88, href: "/territory" }], buildings: [], opportunities: [{ title: "הזדמנות בכרמל", why: "ביקוש", href: "/territory" }], marketChanges: [] },
    notes: [],
  };
}

export interface DCheck { name: string; pass: boolean; detail: string }
export interface DSelfCheck { ok: boolean; total: number; passed: number; checks: DCheck[] }

export function runSelfCheck(): DSelfCheck {
  const checks: DCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });
  const os = assembleDailyOS(ws(), NOW);

  add("greeting with name", os.briefing.greeting.includes("דני"));
  add("daily score computed", os.briefing.dailyScore === Math.round(55 + 80 * 0.25 - 1 * 6 + Math.min(20, 2 * 4)));
  add("focus = top action", os.briefing.focus.length > 0);
  add("biggest opportunity = hot buyer", os.briefing.biggestOpportunity?.label === "קונה b1");
  add("biggest risk = seller at risk", os.briefing.biggestRisk?.label === "מוכר s1");
  add("ai summary from briefing item", os.briefing.aiSummary.includes("יום עמוס"));

  add("timeline merged + sorted", os.timeline.length === 4 && Date.parse(os.timeline[0].at) <= Date.parse(os.timeline[1].at));
  add("timeline has meeting + mission + suggested", os.timeline.some((t) => t.source === "meeting") && os.timeline.some((t) => t.source === "mission") && os.timeline.some((t) => t.source === "suggested"));

  add("action feed high priority first", os.actionFeed[0].priority === "high");
  add("action feed includes approve + whatsapp + acquisition", os.actionFeed.some((a) => a.kind === "approve") && os.actionFeed.some((a) => a.kind === "reply_whatsapp") && os.actionFeed.some((a) => a.kind === "acquisition"));
  add("action feed deduped", new Set(os.actionFeed.map((a) => a.title)).size === os.actionFeed.length);

  add("conversation counts", os.conversation.whatsappUnread === 4 && os.conversation.facebookComments === 5 && os.conversation.drafts.length === 1);
  add("marketing from facebook", os.marketing.scheduledToday === 2 && os.marketing.groupsToPublish === 3);
  add("deals passthrough", os.deals.hotBuyers.length === 2 && os.deals.sellersAtRisk.length === 1);
  add("performance daily+weekly", os.performance.daily === os.performance.weekly && os.performance.followUpRatePct === 80);
  add("approvals merged + deduped", os.approvals.length === 1 && os.approvals[0].id === "i1");
  add("ask questions present", os.ask.length >= 4);

  // Executive mode.
  const exec: ExecInput = { orgScore: { overall: 72, growth: 60, execution: 70, coverage: 65, competitivePosition: 55, confidence: 80 }, priorities: [{ title: "גייס מוכרים", why: "מלאי נמוך", evidence: ["-10%"], impact: "high", urgency: 80 }], risks: [], opportunities: [], insights: [{ title: "תובנה", recommendation: "פעל", modules: ["market"], impact: "medium" }], notes: [] };
  const ed = buildExecutiveDaily(exec);
  add("executive health band strong", ed.officeHealth === "strong" && ed.orgScore.overall === 72 && ed.priorities.length === 1);

  // Empty-safe.
  const empty = ws();
  empty.dashboard = { todaysPriorities: [], hotBuyers: [], sellersAtRisk: [], criticalListings: [], leadFollowUps: [], pendingApprovals: [], activeWorkflows: [], upcomingMeetings: [] };
  empty.comms = { items: [], note: "" }; empty.whatsapp = { unread: 0, waiting: 0, urgent: 0, today: 0, waitingConversations: [] };
  empty.facebook = { scheduledToday: 0, commentsWaiting: 0, leadApprovals: 0, groupsToPublish: 0, tasks: [] };
  empty.territory = { acquisitionStreets: [], buildings: [], opportunities: [], marketChanges: [] };
  empty.calendar = { upcoming: [], suggested: [], note: "" };
  empty.briefing = { generatedAt: "", items: [] };
  const eos = assembleDailyOS(empty, NOW);
  add("empty-safe", eos.actionFeed.length === 0 && eos.timeline.length === 0 && eos.briefing.biggestOpportunity === null);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
