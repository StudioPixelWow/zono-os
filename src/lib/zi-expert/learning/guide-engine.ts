// ZI Learning — guide engine (Phase 25, PURE). Unified search across the
// built-in learning content (glossary / faq / tutorials / walkthroughs) and a
// step-by-step formatter. Knowledge-base hits are merged by the server action
// (the Knowledge Engine needs DB articles); this stays pure over built-ins.
import type { RoleKey } from "../types";
import { ROLE_RANK } from "../permissions";
import { GLOSSARY, searchGlossary } from "./glossary";
import { FAQ, searchFaq } from "./faq";
import { TUTORIALS } from "./tutorials";
import { WALKTHROUGHS, walkthroughAsSteps, walkthroughBySlug } from "./walkthrough";
import type { LearningSearchHit } from "./types";

const NORM = (s: string) => s.toLowerCase().normalize("NFKC");
const snip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Search across all built-in learning content for the role. Deterministic. */
export function searchLearning(query: string, role: RoleKey | null, limit = 12): LearningSearchHit[] {
  const rank = role ? ROLE_RANK[role] : ROLE_RANK.viewer;
  const q = NORM(query.trim());
  if (!q) return [];
  const hits: LearningSearchHit[] = [];

  for (const g of searchGlossary(query, 6)) {
    hits.push({ kind: "glossary", slug: g.slug, title: g.term, snippet: snip(g.definition), module: null, score: 40 });
  }
  for (const f of searchFaq(query, role ?? "viewer", 6)) {
    hits.push({ kind: "faq", slug: f.slug, title: f.question, snippet: snip(f.answer), module: f.module, score: 38 });
  }
  for (const t of TUTORIALS) {
    if (ROLE_RANK[t.roleMin] > rank) continue;
    const hay = NORM(`${t.title} ${t.summary}`);
    if (hay.includes(q)) hits.push({ kind: "tutorial", slug: t.slug, title: t.title, snippet: snip(t.summary), module: t.module, score: 34 });
  }
  for (const w of WALKTHROUGHS) {
    if (ROLE_RANK[w.roleMin] > rank) continue;
    const hay = NORM(`${w.title} ${w.goal}`);
    if (hay.includes(q)) hits.push({ kind: "walkthrough", slug: w.slug, title: w.title, snippet: snip(w.goal), module: w.module, score: 36 });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** "Show me step by step" — return the best walkthrough rendered as steps. */
export function stepByStepFor(moduleId: string | null, slug?: string | null): string | null {
  const w = (slug && walkthroughBySlug(slug)) || WALKTHROUGHS.find((x) => x.module === moduleId) || null;
  return w ? walkthroughAsSteps(w) : null;
}

export const allGlossary = () => GLOSSARY;
export const allFaq = () => FAQ;
