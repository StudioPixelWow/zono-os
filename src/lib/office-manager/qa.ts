// ============================================================================
// 🏢 ZONO — Office AI Manager — offline self-check (pure). PHASE 55.0.
// Spec QA: overloaded broker, inactive broker, missing follow-up, risk seller,
// hot buyer, delegation suggestion, vacation mode, no auto-assignment.
// ============================================================================
import { composeOfficeManager } from "./compose";
import type { BrokerInput, OfficeInput, AvailabilityState } from "./types";

const NOW = Date.parse("2026-07-06T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();

function broker(over: Partial<BrokerInput> = {}): BrokerInput {
  return {
    id: over.id ?? "b1", name: over.name ?? "סוכן", score: 70, scoreLabel: "טוב", note: null,
    state: (over.state ?? "free") as AvailabilityState, todayEvents: over.todayEvents ?? 1, nextFreeAt: null,
    activeBuyers: over.activeBuyers ?? 1, activeSellers: over.activeSellers ?? 1, openLeads: over.openLeads ?? 1,
    sellersAtRisk: over.sellersAtRisk ?? 0, hotBuyers: over.hotBuyers ?? 0, lastActiveAt: over.lastActiveAt ?? daysAgo(1), ...over,
  };
}
function office(brokers: BrokerInput[], over: Partial<OfficeInput> = {}): OfficeInput {
  return { brokers, teamFollowUpRatePct: 55, losingMoney: ["3 נכסים תקועים מעל 90 יום"], orgScore: 68, approvals: { count: 2, bundles: [{ title: "אישור קמפיין", priority: 80, href: "/executive" }] }, ...over };
}

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });
  const card = (r: ReturnType<typeof composeOfficeManager>, id: string) => r.brokers.find((b) => b.id === id)!;

  // 1. Overloaded broker.
  const r1 = composeOfficeManager(office([broker({ id: "b1", name: "רון", todayEvents: 6, activeBuyers: 8, activeSellers: 6, openLeads: 6, hotBuyers: 3 })]), NOW);
  add("overloaded: level overloaded + flag", card(r1, "b1").isOverloaded && card(r1, "b1").workloadLevel === "overloaded" && r1.totals.overloaded === 1);

  // 2. Inactive broker.
  const r2 = composeOfficeManager(office([broker({ id: "b1", state: "offline", lastActiveAt: daysAgo(30) })]), NOW);
  add("inactive: flagged inactive", card(r2, "b1").isInactive && r2.totals.inactive === 1);

  // 3. Missing follow-up (high open leads).
  const r3 = composeOfficeManager(office([broker({ id: "b1", name: "דנה", openLeads: 12 })]), NOW);
  add("missing follow-up: concern + in compliance list", card(r3, "b1").followUpConcern && r3.followUp.brokersAtRisk.some((x) => x.name === "דנה"));

  // 4. Risk seller by broker.
  const r4 = composeOfficeManager(office([broker({ id: "b1", name: "יוסי", sellersAtRisk: 2 })]), NOW);
  add("risk seller: in riskByBroker", r4.riskByBroker.some((x) => x.name === "יוסי" && x.sellersAtRisk === 2));

  // 5. Hot buyer by broker.
  const r5 = composeOfficeManager(office([broker({ id: "b1", name: "מיה", hotBuyers: 3 })]), NOW);
  add("hot buyer: in riskByBroker", r5.riskByBroker.some((x) => x.name === "מיה" && x.hotBuyers === 3));

  // 6. Delegation suggestion (overloaded → available).
  const r6 = composeOfficeManager(office([
    broker({ id: "b1", name: "רון", todayEvents: 6, activeBuyers: 8, activeSellers: 6, openLeads: 6, sellersAtRisk: 2 }),
    broker({ id: "b2", name: "נועה", state: "free", todayEvents: 0, activeBuyers: 0, activeSellers: 0, openLeads: 0 }),
  ]), NOW);
  const del = r6.delegations.find((d) => d.fromBrokerId === "b1");
  add("delegation: overloaded → broker with capacity", !!del && del.toBrokerId === "b2");

  // 7. Vacation mode.
  const r7 = composeOfficeManager(office([
    broker({ id: "b1", name: "עידן", state: "vacation", openLeads: 4 }),
    broker({ id: "b2", name: "נועה", state: "free", todayEvents: 0, activeBuyers: 0, activeSellers: 0, openLeads: 0 }),
  ]), NOW);
  add("vacation: flagged + listed", card(r7, "b1").isOnVacation && r7.vacation.onVacation.some((v) => v.name === "עידן") && r7.totals.onVacation === 1);
  add("vacation: excluded as delegation target", !r7.delegations.some((d) => d.toBrokerId === "b1"));

  // 8. No auto-assignment — every delegation is approval-gated, never auto-assigned.
  add("no auto-assign: all delegations require approval + autoAssign false", r6.delegations.every((d) => d.requiresApproval === true && d.autoAssign === false));

  // 9. No data → honest empty.
  const r9 = composeOfficeManager(office([]), NOW);
  add("no data: hasData false + note", !r9.hasData && r9.notes.some((n) => n.includes("אין")));

  // 10. Briefing surfaces losing-money + today focus.
  add("briefing: losing money + today focus", r1.briefing.losingMoney.length > 0 && r1.briefing.todayFocus.includes("אירועים"));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
