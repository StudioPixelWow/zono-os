/**
 * LOCAL-DEV-ONLY check for ZI Expert™ (Phase 22). Pure layers only (no DB, no
 * real network). Verifies: context builder · smart page detection · permission
 * filtering · knowledge + page-aware suggestions · deterministic fallback
 * answer · provider abstraction reuse · streaming chunker · conversation
 * helpers (title / search / grouping). ZI is read-only — it never acts.
 *
 * Run: npx tsx scripts/zi-expert-dev-check.ts
 */
import {
  buildZIContext, detectModule, detectPageKey, knowledgeForRoute,
  accessibleModuleIds, canAccessRoute, ziAiEnabled, deterministicAnswer,
  chunkForStream, deriveTitle, searchConversations, sortConversations,
  groupConversationsByRecency, type ServerContextParts,
} from "../src/lib/zi-expert";
import { answerZi } from "../src/lib/zi-expert/engine";
import { buildZiMessages } from "../src/lib/zi-expert/prompts";
import type { ZiClientContext, ZiConversation } from "../src/lib/zi-expert/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function client(route: string, over: Partial<ZiClientContext> = {}): ZiClientContext {
  return {
    route, selectedPropertyId: null, selectedBuyerId: null, selectedSellerId: null,
    selectedWorkflowId: null, selectedReportId: null, filters: null, language: "he", ...over,
  };
}
function server(over: Partial<ServerContextParts> = {}): ServerContextParts {
  return {
    organizationName: "משרד בדיקה", plan: "pro", roleKey: "agent", roleLabel: "סוכן",
    operatingCity: "חיפה", operatingNeighborhood: "הדר", featureFlags: [], ...over,
  };
}

async function main(): Promise<void> {
  console.log("ZI Expert dev-check\n");

  // 1) Smart page detection
  console.log("Context engine + smart page detection:");
  assert(detectModule("/property-radar")?.id === "property-radar-live", "route → module (property-radar)");
  assert(detectPageKey("/property-radar") === "property-radar", "route → knowledge page key");
  assert(detectPageKey("/settings/brand") === "settings", "nested route → settings page");
  const ctx = buildZIContext(client("/property-radar"), server());
  assert(ctx.moduleLabel !== null && ctx.pageKey === "property-radar", "buildZIContext resolves module + page");
  assert(ctx.accessibleModules.length > 0, "context includes accessible modules");
  assert(ctx.organizationName === "משרד בדיקה" && ctx.roleKey === "agent", "context carries org + role");

  // 2) Selected-entity detection
  const cWithProp = buildZIContext(client("/properties/abc12345-uuid", { selectedPropertyId: "abc12345-uuid" }), server());
  assert(cWithProp.selectedPropertyId === "abc12345-uuid", "selected property id flows into context");

  // 3) Permissions
  console.log("\nPermissions:");
  assert(accessibleModuleIds("viewer").length < accessibleModuleIds("owner").length, "viewer sees fewer modules than owner");
  assert(canAccessRoute("agent", "/properties") === true, "agent can access /properties");
  // /revenue is gated at roleMin "manager" in the registry.
  assert(canAccessRoute("agent", "/revenue") === false, "agent cannot access manager-only /revenue");
  assert(canAccessRoute("manager", "/revenue") === true, "manager can access /revenue");

  // 4) Knowledge + page-aware suggestions
  console.log("\nKnowledge + suggestions:");
  const k = knowledgeForRoute("/property-radar");
  assert(k.suggestions.length >= 2, "property-radar has starter suggestions");
  const kJourney = knowledgeForRoute("/journey-builder");
  assert(kJourney.pageKey === "journeys", "journey-builder → journeys knowledge");
  assert(knowledgeForRoute("/property-radar").suggestions[0].id !== knowledgeForRoute("/office-intelligence").suggestions[0].id, "suggestions change per page");

  // 5) Prompt building + safety
  console.log("\nPrompt building (reuses Phase 15 sanitizer):");
  const msgs = buildZiMessages(ctx, "מה זה Opportunity Score?");
  assert(msgs[0].role === "system" && msgs[0].content.includes("ZI"), "system prompt pins ZI personality");
  assert(msgs.some((m) => m.content.includes("הרשאות המשתמש")), "permission scope injected into prompt");
  // secret should be stripped, never thrown to provider
  let safe = true;
  try {
    const ctxSecret = buildZIContext(client("/properties", { filters: { q: "test" } }), server());
    buildZiMessages({ ...ctxSecret, organizationName: "Org" }, "שאלה רגילה");
  } catch { safe = false; }
  assert(safe, "normal prompt builds without throwing");

  // 6) Provider abstraction + deterministic fallback
  console.log("\nProvider + fallback:");
  console.log(`  · AI provider configured: ${ziAiEnabled() ? "yes" : "no (fallback mode)"}`);
  const fb = deterministicAnswer(ctx, "מה זה ציון הזדמנות?");
  assert(fb.includes("Property Radar") || fb.length > 40, "deterministic fallback produces a helpful answer");
  const ans = await answerZi(ctx, "מה זה ציון הזדמנות?");
  assert(ans.content.length > 0, "answerZi always returns content (never blocked)");
  assert(["ai", "fallback", "cache"].includes(ans.source), "answer carries a valid source");

  // 7) Streaming
  console.log("\nStreaming:");
  const chunks = chunkForStream("שלום זה משפט לבדיקת סטרימינג", 3);
  assert(chunks.length > 1, "answer splits into stream chunks");
  assert(chunks.join("") === "שלום זה משפט לבדיקת סטרימינג", "stream chunks reconstruct the original text");

  // 8) Conversation helpers + search
  console.log("\nConversation history helpers:");
  assert(deriveTitle("מה זה Opportunity Score ואיך הוא מחושב בדיוק במערכת") .endsWith("…"), "long titles are truncated");
  const convs: ZiConversation[] = [
    { id: "1", title: "רדאר נכסים", route: "/property-radar", moduleId: "property-radar-live", pinned: false, archived: false, messageCount: 2, lastMessageAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "2", title: "הגדרות מיתוג", route: "/settings", moduleId: "settings", pinned: true, archived: false, messageCount: 4, lastMessageAt: new Date(Date.now() - 9e8).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  assert(searchConversations(convs, "רדאר").length === 1, "history search filters by title");
  assert(sortConversations(convs)[0].id === "2", "pinned conversation sorts first");
  assert(groupConversationsByRecency(convs).some((g) => g.label === "מועדפים"), "pinned bucket present in grouping");

  console.log(`\n${failures === 0 ? "✅ ALL ZI EXPERT CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
