// ============================================================================
// 🧭 Customer Journey — composer (pure). 28.5. Parts 4 + 5 + 8 + 9 + 7.
// Merges member twins into ONE journey: unified memory (never loses history),
// chronological timeline, health, lifecycle-aware decisions + missions and the
// Chief-of-Staff classification. Reuses the framework buildTwinMemory. Evidence-
// only; no duplicated twin logic.
// ============================================================================
import { buildTwinMemory } from "../core";
import type { TwinActivity, TwinDecisionSignal, TwinMissionSignal } from "../types";
import { deriveRoles, deriveCurrentStage, detectTransitions, buildStageHistory } from "./lifecycle";
import { computeCustomerHealth } from "./health";
import {
  ROLE_HE, STAGE_HE,
  type MemberSummary, type CustomerJourney, type JourneyTimelineEntry,
} from "./types";

export interface JourneyLinks { leadToBuyer?: boolean; leadToSeller?: boolean }

let _d = 0, _m = 0;
const did = () => `cj-d-${++_d}`;
const mid = () => `cj-m-${++_m}`;

export function buildCustomerJourney(members: MemberSummary[], links: JourneyLinks = { leadToBuyer: false, leadToSeller: false }, now: number = Date.now()): CustomerJourney {
  _d = 0; _m = 0;
  const roles = deriveRoles(members);
  const currentStage = deriveCurrentStage(members);
  const transitions = detectTransitions(members, links);
  const stageHistory = buildStageHistory(transitions, currentStage);

  // Part 4 — merged memory (dedup by activity id; never lose history).
  const seen = new Set<string>();
  const allActs: TwinActivity[] = [];
  for (const m of members) for (const a of m.activities) if (!seen.has(a.id)) { seen.add(a.id); allActs.push(a); }
  const mem = buildTwinMemory(allActs, now);

  // Part 5 — one chronological timeline.
  const timeline: JourneyTimelineEntry[] = [
    ...members.flatMap((m) => m.activities.map((a): JourneyTimelineEntry => ({ at: a.at, kind: a.kind, label: a.summary, role: m.kind }))),
    ...transitions.filter((t) => t.at).map((t): JourneyTimelineEntry => ({ at: t.at!, kind: "transition", label: `${STAGE_HE[t.from]} → ${STAGE_HE[t.to]}`, role: "transition" })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);

  // Part 6 — health.
  const health = computeCustomerHealth(members, roles, mem.recencyScore, mem.engagementScore);

  // Part 8 — decisions across the WHOLE lifecycle.
  const decMap = new Map<string, TwinDecisionSignal>();
  const pushDec = (d: TwinDecisionSignal) => { const cur = decMap.get(d.action); if (!cur || d.priority > cur.priority) decMap.set(d.action, d); };
  for (const m of members) for (const d of [...m.decisions].sort((a, b) => b.priority - a.priority).slice(0, 2)) pushDec(d);
  if (health.retentionRisk >= 60) pushDec({ id: did(), action: "שימור לקוח — צור קשר", priority: clampP(70 + health.retentionRisk * 0.2), reason: `סיכון נטישה ${health.retentionRisk}`, evidence: ["רדום/ירידה במעורבות"], readiness: "ready" });
  if (health.referralPotential >= 60) pushDec({ id: did(), action: "בקש הפניה", priority: 62, reason: `פוטנציאל הפניה ${health.referralPotential}`, evidence: ["לקוח מרוצה/חוזר"], readiness: "ready" });
  if (roles.includes("former_client") || currentStage === "owner") pushDec({ id: did(), action: "הצע הערכת שווי / הזדמנות מכירה עתידית", priority: 56, reason: "בעלים/לקוח עבר", evidence: ["רכישה קודמת"], readiness: "ready" });
  if (roles.includes("investor")) pushDec({ id: did(), action: "שלח הזדמנויות השקעה", priority: 58, reason: "פרופיל משקיע", evidence: ["סיווג משקיע"], readiness: "ready" });
  if (roles.includes("repeat_client")) pushDec({ id: did(), action: "טפח לרכישה חוזרת", priority: 55, reason: "לקוח חוזר", evidence: ["מספר רכישות"], readiness: "ready" });
  const decisions = [...decMap.values()].sort((a, b) => b.priority - a.priority).slice(0, 12);

  // Part 9 — missions across the lifecycle.
  const misMap = new Map<string, TwinMissionSignal>();
  const pushMis = (m: TwinMissionSignal) => { const cur = misMap.get(m.missionType); if (!cur || m.priority > cur.priority) misMap.set(m.missionType, m); };
  for (const m of members) for (const ms of [...m.missions].sort((a, b) => b.priority - a.priority).slice(0, 2)) pushMis(ms);
  if (health.retentionRisk >= 60) pushMis({ id: mid(), missionType: "CUSTOMER_REENGAGE", title: "חידוש קשר עם לקוח", priority: 72, reason: "סיכון נטישה" });
  if (health.referralPotential >= 60) pushMis({ id: mid(), missionType: "REFERRAL_REQUEST", title: "בקשת הפניה", priority: 60, reason: "פוטנציאל הפניה" });
  if (roles.includes("investor")) pushMis({ id: mid(), missionType: "INVESTOR_OPPORTUNITY", title: "הזדמנות השקעה", priority: 62, reason: "משקיע" });
  if (roles.includes("repeat_client")) pushMis({ id: mid(), missionType: "REPEAT_BUYER_NURTURE", title: "טיפוח רכישה חוזרת", priority: 58, reason: "לקוח חוזר" });
  const missions = [...misMap.values()].sort((a, b) => b.priority - a.priority).slice(0, 12);

  // Part 7 — Chief-of-Staff classification.
  const kinds = new Set(members.map((m) => m.kind));
  const classification: string[] = [];
  if (roles.includes("repeat_client")) classification.push("לקוח חוזר");
  if (roles.includes("investor")) classification.push("משקיע");
  if (roles.includes("former_client")) classification.push("לקוח עבר");
  if (roles.includes("referral")) classification.push("מקור הפניה");
  if (kinds.size >= 2) classification.push("רב-תפקידי");
  if (health.lifetimeValue >= 65) classification.push("ערך גבוה");
  if (currentStage === "lost") classification.push("אבוד");
  if (currentStage === "dormant") classification.push("רדום");

  // Identity — one customer, never duplicated.
  const primary = members.find((m) => m.kind === "buyer") ?? members.find((m) => m.kind === "seller") ?? members[0];
  const idKey = members.map((m) => `${m.kind}:${m.id}`).sort().join("|");
  const notes: string[] = [];
  if (!members.length) notes.push("אין חברים ללקוח.");
  if (mem.totalActivities === 0) notes.push("אין היסטוריית פעילות — המסע מבוסס על תפקידים בלבד.");

  return {
    identity: { id: `cust:${idKey}`, name: primary?.name ?? "לקוח", roles, members: members.map((m) => ({ kind: m.kind, id: m.id })) },
    currentStage, stageHistory, transitions, memory: { totalActivities: mem.totalActivities, counts: mem.counts, lastActivityAt: mem.lastActivityAt, recencyScore: mem.recencyScore, engagementScore: mem.engagementScore },
    timeline, health, decisions, missions, classification, notes,
  };
}

const clampP = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export { ROLE_HE };
