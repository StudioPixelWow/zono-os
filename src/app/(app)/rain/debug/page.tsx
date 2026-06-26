// ZONO — PHASE 26.9: RAIN internal diagnostic page (/rain/debug). Read-only graph
// status + counts + latest nodes/edges, plus a manual "rebuild" button. Not the
// War Room — a small verification surface. Real data only; honest empty states.
import { currentOrgId } from "@/lib/rain/_context";
import { getRainGraphOverview, getRainNodes, getRainEdges } from "@/lib/rain/rainGraphService";
import { RainDebugView } from "./RainDebugView";
import type { RainStats, RainConfidenceSummary, RainNode, RainEdge } from "@/lib/rain/rainTypes";

export const dynamic = "force-dynamic";

const EMPTY_STATS: RainStats = { totalNodes: 0, totalEdges: 0, agencies: 0, agents: 0, properties: 0, territories: 0, activeSignals: 0, highThreatCompetitors: 0 };
const EMPTY_CONF: RainConfidenceSummary = { high: 0, medium: 0, low: 0, scoredNodes: 0, unscoredNodes: 0 };

export default async function RainDebugPage() {
  let stats: RainStats = EMPTY_STATS;
  let confidence: RainConfidenceSummary = EMPTY_CONF;
  let latestNodes: RainNode[] = [];
  let latestEdges: RainEdge[] = [];
  try {
    const org = await currentOrgId();
    const [overview, nodes, edges] = await Promise.all([
      getRainGraphOverview(org),
      getRainNodes(org, { limit: 12 }),
      getRainEdges(org, { limit: 12 }),
    ]);
    stats = overview.stats;
    confidence = overview.confidence;
    latestNodes = nodes;
    latestEdges = edges;
  } catch (e) {
    console.error("[rain/debug] load failed:", e);
  }
  return <RainDebugView stats={stats} confidence={confidence} latestNodes={latestNodes} latestEdges={latestEdges} />;
}
