// ZI Learning — deterministic learning recommendations (Phase 25, PURE).
// Given the user's role, progress and current context, suggest the next lesson.
// Fully deterministic: same inputs → same ordered output. Never an "action".
import type { RoleKey } from "../types";
import { ROLE_RANK } from "../permissions";
import { TUTORIALS } from "./tutorials";
import { WALKTHROUGHS } from "./walkthrough";
import { isCompleted } from "./progress";
import type { LearningProgress, LearningRecommendation } from "./types";

export interface RecommendationContext {
  role: RoleKey | null;
  progress: LearningProgress[];
  currentModule: string | null;      // module the user is currently on
}

/**
 * Build ordered learning recommendations. Priorities (high→low):
 *  90 current-page walkthrough not yet completed
 *  70 tutorial for the current page not completed
 *  50 any incomplete walkthrough for an accessible module
 *  30 any incomplete tutorial
 */
export function recommendLearning(ctx: RecommendationContext, limit = 4): LearningRecommendation[] {
  const rank = ctx.role ? ROLE_RANK[ctx.role] : ROLE_RANK.viewer;
  const out: LearningRecommendation[] = [];
  const seen = new Set<string>();
  const push = (r: LearningRecommendation) => { const k = `${r.kind}:${r.slug}`; if (!seen.has(k)) { seen.add(k); out.push(r); } };

  // Current page first.
  for (const w of WALKTHROUGHS) {
    if (ROLE_RANK[w.roleMin] > rank) continue;
    if (ctx.currentModule && w.module === ctx.currentModule && !isCompleted(ctx.progress, "walkthrough", w.slug)) {
      push({ reason: "סיור מהיר לעמוד שאתה נמצא בו עכשיו", kind: "walkthrough", slug: w.slug, title: w.title, priority: 90 });
    }
  }
  for (const t of TUTORIALS) {
    if (ROLE_RANK[t.roleMin] > rank) continue;
    if (ctx.currentModule && t.module === ctx.currentModule && !isCompleted(ctx.progress, "tutorial", t.slug)) {
      push({ reason: "מדריך קצר לעמוד הנוכחי", kind: "tutorial", slug: t.slug, title: t.title, priority: 70 });
    }
  }
  // Then anything incomplete the user can access.
  for (const w of WALKTHROUGHS) {
    if (ROLE_RANK[w.roleMin] > rank) continue;
    if (!isCompleted(ctx.progress, "walkthrough", w.slug)) {
      push({ reason: `עדיין לא השלמת את „${w.title}”`, kind: "walkthrough", slug: w.slug, title: w.title, priority: 50 });
    }
  }
  for (const t of TUTORIALS) {
    if (ROLE_RANK[t.roleMin] > rank) continue;
    if (!isCompleted(ctx.progress, "tutorial", t.slug)) {
      push({ reason: `מדריך מומלץ: „${t.title}”`, kind: "tutorial", slug: t.slug, title: t.title, priority: 30 });
    }
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
