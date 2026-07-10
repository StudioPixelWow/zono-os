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
