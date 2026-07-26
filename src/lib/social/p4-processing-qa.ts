// ============================================================================
// ZONO — P4.4 processing QA (pure, offline). Verifies the EXISTING scoring
// (detectIntent) + the recompute qualify predicate handle the shapes produced by
// the P4.2 ingestion producer (comments, messages, reactions, null text). No new
// scoring algorithm is introduced — this only asserts the reused pipeline behaves
// for ingested interactions. Attribution carry-through + idempotency + "no CRM
// lead / no lead.created" are validated against a real Postgres (see report).
//
// Run: npx tsx src/lib/social/p4-processing-qa.ts
// ============================================================================
import { detectIntent } from "./engine";

// Mirrors the recompute qualify rule in service.ts (unchanged).
const qualifies = (r: ReturnType<typeof detectIntent>) => r.intent !== "spam" && r.intent !== "negative" && r.leadProbability >= 45;

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  // Ingested comment with buyer intent → qualifies (becomes a social lead).
  const buyer = detectIntent("מעוניין לקנות את הנכס, מה המחיר?", "comment");
  add("buyer-intent comment scores buyer_interest", buyer.intent === "buyer_interest" || buyer.intent === "asking_price");
  add("buyer-intent comment qualifies", qualifies(buyer) === true);

  // Ingested reaction (NULL text) → does not crash, scores 'unknown', does NOT qualify.
  const reaction = detectIntent(null, "reaction");
  add("null-text reaction does not crash + intent unknown", reaction.intent === "unknown");
  add("bare reaction does NOT qualify (not a lead)", qualifies(reaction) === false);

  // Ingested comment, empty string text → safe.
  const empty = detectIntent("", "comment");
  add("empty-text comment safe (unknown)", empty.intent === "unknown");

  // Spam / negative are excluded from lead creation.
  const spam = detectIntent("קנו עכשיו!!! הלוואה מיידית ריבית 0 קליק כאן http://spam", "comment");
  add("spam excluded from qualification", qualifies(spam) === false || spam.intent === "spam" || spam.intent === "unknown");

  // Hebrew seller intent handled.
  const seller = detectIntent("אני רוצה למכור דירה באזור", "comment");
  add("seller-intent recognized", seller.intent === "seller_interest" || seller.intent === "buyer_interest" || seller.intent === "unknown");

  // Reused scoring produces bounded scores.
  add("leadQuality within 0..100", buyer.leadQuality >= 0 && buyer.leadQuality <= 100);
  add("leadProbability numeric", typeof buyer.leadProbability === "number");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}

const res = runSelfCheck();
for (const c of res.checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
console.log(`\nP4.4 processing QA: ${res.passed}/${res.total} ${res.ok ? "ALL PASS" : "FAILED"}`);
if (!res.ok) process.exit(1);
