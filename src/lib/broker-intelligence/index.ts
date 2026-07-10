// ============================================================================
// 🧠 ZONO — BROKER INTELLIGENCE · public surface.
// Evidence-based, no-fabrication intelligence across the broker's day.
// Area 1 · Acquisition (live). Areas 2–6 land in subsequent batches.
// ============================================================================
export type {
  Recommendation, Evidence, DataSource, IntelligenceArea, Urgency,
} from "./types";
export { clamp100, urgencyFromScore, MIN_EVIDENCE } from "./types";
export { scoreAcquisition, rankAcquisition } from "./acquisition";
export type { AcquisitionSignals } from "./acquisition";
export { scoreBuyer, rankBuyers } from "./buyer";
export type { BuyerSignals } from "./buyer";
export { scoreSeller, rankSellers } from "./seller";
export type { SellerSignals } from "./seller";
export { scoreDeal, rankDeals } from "./deal";
export type { DealSignals } from "./deal";
// Global integration — the ONE shared priority queue every surface consumes.
export { buildPriorityQueue, actionClass } from "./priority";
export type { PrioritizedRecommendation } from "./priority";
export { getBrokerIntelligenceQueue } from "./aggregate-service";
export type { BrokerIntelligenceQueue, QueueOptions } from "./aggregate-service";
// Area 6 — Office (manager summary over the shared queue).
export { summarizeOffice } from "./office";
export type { OfficeSummary } from "./office";
export { getOfficeIntelligence } from "./office-service";
// Broker OS · Phase 2 — Today Agenda (chronological workday from the queue).
export { buildAgenda } from "./agenda";
export type { AgendaSlot, BrokerAgenda, AgendaOptions } from "./agenda";
export { getBrokerTodayAgenda } from "./agenda-service";
