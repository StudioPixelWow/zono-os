// ZI Learning — progress helpers (Phase 25, PURE). Per-user, read-only logic.
import type { LearningProgress, LearningKind } from "./types";

export const progressKey = (kind: LearningKind, slug: string) => `${kind}:${slug}`;

export function findProgress(list: LearningProgress[], kind: LearningKind, slug: string): LearningProgress | null {
  return list.find((p) => p.kind === kind && p.slug === slug) ?? null;
}

export const isCompleted = (list: LearningProgress[], kind: LearningKind, slug: string): boolean =>
  findProgress(list, kind, slug)?.status === "completed";

export const completedCount = (list: LearningProgress[], kind?: LearningKind): number =>
  list.filter((p) => p.status === "completed" && (!kind || p.kind === kind)).length;

/** Items the user started but hasn't finished — "Continue Learning". */
export function continueLearning(list: LearningProgress[]): LearningProgress[] {
  return list.filter((p) => p.status === "in_progress")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

/** Most recently touched items — "Recently Viewed". */
export function recentlyViewed(list: LearningProgress[], limit = 6): LearningProgress[] {
  return [...list].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, limit);
}

export const favorites = (list: LearningProgress[]): LearningProgress[] => list.filter((p) => p.favorite);
