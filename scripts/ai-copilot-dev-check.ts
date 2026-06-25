/**
 * LOCAL-DEV-ONLY check for the AI Copilot platform (Phase 15). Pure layers only
 * (no DB, no real network). Verifies: structured context built · sensitive data
 * filtered · prompt-cache key stability (cache works) · morning briefing builds
 * (+ cache key) · WhatsApp/email generation · provider abstraction · graceful
 * fallback. AI never replaces the deterministic engines.
 *
 * Run: npx tsx scripts/ai-copilot-dev-check.ts
 */
import {
  sanitizeContext, assertNoSecrets, buildMessages, buildCacheKey, computeDataHash,
  selectAiProvider, generateWithProvider, buildWhatsapp, buildEmail, WHATSAPP_LABEL, EMAIL_LABEL,
  buildMorningBrief, nextBestAction,
} from "../src/lib/ai-copilot";
import type { AiProvider, MorningBriefContext, SellerCallContext, WhatsappMessageType, EmailType } from "../src/lib/ai-copilot/types";

function sellerCtx(over: Partial<SellerCallContext> = {}): SellerCallContext {
  return {
    city: "חיפה", neighborhood: "הדר", addressText: "הרצל 1, חיפה", listingType: "private", price: 2_200_000,
    daysOnMarket: 65, priceDropCount: 2, buyerMatchCount: 3, sellerScore: 78, exclusiveProbability: 84,
    exclusiveBand: "high", recommendedAction: "call_today", recommendedActionReason: "נכס פרטי עם ביקוש",
    scoreReasons: ["נכס פרטי", "2 ירידות מחיר", "3 קונים מתאימים"], lifecycleStage: "contact_recommended",
    lastContactAt: null, contactSummary: null, ...over,
  };
}

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

async function main(): Promise<void> {
  console.log("ZONO AI Copilot dev-check\n");

  // 1) Structured context → messages (system + user), safe.
  const msgs = buildMessages("seller_call_brief", sellerCtx(), "בנה תדריך");
  assert(msgs.length === 2 && msgs[0]!.role === "system" && msgs[1]!.role === "user", "buildMessages → system + user");
  assert(msgs[1]!.content.includes("הרצל 1"), "structured context embedded in prompt");

  // 2) Sensitive data filtered.
  const dirty = { addressText: "הרצל 1", apiKey: "sk-secret123456789", token: "Bearer abcdefghijklmno", raw_metadata: { x: 1 }, note: "מפתח sk-leakedKEY1234567 בטקסט", nested: { service_role: "zzz" } };
  const clean = sanitizeContext(dirty) as Record<string, unknown>;
  assert(!("apiKey" in clean) && !("token" in clean) && !("raw_metadata" in clean), "secret keys stripped (apiKey/token/raw_metadata)");
  assert(!("service_role" in (clean.nested as Record<string, unknown>)), "nested secret keys stripped");
  assert(typeof clean.note === "string" && !(clean.note as string).includes("sk-leaked"), "secret-looking values redacted");
  let threw = false; try { assertNoSecrets("here is sk-abcdefghijklmnop key"); } catch { threw = true; }
  assert(threw, "assertNoSecrets throws on credential-like text");
  // buildMessages with a secret in context must NOT leak it.
  assert(!buildMessages("whatsapp", dirty, "x")[1]!.content.includes("sk-secret123456789"), "buildMessages never emits secrets");

  // 3) Prompt cache key stability (cache works) — same data ⇒ same key; change ⇒ new key.
  const c1 = sellerCtx(), c2 = sellerCtx();
  const h1 = computeDataHash(c1), h2 = computeDataHash(c2);
  assert(h1 === h2, "computeDataHash deterministic for identical context");
  assert(computeDataHash(sellerCtx({ price: 1_900_000 })) !== h1, "data hash changes when context changes (cache invalidation)");
  const k = buildCacheKey("seller_call_brief", "p1", h1);
  assert(k === buildCacheKey("seller_call_brief", "p1", h1) && k.includes("seller_call_brief"), "cache key stable + namespaced");

  // 4) Morning briefing builds + cache key.
  const mctx: MorningBriefContext = {
    topPriorities: [{ label: "הרצל 1", probability: 84, action: "call_today" }],
    hotOpportunities: [{ label: "ויצמן 5", probability: 92 }],
    totals: { profiles: 12, veryHigh: 2, high: 3, contactedToday: 1, signed: 0 }, pendingTasks: 4, completedYesterday: 2,
  };
  const mb = buildMorningBrief(mctx);
  assert(mb.fallback.includes("תדריך בוקר") && mb.fallback.includes("הרצל 1"), "morning brief fallback built");
  assert(buildCacheKey("morning_brief", null, computeDataHash(mctx)).includes("morning_brief"), "morning brief is cacheable (stable key)");

  // 5) WhatsApp + email generation (all types produce non-empty fallback).
  const waTypes = Object.keys(WHATSAPP_LABEL) as WhatsappMessageType[];
  assert(waTypes.every((t) => buildWhatsapp(t, "professional", sellerCtx()).fallback.trim().length > 10), `all ${waTypes.length} WhatsApp types generate a message`);
  assert(buildWhatsapp("price_drop", "urgent", sellerCtx()).fallback !== buildWhatsapp("hot_deal", "luxury", sellerCtx()).fallback, "different WhatsApp types produce different messages");
  const emTypes = Object.keys(EMAIL_LABEL) as EmailType[];
  assert(emTypes.every((t) => buildEmail(t, sellerCtx()).fallback.includes("נושא:")), `all ${emTypes.length} email types generate a subject+body`);

  // 6) Provider abstraction (no vendor lock-in).
  const savedO = process.env.OPENAI_API_KEY, savedA = process.env.ANTHROPIC_API_KEY, savedD = process.env.ZONO_AI_DISABLED;
  delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.ZONO_AI_DISABLED;
  assert(selectAiProvider() === null, "no env keys → no provider (deterministic fallback)");
  process.env.OPENAI_API_KEY = "sk-test";
  assert(selectAiProvider()?.name === "openai", "OPENAI_API_KEY → openai provider");
  delete process.env.OPENAI_API_KEY; process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  assert(selectAiProvider()?.name === "anthropic", "ANTHROPIC_API_KEY → anthropic provider");
  process.env.ZONO_AI_DISABLED = "1";
  assert(selectAiProvider() === null, "ZONO_AI_DISABLED=1 → provider disabled");
  // restore
  if (savedO === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedO;
  if (savedA === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedA;
  if (savedD === undefined) delete process.env.ZONO_AI_DISABLED; else process.env.ZONO_AI_DISABLED = savedD;

  // 7) Graceful fallback + AI path via injected provider.
  const req = { kind: "whatsapp" as const, entityId: "p1", dataHash: h1, cacheKey: k, messages: buildMessages("whatsapp", c1, "x"), fallback: "FALLBACK TEXT" };
  const nullRes = await generateWithProvider(req, null);
  assert(nullRes.source === "fallback" && nullRes.content === "FALLBACK TEXT", "no provider → deterministic fallback");
  const okProvider: AiProvider = { name: "stub", model: "stub-1", complete: async () => "AI GENERATED TEXT" };
  const okRes = await generateWithProvider(req, okProvider);
  assert(okRes.source === "ai" && okRes.content === "AI GENERATED TEXT" && okRes.model === "stub-1", "provider success → ai content");
  const badProvider: AiProvider = { name: "boom", model: "x", complete: async () => { throw new Error("provider down"); } };
  const fbRes = await generateWithProvider(req, badProvider);
  assert(fbRes.source === "fallback" && fbRes.content === "FALLBACK TEXT", "provider failure → graceful fallback (workflow never blocked)");
  const emptyProvider: AiProvider = { name: "empty", model: "x", complete: async () => "   " };
  assert((await generateWithProvider(req, emptyProvider)).source === "fallback", "empty AI response → fallback");

  // 8) NBA mapped from deterministic recommendation (AI never decides matches).
  assert(nextBestAction(sellerCtx({ recommendedAction: "send_whatsapp", buyerMatchCount: 0, lifecycleStage: "contacted" })).kind === "whatsapp", "NBA maps deterministic action (whatsapp)");
  assert(nextBestAction(sellerCtx({ recommendedAction: "call_today", buyerMatchCount: 3, lifecycleStage: "new_opportunity" })).kind === "invite_buyer", "NBA augments with invite_buyer on buyer demand (still deterministic)");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
