// ============================================================================
// ✅ Mission Engine self-tests (pure, offline). Phase 27.5.
// Validates task generation (incl. unknown types), decision→mission mapping,
// follow-up suggestions, explainability and entity-agnostic behavior.
// ============================================================================
import { generateTasks, missionTitle } from "./templates";
import { missionTypeFromDecision, decisionToMissionInput } from "./decision-bridge";
import { suggestFollowUps, ifIgnoredText, buildExplain } from "./followup";
import type { Mission } from "./types";
import type { Decision } from "@/lib/decision-engine";

export interface MECheck { name: string; pass: boolean; detail: string }
export interface MESelfCheck { ok: boolean; total: number; passed: number; checks: MECheck[] }

const DAY = 86400000;
const decision = (over: Partial<Decision>): Decision => ({
  id: "dec-1", category: "BROKERAGE", title: "גייס מתווך נוסף לסביניה", priorityScore: 82,
  executionReadiness: "needs_approval", evidence: ["השוק צמח 24%", "2 מתווכים בלבד"], why: "צמיחה וכיסוי דל",
  actions: [{ id: "a1", title: "פתח משרת גיוס", priority: 82, expectedImpact: "high", effort: "medium", deadlineDays: 30, confidence: 70, reason: "כיסוי דל" }],
  ...over,
});

export function runSelfCheck(): MESelfCheck {
  const checks: MECheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Task generation.
  add("recruit tasks = 5", generateTasks("RECRUIT_BROKER").length === 5, `${generateTasks("RECRUIT_BROKER").length}`);
  add("seller tasks include call", generateTasks("SELLER_OPPORTUNITY").some((t) => /התקשר/.test(t.title)), "");
  add("unknown type → generic", generateTasks("FUTURE_TYPE_XYZ").length >= 3 && missionTitle("FUTURE_TYPE_XYZ") === "משימה כללית", "");
  add("tasks ordered + status", generateTasks("EXPAND_TERRITORY").every((t, i) => t.order === i + 1 && t.status === "READY"), "");

  // Decision → mission type mapping.
  add("brokerage recruit", missionTypeFromDecision("BROKERAGE", "גייס מתווך") === "RECRUIT_BROKER", "");
  add("territory → expand", missionTypeFromDecision("TERRITORY", "התרחב") === "EXPAND_TERRITORY", "");
  add("competitive → response", missionTypeFromDecision("COMPETITIVE", "עקוב") === "COMPETITIVE_RESPONSE", "");
  add("operations conflict → cleanup", missionTypeFromDecision("OPERATIONS", "פתור התנגשויות שיוך") === "OFFICE_CLEANUP", "");
  add("unknown category → general", missionTypeFromDecision("WHATEVER", "x") === "GENERAL", "");

  // Decision → mission input carries evidence/priority + readiness → status.
  const input = decisionToMissionInput(decision({}), { entityType: "office", entityId: "O1", entityName: "RE/MAX Family" });
  add("mission input priority", input.priority === 82 && input.missionType === "RECRUIT_BROKER", "");
  add("mission input evidence", (input.evidence ?? []).length === 2, "");
  add("readiness → waiting_approval", input.status === "WAITING_FOR_APPROVAL", `${input.status}`);
  add("entity-agnostic", input.entityType === "office" && input.entityId === "O1", "");
  const buyerInput = decisionToMissionInput(decision({ category: "BUYER", title: "קונה" }), { entityType: "buyer", entityId: "B1" });
  add("works for buyer entity", buyerInput.entityType === "buyer" && buyerInput.missionType === "BUYER_OPPORTUNITY", "");

  // Follow-ups by status/age.
  const mk = (over: Partial<Mission>): Mission => ({ id: "m", organizationId: null, sourceDecision: null, entityType: "office", entityId: "O1", entityName: null, missionType: "RECRUIT_BROKER", priority: 80, businessImpact: "high", confidence: 70, reason: "", goal: "", expectedOutcome: "", status: "WAITING_FOR_APPROVAL", owner: null, tasks: [], history: [], evidence: [], createdAt: new Date().toISOString(), updatedAt: new Date(Date.now() - 5 * DAY).toISOString(), dueAt: null, completedAt: null, createdBy: null, explain: { why: "", fromDecision: null, businessImpact: "high", expectedRoi: "", confidence: 70, ifIgnored: "" }, followUps: [], ...over });
  add("waiting 5d → urgency followup", suggestFollowUps(mk({})).some((f) => /דחיפות|אישור/.test(f)), "");
  add("done → next step", suggestFollowUps(mk({ status: "DONE" })).some((f) => /המשך/.test(f)), "");
  add("all tasks done → close", suggestFollowUps(mk({ status: "IN_PROGRESS", tasks: [{ id: "t", title: "x", order: 1, status: "DONE", effort: "low", note: null }] })).some((f) => /לסגור/.test(f)), "");

  // Explainability.
  add("ifIgnored high priority", /נתח שוק|הזדמנות/.test(ifIgnoredText("low", 90)), "");
  const ex = buildExplain({ why: "צמיחה", fromDecision: "dec-1", businessImpact: "high", confidence: 70, priority: 82, missionType: "RECRUIT_BROKER" });
  add("explain has roi + ifIgnored", ex.expectedRoi.length > 0 && ex.ifIgnored.length > 0 && ex.fromDecision === "dec-1", "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
