// ============================================================================
// ZONO — PHASE 26.9: RAIN UI-ready graph queries (SERVER-ONLY).
// Fetch nodes/edges and assemble the exact payload a future War Room
// visualization expects: { nodes, edges, stats, confidence }. Pure assembly
// lives in rainGraphAssembly (client-safe + unit-tested); this file is the
// IO-backed layer. Re-exports the pure helpers for convenience.
// ============================================================================
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listNodes, listEdges } from "./rainRepository";
import { assemble, subgraphFrom, buildStats, buildConfidence } from "./rainGraphAssembly";
import type { RainGraph } from "./rainTypes";

export { assemble, subgraphFrom, buildStats, buildConfidence };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export async function getRainGraphPayload(db: DB, organizationId: string, opts: { nodeLimit?: number; edgeLimit?: number } = {}): Promise<RainGraph> {
  const [nodes, edges] = await Promise.all([
    listNodes(db, organizationId, { limit: opts.nodeLimit ?? 500 }),
    listEdges(db, organizationId, { limit: opts.edgeLimit ?? 1000 }),
  ]);
  return assemble(nodes, edges);
}

export async function getSubgraphPayload(db: DB, organizationId: string, centerNodeId: string, depth: number): Promise<RainGraph> {
  const [nodes, edges] = await Promise.all([
    listNodes(db, organizationId, { limit: 2000 }),
    listEdges(db, organizationId, { limit: 4000 }),
  ]);
  return subgraphFrom(nodes, edges, centerNodeId, depth);
}
