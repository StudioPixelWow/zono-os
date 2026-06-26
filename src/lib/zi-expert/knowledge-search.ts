// ============================================================================
// ZI Expert™ Knowledge Engine — deterministic ranked search (Phase 23, PURE).
// Input: user question + current context. Output: best-matching articles,
// permission-filtered and page-aware (route/module boosted). No vector DB:
// transparent keyword + field-weighted scoring with route boosts.
// ============================================================================
import { ROLE_RANK } from "./permissions";
import type { RoleKey } from "./types";
import { buildArticleDoc, tokenize, type ArticleDoc } from "./knowledge-index";
import type { KnowledgeArticle, KnowledgeSearchHit } from "./knowledge-types";

export interface SearchContext {
  roleKey: RoleKey | null;
  moduleId: string | null;
  route: string | null;
}

const W = { title: 4, keyword: 3, summary: 1.6, body: 1, moduleBoost: 6, routeBoost: 5, exactPhrase: 4 };

function rank(role: RoleKey | null): number { return role ? ROLE_RANK[role] : ROLE_RANK.viewer; }

/** Can a role SEE this article? (role-gated knowledge filtering) */
export function canSeeArticle(role: RoleKey | null, article: KnowledgeArticle): boolean {
  return rank(role) >= ROLE_RANK[article.roleVisibility];
}

function routeMatches(article: KnowledgeArticle, route: string | null): boolean {
  if (!route) return false;
  return article.routes.some((r) => r !== "/" && (route === r || route.startsWith(r)));
}

function scoreDoc(doc: ArticleDoc, qTokens: string[], qPhrase: string, ctx: SearchContext): KnowledgeSearchHit | null {
  const a = doc.article;
  let score = 0;
  const matched: string[] = [];
  for (const t of qTokens) {
    if (doc.titleTokens.has(t)) { score += W.title; matched.push(t); }
    else if (doc.keywordTokens.has(t)) { score += W.keyword; matched.push(t); }
    else if (doc.summaryTokens.has(t)) { score += W.summary; matched.push(t); }
    else if (doc.bodyTokens.has(t)) { score += W.body; matched.push(t); }
  }
  // exact phrase appears in title/summary
  if (qPhrase.length >= 4 && (a.title.toLowerCase().includes(qPhrase) || a.summary.toLowerCase().includes(qPhrase))) {
    score += W.exactPhrase;
  }

  const reasons: string[] = [];
  // page-aware boosts (apply even with weak keyword overlap, so the current
  // page's article surfaces for "what does this mean?")
  if (ctx.moduleId && a.module === ctx.moduleId) { score += W.moduleBoost; reasons.push("מודול נוכחי"); }
  if (routeMatches(a, ctx.route)) { score += W.routeBoost; reasons.push("עמוד נוכחי"); }

  if (score <= 0) return null;
  if (matched.length) reasons.unshift(`מילים: ${[...new Set(matched)].slice(0, 4).join(", ")}`);
  return { article: a, score, matchedTerms: [...new Set(matched)], reason: reasons.join(" · ") || "התאמת תוכן" };
}

/**
 * Search the knowledge base. Permission-filters first, then ranks by weighted
 * keyword overlap + page-aware boosts. Deterministic and explainable.
 */
export function searchKnowledge(articles: KnowledgeArticle[], query: string, ctx: SearchContext, limit = 5): KnowledgeSearchHit[] {
  const visible = articles.filter((a) => a.published && canSeeArticle(ctx.roleKey, a));
  const docs = visible.map(buildArticleDoc);
  const q = query.trim().toLowerCase();
  const qTokens = tokenize(q);

  // With no usable query, fall back to the current page's article(s).
  if (qTokens.length === 0 && !ctx.moduleId && !ctx.route) return [];

  const hits = docs
    .map((d) => scoreDoc(d, qTokens, q, ctx))
    .filter((h): h is KnowledgeSearchHit => h !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return hits;
}
