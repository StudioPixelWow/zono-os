// ============================================================================
// 🧬 ZONO — Self-Learning AI — barrel. PHASE 54.0.
// Learns which copy/groups/hours/areas work from REAL outcomes, with repetition
// + confidence thresholds, false-pattern prevention and staleness. Advisory:
// influences existing engines, never replaces them; nothing auto-executes.
// ============================================================================
export {
  SELF_LEARNING_VERSION, DIMENSION_HE, STATUS_HE, DEFAULT_THRESHOLDS, ADVISORY_NOTE,
  type LearningDimension, type LearningSignal, type LearnedPattern, type PatternStatus,
  type Direction, type DimensionLearning, type LearningRecommendation, type LearningReport, type LearningThresholds,
} from "./types";
export { learnPatterns } from "./learn";
export { getLearningReport, getLearningRecommendations } from "./service";
export { runSelfCheck } from "./qa";
