// ============================================================================
// ✅ Agent Framework — self-tests (pure, offline). 29.1. Part 13.
// Registration, run, permission blocking, recommendation creation, approval
// required, disabled agent does not run, agent inbox, performance, scheduler and
// NO auto-execution — plus the two built-in placeholder agents.
// ============================================================================
import { AgentRegistry } from "./registry";
import { computePerformance } from "./performance";
import { canAutoExecute, requiresApproval } from "./permissions";
import { shouldRun } from "./scheduler";
import { seedBuiltinAgents } from "./agents";
import type { AgentDefinition, AgentContext, AgentActionRecord } from "./types";

export interface AFCheck { name: string; pass: boolean; detail: string }
export interface AFSelfCheck { ok: boolean; total: number; passed: number; checks: AFCheck[] }

const NOW = Date.UTC(2026, 6, 2);
const ctx = (data: Record<string, unknown> = {}, event?: string | null): AgentContext => ({ now: NOW, orgId: "org1", event, data });

const dummy: AgentDefinition = {
  id: "dummy", type: "market", name: "סוכן דמה", description: "בדיקה", scope: "org",
  permissions: ["READ", "SUGGEST", "REQUEST_APPROVAL"], schedule: { mode: "daily" },
  run: () => [
    { kind: "recommendation", title: "המלצה א", reason: "כי", evidence: ["ראיה"], confidence: 70, impact: "high", urgency: 80 },
    { kind: "mission", title: "צור משימה", reason: "צריך", evidence: ["ראיה"], confidence: 60, impact: "medium", urgency: 50 },
  ],
};

export function runSelfCheck(): AFSelfCheck {
  const checks: AFCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Registration.
  const reg = new AgentRegistry();
  reg.registerAgent(dummy);
  add("register + get agent", reg.getAgent("dummy")?.id === "dummy", "");
  add("list agents", reg.listAgents().length === 1, "");
  add("agent enabled by default", reg.isEnabled("dummy"), "");

  // Run + inbox + recommendation creation.
  const res = reg.runAgent("dummy", ctx());
  add("agent run produces inbox", !res.skipped && res.inbox.length === 2, `${res.inbox.length}`);
  add("recommendation item created", res.inbox.some((i) => i.kind === "recommendation" && i.recommendation === "המלצה א"), "");
  add("inbox item has explainability", res.inbox[0].explain.why.length > 0 && res.inbox[0].explain.ifIgnored.length > 0 && res.inbox[0].explain.alternatives.length > 0, "");
  add("inbox item has evidence + confidence + impact", res.inbox[0].evidence.length > 0 && res.inbox[0].confidence > 0 && !!res.inbox[0].impact, "");

  // Permission blocking (dummy lacks CREATE_MISSION → mission proposal blocked).
  add("permission blocks mission proposal", res.inbox.some((i) => i.kind === "mission" && i.blocked && !!i.blockReason), "");
  add("permitted recommendation not blocked", res.inbox.some((i) => i.kind === "recommendation" && !i.blocked), "");

  // Approval required + no auto-execution.
  add("approval required (no AUTO_EXECUTE)", res.inbox.every((i) => i.requiresApproval) && requiresApproval(dummy.permissions), "");
  add("no auto-execution", !canAutoExecute() && res.inbox.every((i) => i.status === "pending"), "");

  // Disabled agent does not run.
  reg.disableAgent("dummy");
  const disabledRes = reg.runAgent("dummy", ctx());
  add("disabled agent skips", disabledRes.skipped && disabledRes.inbox.length === 0, "");
  add("status reflects disabled", reg.status("dummy") === "disabled" && !reg.isEnabled("dummy"), "");
  reg.enableAgent("dummy");
  add("re-enable works", reg.isEnabled("dummy"), "");

  // Scheduler foundation.
  add("daily eligible when never run", shouldRun({ mode: "daily" }, NOW, null), "");
  add("daily not eligible right after run", !shouldRun({ mode: "daily" }, NOW, new Date(NOW).toISOString()), "");
  add("manual only on manual event", shouldRun({ mode: "manual" }, NOW, null, "manual") && !shouldRun({ mode: "manual" }, NOW, null, "daily"), "");
  add("on_risk eligible on risk event", shouldRun({ mode: "on_risk" }, NOW, null, "risk_detected"), "");

  // Performance.
  const log: AgentActionRecord[] = [
    { agentId: "dummy", at: "", kind: "recommended" }, { agentId: "dummy", at: "", kind: "recommended" }, { agentId: "dummy", at: "", kind: "recommended" },
    { agentId: "dummy", at: "", kind: "approved" }, { agentId: "dummy", at: "", kind: "rejected" },
    { agentId: "dummy", at: "", kind: "completed" }, { agentId: "dummy", at: "", kind: "ignored" },
  ];
  const perf = computePerformance(log, ["high", "medium"]);
  add("performance counts", perf.recommendations === 3 && perf.approved === 1 && perf.rejected === 1 && perf.completed === 1 && perf.ignored === 1, "");
  add("performance rates + false positives", perf.successRatePct === 100 && perf.avgImpact > 0 && perf.falsePositives === 2, `${perf.successRatePct}/${perf.avgImpact}`);

  // Agent view.
  const view = reg.viewFor("dummy", NOW, 2);
  add("agent view full model", !!view && view.status === "enabled" && typeof view.health === "number" && !!view.performance && view.pendingApprovals === 2, "");

  // ── Built-in placeholder agents ─────────────────────────────────────────────
  const reg2 = new AgentRegistry();
  seedBuiltinAgents(reg2);
  add("built-ins registered", reg2.getAgent("daily-briefing") != null && reg2.getAgent("mission-followup") != null, "");
  const brief = reg2.runAgent("daily-briefing", ctx({ briefing: { todaysPriorities: [{ title: "עדיפות 1", businessImpact: "high", urgency: 70, evidence: ["e"] }], criticalRisks: [{ title: "סיכון 1", evidence: ["r"] }] } }));
  add("daily briefing agent suggests", !brief.skipped && brief.inbox.length >= 2 && brief.inbox.every((i) => i.requiresApproval && i.status === "pending"), `${brief.inbox.length}`);
  const mf = reg2.runAgent("mission-followup", ctx({ actionCenter: { blocked: [{ id: "M1", goal: "גייס", entityName: "משרד", priority: 80 }], waiting: [{ id: "M2", goal: "אשר", priority: 60 }], critical: [{ id: "M3", goal: "קריטי", priority: 90 }] } }));
  add("mission agent suggests + can propose mission (permitted)", mf.inbox.some((i) => i.kind === "mission" && !i.blocked), "");
  add("built-in agents never auto-execute", brief.inbox.concat(mf.inbox).every((i) => i.requiresApproval && i.status === "pending"), "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
