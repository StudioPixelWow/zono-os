// ============================================================================
// ZI Expert™ Knowledge Engine — repository (Phase 23, SERVER-ONLY).
// Loads articles visible to the current org (system globals + org custom),
// records answer feedback, and powers the admin page. Falls back to the
// built-in articles if the DB hasn't been synced yet, so ZI always has knowledge.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { BUILTIN_ARTICLES } from "./knowledge-docs";
import type { KnowledgeArticle, KnowledgeFeedback, RoleVisibility } from "./knowledge-types";

const ART_COLS = "id,slug,title,category,module,summary,content,keywords,role_visibility,source_type,source_path,version,published,routes,organization_id";

type ArtRow = {
  id: string; slug: string; title: string; category: string; module: string | null;
  summary: string; content: string; keywords: string[]; role_visibility: string;
  source_type: string; source_path: string | null; version: number; published: boolean;
  routes: string[]; organization_id: string | null;
};

function toArticle(r: ArtRow): KnowledgeArticle {
  return {
    id: r.id, slug: r.slug, title: r.title, category: r.category, module: r.module,
    summary: r.summary, content: r.content, keywords: r.keywords ?? [],
    roleVisibility: (r.role_visibility as RoleVisibility) ?? "agent",
    sourceType: r.source_type === "org" ? "org" : "system",
    sourcePath: r.source_path, version: r.version, published: r.published, routes: r.routes ?? [],
  };
}

/** Built-in seeds as runtime articles (synthetic ids) — the pre-sync fallback. */
function builtinAsArticles(): KnowledgeArticle[] {
  return BUILTIN_ARTICLES.map((a, i) => ({ ...a, id: `builtin-${a.slug}-${i}` }));
}

/**
 * Load all knowledge articles visible to the current org: system globals +
 * this org's custom articles. Falls back to built-in seeds if the table is
 * empty/unsynced so retrieval always has content.
 */
export async function loadKnowledgeArticles(): Promise<KnowledgeArticle[]> {
  try {
    const db = await createClient();
    const { data } = await db
      .from("zi_knowledge_articles")
      .select(ART_COLS)
      .eq("published", true)
      .is("deleted_at", null)
      .limit(500);
    const rows = (data as ArtRow[] | null) ?? [];
    if (rows.length === 0) return builtinAsArticles();
    return rows.map(toArticle);
  } catch {
    return builtinAsArticles();
  }
}

/** Admin view: every article (incl. unpublished) the caller can read via RLS. */
export async function loadKnowledgeArticlesAdmin(): Promise<KnowledgeArticle[]> {
  try {
    const db = await createClient();
    const { data } = await db
      .from("zi_knowledge_articles")
      .select(`${ART_COLS},deleted_at`)
      .is("deleted_at", null)
      .order("category", { ascending: true })
      .limit(500);
    const rows = (data as ArtRow[] | null) ?? [];
    if (rows.length === 0) return builtinAsArticles();
    return rows.map(toArticle);
  } catch {
    return builtinAsArticles();
  }
}

/** Record answer feedback (helpful / not helpful / missing info). */
export async function recordKnowledgeFeedback(input: KnowledgeFeedback): Promise<void> {
  const { user, profile, state } = await getSessionContext();
  if (state !== "ready" || !user || !profile?.org_id) throw new Error("unauthorized");
  const db = await createClient();
  const { error } = await db.from("zi_knowledge_feedback").insert({
    organization_id: profile.org_id, user_id: user.id,
    question: input.question.slice(0, 1000), answer: input.answer.slice(0, 4000),
    article_ids: input.articleIds, route: input.route, module_id: input.moduleId,
    role: input.role, rating: input.rating, comment: input.comment?.slice(0, 1000) ?? null,
  });
  if (error) throw new Error(error.message);
}

export interface KnowledgeFeedbackRow {
  id: string; question: string; rating: string; comment: string | null;
  route: string | null; createdAt: string;
}

/** Recent feedback for the admin page (manager+ via RLS). */
export async function listKnowledgeFeedback(limit = 50): Promise<KnowledgeFeedbackRow[]> {
  const db = await createClient();
  const { data } = await db
    .from("zi_knowledge_feedback")
    .select("id,question,rating,comment,route,created_at")
    .order("created_at", { ascending: false }).limit(limit);
  return ((data as { id: string; question: string; rating: string; comment: string | null; route: string | null; created_at: string }[] | null) ?? [])
    .map((r) => ({ id: r.id, question: r.question, rating: r.rating, comment: r.comment, route: r.route, createdAt: r.created_at }));
}

/** Questions that got "not helpful" / "missing info" — the docs gap list. */
export async function listMissingAnswerQuestions(limit = 30): Promise<string[]> {
  const db = await createClient();
  const { data } = await db
    .from("zi_knowledge_feedback")
    .select("question,rating,created_at")
    .in("rating", ["not_helpful", "missing_info"])
    .order("created_at", { ascending: false }).limit(limit);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of (data as { question: string }[] | null) ?? []) {
    const q = r.question.trim();
    if (q && !seen.has(q)) { seen.add(q); out.push(q); }
  }
  return out;
}
