// ============================================================================
// 🧠 AI Memory & Personal Context™ — public surface. Phase 27.7.
// Persistent, structured, user-controlled memory. No reasoning, no execution.
// ============================================================================
export {
  listMemoriesAction, createMemoryAction, updateMemoryAction, setMemoryVisibilityAction,
  pinMemoryAction, archiveMemoryAction, restoreMemoryAction, deleteMemoryAction, touchMemoryAction,
  type MemoryActionResult,
} from "./service";
export { searchMemories, applyFilter, groupForDisplay, explainMemory, applyLifecycle, isExpired } from "./memory-engine";
export { validateMemoryInput, deepStripSecrets, MEMORY_TYPE_LABELS, VISIBILITY_LABELS } from "./schema";
export { runSelfCheck } from "./qa";
export { AI_MEMORY_VERSION } from "./types";
export type {
  AiMemory, AiMemoryInput, MemoryType, MemoryVisibility, MemoryStatus, MemorySource,
  MemoryFilter, MemoryExplain, MemoryGroups,
} from "./types";
