// ============================================================================
// ZI Interactive Learning™ (Phase 25) — types (client-safe).
// ZI stays SUPPORT-ONLY: it teaches, explains and guides. Learning content
// NEVER triggers actions, never mutates business data. Future-compat fields
// (video/voice/annotations) are declared but optional so 25.x can extend
// without changing this architecture.
// ============================================================================
import type { RoleKey } from "../types";

export type LearningKind = "tutorial" | "walkthrough" | "glossary" | "faq" | "path";

/** A single step inside a walkthrough / tutorial. */
export interface LearningStep {
  id: string;
  title: string;
  body: string;
  screen?: string | null;          // route to look at while learning (read-only)
  tip?: string | null;
  // future-compat (optional, unused by 25.0):
  videoUrl?: string | null;
  voiceUrl?: string | null;
  annotation?: { selector: string; text: string } | null;
}

export interface Walkthrough {
  slug: string;
  module: string;                  // navigation module id
  title: string;
  goal: string;
  estimatedMinutes: number;
  prerequisites: string[];
  steps: LearningStep[];
  commonMistakes: string[];
  proTips: string[];
  roleMin: RoleKey;
}

export interface Tutorial {
  slug: string;
  module: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  steps: LearningStep[];
  roleMin: RoleKey;
}

export interface GlossaryTerm {
  term: string;
  slug: string;
  definition: string;
  whereUsed: string;               // where in ZONO it appears
  related: string[];               // related feature/term slugs
}

export interface FaqItem {
  slug: string;
  module: string;
  question: string;
  answer: string;
  roleMin: RoleKey;
}

export interface LearningPath {
  slug: string;
  title: string;
  description: string;
  steps: { kind: LearningKind; slug: string; title: string }[];
}

/** Per-user progress (stored). */
export interface LearningProgress {
  kind: LearningKind;
  slug: string;
  status: "viewed" | "in_progress" | "completed";
  favorite: boolean;
  lastStep: number;
  updatedAt: string;
}

/** A search hit across knowledge / faq / glossary / tutorials / walkthroughs. */
export interface LearningSearchHit {
  kind: LearningKind | "knowledge";
  slug: string;
  title: string;
  snippet: string;
  module: string | null;
  score: number;
}

/** A deterministic learning recommendation for the current user/context. */
export interface LearningRecommendation {
  reason: string;                  // why we suggest it (Hebrew)
  kind: LearningKind;
  slug: string;
  title: string;
  priority: number;                // higher = surfaced first
}
