// ============================================================================
// 🏢 ZONO — BROKER INTELLIGENCE · Area 6 · Office service (server-only).
// Manager view over the SAME shared priority queue — no new engine, no second
// queue. Pulls the full actionable queue and summarizes it into the four things
// a manager needs automatically. Never throws.
// ============================================================================
import "server-only";
import { getBrokerIntelligenceQueue } from "./aggregate-service";
import { summarizeOffice, type OfficeSummary } from "./office";

export async function getOfficeIntelligence(): Promise<OfficeSummary> {
  try {
    const queue = await getBrokerIntelligenceQueue({ perEngine: 30 });
    return summarizeOffice(queue.items);
  } catch (e) {
    console.error("[broker-intelligence] office failed:", e);
    return { topOpportunity: null, topRisk: null, biggestRevenue: null, biggestRetention: null, totalActionable: 0 };
  }
}
