// ============================================================================
// ✅ Unified Customer Journey — self-tests (pure, offline). 28.5. Part 10.
// Scenarios: lead→buyer, buyer→seller, repeat buyer, investor, dormant customer,
// referral, multi-role — plus identity resolution (one customer, no duplicates),
// merged memory, timeline, health and lifecycle decisions/missions.
// ============================================================================
import { resolveCustomers, type IdentityEntry } from "./identity";
import { buildCustomerJourney } from "./journey";
import type { MemberSummary, MemberKind } from "./types";
import type { TwinActivity } from "../types";

export interface CJCheck { name: string; pass: boolean; detail: string }
export interface CJSelfCheck { ok: boolean; total: number; passed: number; checks: CJCheck[] }

const NOW = Date.UTC(2026, 6, 2);
const DAY = 86400000;
const iso = (d: number) => new Date(NOW - d * DAY).toISOString();
let _a = 0;
const act = (kind: string, daysAgo: number): TwinActivity => ({ id: `a${++_a}`, kind, at: iso(daysAgo), summary: kind, weight: 1 });

const member = (kind: MemberKind, over: Partial<MemberSummary> = {}): MemberSummary => ({
  kind, id: `${kind}-1`, name: "יוסי כהן",
  healthScore: 60, healthLabel: "יציב", activities: [act("call", 2)], recencyScore: 100, engagementScore: 50,
  trust: 60, intentScore: 60, value: null, classification: [], decisions: [], missions: [], learnings: [],
  relationshipDegree: 2, sourceReferral: false, dealSignal: false, createdAt: iso(60), updatedAt: iso(2), ...over,
});

export function runSelfCheck(): CJSelfCheck {
  const checks: CJCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // ── Identity resolution: one customer, no duplicates ────────────────────────
  const entries: IdentityEntry[] = [
    { kind: "lead", id: "L1", name: "יוסי", contacts: ["050111"], links: [{ kind: "buyer", id: "B1" }] },
    { kind: "buyer", id: "B1", name: "יוסי כהן", contacts: ["050111"], links: [] },
    { kind: "seller", id: "S9", name: "רותי", contacts: ["050999"], links: [] },
  ];
  const groups = resolveCustomers(entries);
  add("resolves 2 customers (no dup)", groups.length === 2, `${groups.length}`);
  add("lead+buyer merged into one", groups.some((g) => g.members.length === 2 && g.members.some((m) => m.id === "L1") && g.members.some((m) => m.id === "B1")), "");

  // ── Lead → Buyer ────────────────────────────────────────────────────────────
  _a = 0;
  const leadBuyer = buildCustomerJourney([member("lead", { id: "L1", classification: ["מוסמך"] }), member("buyer", { id: "B1", intentScore: 70, value: 2_000_000 })], { leadToBuyer: true, leadToSeller: false }, NOW);
  add("lead→buyer transition (explicit link)", leadBuyer.transitions.some((t) => t.from === "new_lead" && t.to === "buyer_viewing" && t.confidence >= 90), "");
  add("transition explains why+evidence+confidence", leadBuyer.transitions[0].why.length > 0 && leadBuyer.transitions[0].evidence.length > 0 && leadBuyer.transitions[0].confidence > 0, "");
  add("multi-role classification", leadBuyer.classification.includes("רב-תפקידי") && leadBuyer.identity.roles.includes("lead") && leadBuyer.identity.roles.includes("buyer"), leadBuyer.identity.roles.join(","));
  add("one identity single record", leadBuyer.identity.members.length === 2, "");

  // ── Buyer → Seller ──────────────────────────────────────────────────────────
  const buyerSeller = buildCustomerJourney([member("buyer", { id: "B2", dealSignal: true, value: 1_800_000 }), member("seller", { id: "S2", value: 2_500_000, dealSignal: true })], {}, NOW);
  add("buyer→seller transition", buyerSeller.transitions.some((t) => t.to === "seller"), "");
  add("current stage seller", buyerSeller.currentStage === "seller", buyerSeller.currentStage);

  // ── Repeat buyer ────────────────────────────────────────────────────────────
  const repeat = buildCustomerJourney([member("buyer", { id: "B3", dealSignal: true }), member("buyer", { id: "B4" })], {}, NOW);
  add("repeat_client role + tag", repeat.identity.roles.includes("repeat_client") && repeat.classification.includes("לקוח חוזר"), "");
  add("repeat nurture mission", repeat.missions.some((m) => m.missionType === "REPEAT_BUYER_NURTURE"), "");

  // ── Investor ────────────────────────────────────────────────────────────────
  const investor = buildCustomerJourney([member("buyer", { id: "B5", classification: ["משקיע"], value: 4_000_000 })], {}, NOW);
  add("investor role + opportunity mission", investor.identity.roles.includes("investor") && investor.missions.some((m) => m.missionType === "INVESTOR_OPPORTUNITY"), "");
  add("investor decision present", investor.decisions.some((d) => /השקעה/.test(d.action)), "");

  // ── Dormant customer ────────────────────────────────────────────────────────
  _a = 0;
  const dormant = buildCustomerJourney([member("buyer", { id: "B6", recencyScore: 5, engagementScore: 5, activities: [act("view", 200)] })], {}, NOW);
  add("dormant stage + tag", dormant.currentStage === "dormant" && dormant.classification.includes("רדום"), dormant.currentStage);
  add("dormant → reengage mission + retention", dormant.health.retentionRisk >= 60 && dormant.missions.some((m) => m.missionType === "CUSTOMER_REENGAGE"), `${dormant.health.retentionRisk}`);

  // ── Referral ────────────────────────────────────────────────────────────────
  const referral = buildCustomerJourney([member("lead", { id: "L7", sourceReferral: true }), member("buyer", { id: "B7", dealSignal: true, trust: 85 })], {}, NOW);
  add("referral role + potential", referral.identity.roles.includes("referral") && referral.health.referralPotential >= 40, `${referral.health.referralPotential}`);

  // ── Merged memory + timeline + health ───────────────────────────────────────
  _a = 0;
  const merged = buildCustomerJourney([member("lead", { id: "L8", activities: [act("call", 5), act("message", 6)] }), member("buyer", { id: "B8", activities: [act("visit", 2), act("offer", 1)], value: 3_500_000 })], { leadToBuyer: true }, NOW);
  add("memory merged (never lost)", merged.memory.totalActivities === 4, `${merged.memory.totalActivities}`);
  add("timeline chronological", merged.timeline.length >= 4 && merged.timeline.every((e, i) => i === 0 || merged.timeline[i - 1].at >= e.at), "");
  add("LTV estimate from values", (merged.health.ltvEstimate ?? 0) >= 3_500_000, `${merged.health.ltvEstimate}`);
  add("health full model", ["relationshipHealth", "activity", "trust", "lifetimeValue", "futureValue", "retentionRisk", "referralPotential"].every((k) => typeof (merged.health as unknown as Record<string, number>)[k] === "number"), "");

  // ── No data ─────────────────────────────────────────────────────────────────
  const empty = buildCustomerJourney([member("lead", { id: "L9", activities: [], recencyScore: 0, classification: [] })], {}, NOW);
  add("no activity → note + conservative", empty.notes.length > 0 && empty.memory.totalActivities === 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
