// ============================================================================
// 🗓️ ZONO — BROKER INTELLIGENCE · Today Agenda service (server-only).
// Reuses the ONE shared priority queue (getBrokerIntelligenceQueue) and runs it
// through the pure agenda scheduler. No new engine, no recomputation — the
// agenda is purely a chronological VIEW of what the queue already prioritized.
// Never throws.
// ============================================================================
import "server-only";
import { getBrokerIntelligenceQueue } from "./aggregate-service";
import { buildAgenda, type BrokerAgenda, type AgendaOptions } from "./agenda";

/**
 * The broker's chronological workday, built live from the shared queue.
 * Pulls a generous slice (the scheduler caps the visible day itself).
 */
export async function getBrokerTodayAgenda(opts: AgendaOptions = {}): Promise<BrokerAgenda> {
  try {
    const { items } = await getBrokerIntelligenceQueue({ limit: 24 });
    return buildAgenda(items, { now: new Date(), ...opts });
  } catch {
    return { slots: [], overflow: 0, firstActionTime: null, plannedMinutes: 0 };
  }
}
