/**
 * LOCAL-DEV-ONLY check for the ZI Knowledge Engine (Phase 23). Pure layers only
 * (no DB, no network). Verifies: built-in articles + no duplicate slugs · article
 * search works · route-aware search boosts the correct module · permission
 * filtering (role-gated) · unknown question → honest fallback · answers cite
 * knowledge sources internally · chunking is deterministic.
 *
 * Run: npx tsx scripts/zi-knowledge-dev-check.ts
 */
import {
  BUILTIN_ARTICLES, builtinSlugs, searchKnowledge, canSeeArticle, deterministicRagAnswer,
  ragSources, RAG_FALLBACK, chunkContent,
} from "../src/lib/zi-expert";
import type { KnowledgeArticle } from "../src/lib/zi-expert/knowledge-types";
import type { ZiContext } from "../src/lib/zi-expert/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

/** Built-in seeds → runtime articles with ids (mirrors the repository fallback). */
const ARTICLES: KnowledgeArticle[] = BUILTIN_ARTICLES.map((a, i) => ({ ...a, id: `builtin-${a.slug}-${i}` }));

function ctx(over: Partial<ZiContext> = {}): ZiContext {
  return {
    route: null, moduleId: null, moduleLabel: null, moduleDescription: null, pageKey: null,
    organizationName: null, plan: null, roleKey: "agent", roleLabel: null, language: "he",
    selectedPropertyId: null, selectedBuyerId: null, selectedSellerId: null, selectedWorkflowId: null,
    selectedReportId: null, filters: null, operatingCity: null, operatingNeighborhood: null,
    featureFlags: [], accessibleModules: [], ...over,
  };
}

function main(): void {
  console.log("ZI Knowledge dev-check\n");

  // 1) Built-in base + idempotent shape (no duplicate slugs).
  console.log("Built-in knowledge:");
  const slugs = builtinSlugs();
  assert(slugs.length >= 15, `built-in articles seeded (${slugs.length})`);
  assert(new Set(slugs).size === slugs.length, "no duplicate slugs");
  for (const m of ["property-radar", "buyer-matching", "office-intelligence", "platform-admin", "maps", "cron-sync"]) {
    assert(slugs.includes(m), `article exists: ${m}`);
  }

  // 2) Search works.
  console.log("\nSearch:");
  const r1 = searchKnowledge(ARTICLES, "מה זה Opportunity Score?", { roleKey: "agent", moduleId: null, route: null });
  assert(r1.length > 0 && r1[0].article.slug === "property-radar", "keyword search finds Opportunity Score → property-radar");
  const r2 = searchKnowledge(ARTICLES, "התאמת קונים", { roleKey: "agent", moduleId: null, route: null });
  assert(r2.some((h) => h.article.slug === "buyer-matching"), "search finds buyer-matching");

  // 3) Route-aware boost.
  console.log("\nRoute-aware:");
  const onRadar = searchKnowledge(ARTICLES, "מה המסך הזה?", { roleKey: "agent", moduleId: "property-radar-live", route: "/property-radar" });
  assert(onRadar.length > 0 && onRadar[0].article.slug === "property-radar", "current page boosts its article to the top");
  const onSettings = searchKnowledge(ARTICLES, "מה המסך הזה?", { roleKey: "agent", moduleId: "settings", route: "/settings/brand" });
  assert(onSettings.length > 0 && onSettings[0].article.slug === "settings", "nested route boosts settings article");

  // 4) Permission filtering.
  console.log("\nPermissions:");
  const platform = ARTICLES.find((a) => a.slug === "platform-admin")!;
  assert(canSeeArticle("owner", platform) && !canSeeArticle("agent", platform), "agent cannot see owner-only Platform Admin");
  const office = ARTICLES.find((a) => a.slug === "office-intelligence")!;
  assert(!canSeeArticle("agent", office) && canSeeArticle("manager", office), "agent cannot see manager-only Office Intelligence");
  const agentResults = searchKnowledge(ARTICLES, "platform admin feature flag", { roleKey: "agent", moduleId: null, route: null });
  assert(!agentResults.some((h) => h.article.slug === "platform-admin"), "platform-admin filtered out for an agent");

  // 5) Unknown question → honest fallback + sources.
  console.log("\nFallback + sources:");
  const empty = searchKnowledge(ARTICLES, "xyzqwerty nonexistent topic 9999", { roleKey: "agent", moduleId: null, route: null });
  assert(empty.length === 0, "irrelevant query returns no hits");
  assert(deterministicRagAnswer(ctx(), empty).startsWith(RAG_FALLBACK), "no hits → honest fallback line");
  assert(ragSources(r1).length > 0 && ragSources(r1)[0].slug === "property-radar", "answer cites knowledge sources internally");

  // 6) Chunking is deterministic.
  console.log("\nChunking:");
  const art = ARTICLES.find((a) => a.slug === "property-radar")!;
  const c1 = chunkContent(art.content);
  const c2 = chunkContent(art.content);
  assert(c1.length > 1 && c1.length === c2.length, "article splits into stable chunks");
  assert(c1.every((c) => c.content.length > 0), "no empty chunks");

  console.log(`\n${failures === 0 ? "✅ ALL ZI KNOWLEDGE CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
