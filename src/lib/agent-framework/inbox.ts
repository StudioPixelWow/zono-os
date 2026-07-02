// ============================================================================
// 🤖 Agent Framework — inbox + explainability (pure). 29.1. Parts 6 + 9.
// Turns an agent proposal into a gated, explained inbox item awaiting approval.
// A proposal the agent isn't permitted to make is kept but marked blocked (never
// executed). Nothing here executes anything.
// ============================================================================
import { canPropose, requiresApproval } from "./permissions";
import type { AgentDefinition, AgentProposal, AgentInboxItem } from "./types";

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

export function buildInboxItem(agent: AgentDefinition, p: AgentProposal, seq: number): AgentInboxItem {
  const allowed = canPropose(agent.permissions, p.kind);
  const entity = p.entityName ?? (p.entityId ? `${p.entityType ?? "entity"}:${p.entityId}` : p.entityType ?? "הארגון");
  const ifIgnored = p.ifIgnored ?? (p.impact === "high" ? "החמצת הזדמנות/סיכון מהותי" : "עיכוב/החמצה אפשרית");
  return {
    id: `${agent.id}-inbox-${seq}`, agentId: agent.id, agentName: agent.name, kind: p.kind,
    entity, recommendation: p.title, reason: p.reason, evidence: p.evidence,
    confidence: clamp(p.confidence), impact: p.impact, urgency: clamp(p.urgency),
    requiresApproval: requiresApproval(agent.permissions),
    status: "pending",
    blocked: !allowed, blockReason: allowed ? null : `לסוכן אין הרשאה ל-${p.kind}`,
    explain: {
      why: `הסוכן "${agent.name}" פעל: ${p.reason}`,
      evidence: p.evidence.length ? p.evidence : ["ראיה מהמנועים הקיימים"],
      recommends: p.title, ifIgnored, confidence: clamp(p.confidence),
      alternatives: p.alternatives ?? ["המשך ניטור", "דחה להמשך"],
    },
  };
}
