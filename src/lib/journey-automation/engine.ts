// ============================================================================
// ZONO — Journey graph engine (pure, deterministic). Graph helpers, validation
// and planning. The executor lives in execution.ts; this module is the shared
// graph vocabulary both the builder UI and the executor rely on.
// ============================================================================
import type {
  PlannedStep, TriggerContext, ValidationIssue, ValidationResult, WorkflowEdge,
  WorkflowGraph, WorkflowNode,
} from "./types";
import { evaluateConditions } from "./conditions";
import { delayMinutesOf } from "./delays";

export function nodeById(graph: WorkflowGraph): Map<string, WorkflowNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}

export function outgoing(graph: WorkflowGraph, nodeId: string): WorkflowEdge[] {
  return graph.edges.filter((e) => e.from === nodeId);
}

export function indegree(graph: WorkflowGraph): Map<string, number> {
  const m = new Map<string, number>();
  for (const n of graph.nodes) m.set(n.id, 0);
  for (const e of graph.edges) m.set(e.to, (m.get(e.to) ?? 0) + 1);
  return m;
}

export function triggerNode(graph: WorkflowGraph): WorkflowNode | null {
  return graph.nodes.find((n) => n.kind === "trigger") ?? null;
}

/** Detect a cycle via DFS (the executor requires a DAG). */
function hasCycle(graph: WorkflowGraph): boolean {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) adj.get(e.from)?.push(e.to);
  const state = new Map<string, 0 | 1 | 2>(); // 0=unseen 1=in-stack 2=done
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const next of adj.get(id) ?? []) if (visit(next)) return true;
    state.set(id, 2);
    return false;
  };
  for (const n of graph.nodes) if (visit(n.id)) return true;
  return false;
}

/** Validate a workflow graph. Deterministic; returns errors + warnings. */
export function validateGraph(graph: WorkflowGraph): ValidationResult {
  const issues: ValidationIssue[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));

  const triggers = graph.nodes.filter((n) => n.kind === "trigger");
  if (triggers.length === 0) issues.push({ level: "error", nodeId: null, message: "חסר צומת טריגר." });
  if (triggers.length > 1) issues.push({ level: "error", nodeId: null, message: "מותר טריגר אחד בלבד." });
  if (triggers[0] && !triggers[0].triggerType) issues.push({ level: "error", nodeId: triggers[0].id, message: "לטריגר חסר סוג." });

  if (!graph.nodes.some((n) => n.kind === "end")) issues.push({ level: "warning", nodeId: null, message: "מומלץ צומת סיום." });

  for (const e of graph.edges) {
    if (!ids.has(e.from)) issues.push({ level: "error", nodeId: e.from, message: "קשת ממקור לא קיים." });
    if (!ids.has(e.to)) issues.push({ level: "error", nodeId: e.to, message: "קשת ליעד לא קיים." });
  }
  for (const n of graph.nodes) {
    if (n.kind === "action" && !n.actionType) issues.push({ level: "error", nodeId: n.id, message: "לפעולה חסר סוג." });
    if (n.kind === "condition") {
      const branches = outgoing(graph, n.id).map((e) => e.branch);
      if (!branches.includes("true")) issues.push({ level: "warning", nodeId: n.id, message: "לתנאי חסר ענף 'כן'." });
    }
  }
  if (hasCycle(graph)) issues.push({ level: "error", nodeId: null, message: "הגרף מכיל מעגל — נדרש גרף ללא מעגלים." });

  return { ok: !issues.some((i) => i.level === "error"), issues };
}

/**
 * Plan a linear preview of the journey for a given context (deterministic, no
 * side effects). Follows condition branches using the provided context, and
 * lists delays. Used by Simulation Mode previews + the builder.
 */
export function planJourney(graph: WorkflowGraph, ctx: TriggerContext): PlannedStep[] {
  const map = nodeById(graph);
  const start = triggerNode(graph);
  if (!start) return [];
  const out: PlannedStep[] = [];
  const seen = new Set<string>();
  const queue: { id: string; branch: string | null }[] = [{ id: start.id, branch: null }];

  while (queue.length) {
    const { id, branch } = queue.shift()!;
    const node = map.get(id);
    if (!node || seen.has(id)) continue;
    seen.add(id);

    out.push({
      nodeId: node.id, nodeKind: node.kind, actionType: node.actionType,
      title: node.title ?? node.actionType ?? node.kind, branch,
      delayMinutes: node.kind === "delay" || node.actionType === "wait" ? delayMinutesOf(node) : undefined,
    });
    if (node.kind === "end" || node.actionType === "end") continue;

    const edges = outgoing(graph, node.id);
    if (node.kind === "condition") {
      const passed = evaluateConditions(node.conditions ?? [], ctx).passed;
      const want: "true" | "false" = passed ? "true" : "false";
      for (const e of edges) if ((e.branch ?? "true") === want || e.branch == null) queue.push({ id: e.to, branch: want });
    } else {
      for (const e of edges) queue.push({ id: e.to, branch: e.branch ?? null });
    }
  }
  return out;
}
