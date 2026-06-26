// ============================================================================
// ZI Expert™ Knowledge Engine — index/tokenization (Phase 23, PURE).
// Deterministic text normalization used by the search engine. No external
// vector DB: we build a simple, explainable token corpus per article.
// ============================================================================
import type { KnowledgeArticle } from "./knowledge-types";

const STOP = new Set([
  "של", "עם", "על", "את", "כל", "הוא", "היא", "זה", "זו", "מה", "איך", "למה", "מתי", "איפה", "יש", "אין",
  "the", "a", "an", "of", "to", "is", "are", "and", "or", "in", "on", "for", "how", "what", "why", "where", "do", "does",
]);

/** Normalize + tokenize Hebrew/English text into meaningful terms. Pure. */
export function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^א-תa-z0-9\s]/g, " ") // keep Hebrew letters, latin, digits
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

export interface ArticleDoc {
  article: KnowledgeArticle;
  titleTokens: Set<string>;
  keywordTokens: Set<string>;
  summaryTokens: Set<string>;
  bodyTokens: Set<string>;
}

/** Build a searchable doc for one article (token sets per field). Pure. */
export function buildArticleDoc(article: KnowledgeArticle): ArticleDoc {
  return {
    article,
    titleTokens: new Set(tokenize(article.title)),
    keywordTokens: new Set(article.keywords.flatMap((k) => tokenize(k))),
    summaryTokens: new Set(tokenize(article.summary)),
    bodyTokens: new Set(tokenize(`${article.content} ${article.category}`)),
  };
}

export function buildIndex(articles: KnowledgeArticle[]): ArticleDoc[] {
  return articles.map(buildArticleDoc);
}

/** Split an article body into retrievable chunks by "## " headings. Pure. */
export function chunkContent(content: string): { ordinal: number; heading: string | null; content: string }[] {
  const out: { ordinal: number; heading: string | null; content: string }[] = [];
  const sections = content.split(/\n(?=## )/);
  let ordinal = 0;
  for (const sec of sections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;
    const m = /^##\s+(.+)/.exec(trimmed);
    const heading = m ? m[1].trim() : null;
    const body = m ? trimmed.replace(/^##\s+.+\n?/, "").trim() : trimmed;
    if (!body) continue;
    out.push({ ordinal: ordinal++, heading, content: body });
  }
  return out;
}
