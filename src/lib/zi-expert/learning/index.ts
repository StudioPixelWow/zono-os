// ============================================================================
// ZI Interactive Learning™ (Phase 25) — public client-safe barrel.
// Server progress repository + actions are imported directly, not here.
// ============================================================================
export * from "./types";
export { GLOSSARY, searchGlossary, glossaryBySlug } from "./glossary";
export { FAQ, faqForModule, searchFaq, faqBySlug } from "./faq";
export { WALKTHROUGHS, walkthroughsForRole, walkthroughBySlug, walkthroughAsSteps } from "./walkthrough";
export { TUTORIALS, tutorialsForRole, tutorialBySlug } from "./tutorials";
export { LEARNING_PATHS, pathBySlug } from "./learning-paths";
export {
  progressKey, findProgress, isCompleted, completedCount, continueLearning, recentlyViewed, favorites,
} from "./progress";
export { recommendLearning, type RecommendationContext } from "./recommendations";
export { searchLearning, stepByStepFor, allGlossary, allFaq } from "./guide-engine";
