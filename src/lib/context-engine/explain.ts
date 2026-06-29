// ============================================================================
// 🔍 Context Explainability — exposes how a package was built (pure).
// Repositories used · entities collected · confidence · missing info · priority
// summary · size · timestamp · version. No AI, deterministic except timestamp.
// ============================================================================
import { approxChars } from "./compression";
import { CONTEXT_ENGINE_VERSION } from "./types";
import type { ContextBlock, ContextExplain, ContextSize } from "./types";

export function buildExplain(args: {
  blocks: ContextBlock[];
  repositories: string[];
  entities: string[];
  missing: string[];
  size: ContextSize;
  timestamp?: string;
}): ContextExplain {
  const { blocks, repositories, entities, missing, size } = args;
  const confs = blocks.map((b) => b.confidence).filter((c): c is number => typeof c === "number");
  const confidence = confs.length ? Math.round(confs.reduce((s, c) => s + c, 0) / confs.length) : null;

  return {
    repositoriesUsed: [...new Set(repositories)].sort(),
    entitiesCollected: [...new Set(entities)].sort(),
    confidence,
    missing: [...new Set(missing)].sort(),
    prioritySummary: blocks
      .map((b) => ({ key: b.key, priority: b.priority }))
      .sort((a, b) => b.priority - a.priority),
    size,
    blockCount: blocks.length,
    approxChars: approxChars(blocks),
    timestamp: args.timestamp ?? new Date().toISOString(),
    version: CONTEXT_ENGINE_VERSION,
  };
}
