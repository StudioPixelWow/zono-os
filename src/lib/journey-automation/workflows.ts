// ============================================================================
// ZONO — Workflow helpers (pure). Journey-type metadata + a small graph builder
// used by templates and the visual builder.
// ============================================================================
import type { JourneyType, NodeKind, WorkflowEdge, WorkflowGraph, WorkflowNode } from "./types";

export const JOURNEY_TYPES: { type: JourneyType; label: string; icon: string }[] = [
  { type: "seller", label: "מסע מוכר", icon: "Handshake" },
  { type: "buyer", label: "מסע קונה", icon: "Users" },
  { type: "property", label: "מסע נכס", icon: "Building" },
  { type: "deal", label: "מסע עסקה", icon: "Briefcase" },
  { type: "lead", label: "מסע ליד", icon: "MessageCircle" },
  { type: "office", label: "מסע משרד", icon: "Building2" },
];

export const journeyTypeLabel = (t: string): string => JOURNEY_TYPES.find((j) => j.type === t)?.label ?? t;

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  trigger: "טריגר", condition: "תנאי", delay: "השהיה", action: "פעולה", split: "פיצול", merge: "מיזוג", end: "סיום",
};

/** Fluent linear/branching graph builder for templates (deterministic ids). */
export class GraphBuilder {
  private nodes: WorkflowNode[] = [];
  private edges: WorkflowEdge[] = [];
  private seq = 0;

  add(node: Omit<WorkflowNode, "id"> & { id?: string }): string {
    const id = node.id ?? `n${++this.seq}`;
    this.nodes.push({ ...node, id });
    return id;
  }
  link(from: string, to: string, branch: WorkflowEdge["branch"] = null): void {
    this.edges.push({ id: `e${this.edges.length + 1}`, from, to, branch });
  }
  /** Add a chain of nodes already created, linking sequentially. */
  chain(ids: string[]): void {
    for (let i = 0; i < ids.length - 1; i++) this.link(ids[i]!, ids[i + 1]!);
  }
  build(): WorkflowGraph {
    return { nodes: this.nodes, edges: this.edges };
  }
}

/** Layout nodes into a simple vertical column (x by branch) for the builder. */
export function autoLayout(graph: WorkflowGraph): WorkflowGraph {
  const depth = new Map<string, number>();
  const start = graph.nodes.find((n) => n.kind === "trigger");
  if (start) {
    const q: { id: string; d: number }[] = [{ id: start.id, d: 0 }];
    const seen = new Set<string>();
    while (q.length) {
      const { id, d } = q.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      depth.set(id, Math.max(depth.get(id) ?? 0, d));
      for (const e of graph.edges.filter((x) => x.from === id)) q.push({ id: e.to, d: d + 1 });
    }
  }
  const perDepth = new Map<number, number>();
  const nodes = graph.nodes.map((n) => {
    const d = depth.get(n.id) ?? 0;
    const col = perDepth.get(d) ?? 0;
    perDepth.set(d, col + 1);
    return { ...n, x: n.x ?? (120 + col * 220), y: n.y ?? (60 + d * 120) };
  });
  return { nodes, edges: graph.edges };
}
