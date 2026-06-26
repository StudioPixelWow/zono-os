// ============================================================================
// ZI Expert™ Knowledge Engine — types (Phase 23, client-safe).
// The knowledge base is what makes ZI deeply understand ZONO. It is READ-ONLY
// product knowledge: screens, features, terminology, workflows, troubleshooting.
// System articles are global; org articles are org-scoped. ZI never invents.
// ============================================================================
import type { RoleKey } from "./types";

export type KnowledgeSourceType = "system" | "org";
/** Minimum role required to SEE an article (role-gated knowledge). */
export type RoleVisibility = RoleKey;

export interface KnowledgeArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  module: string | null;          // navigation module id this article explains
  summary: string;                // 1–2 sentence answer to "what is this"
  content: string;                // full markdown body
  keywords: string[];
  roleVisibility: RoleVisibility;  // minimum role
  sourceType: KnowledgeSourceType;
  sourcePath: string | null;       // e.g. "builtin" or a doc path
  version: number;
  published: boolean;
  routes: string[];                // route prefixes for page-aware retrieval
}

/** A built-in article seed (no DB id yet). */
export type KnowledgeArticleSeed = Omit<KnowledgeArticle, "id">;

export interface KnowledgeChunk {
  id: string;
  articleId: string;
  slug: string;
  ordinal: number;
  heading: string | null;
  content: string;
  keywords: string[];
}

export interface KnowledgeSource {
  id: string;
  name: string;
  sourceType: KnowledgeSourceType;
  description: string | null;
}

export type FeedbackRating = "helpful" | "not_helpful" | "missing_info";

export interface KnowledgeFeedback {
  question: string;
  answer: string;
  articleIds: string[];
  route: string | null;
  moduleId: string | null;
  role: RoleKey | null;
  rating: FeedbackRating;
  comment: string | null;
}

export interface KnowledgeSearchHit {
  article: KnowledgeArticle;
  score: number;
  matchedTerms: string[];
  reason: string;          // why this ranked (route boost / keyword / title)
}

export interface KnowledgeRetrieval {
  query: string;
  hits: KnowledgeSearchHit[];
}

/** A lightweight reference returned to the UI ("מקורות תשובה"). */
export interface KnowledgeSourceRef {
  id: string;
  slug: string;
  title: string;
  category: string;
  route: string | null;    // a route the user can open, if any
}
