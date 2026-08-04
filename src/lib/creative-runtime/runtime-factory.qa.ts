/**
 * Runtime factory guard + wiring tests.
 *   npx tsx src/lib/creative-runtime/runtime-factory.qa.ts
 */
import { testRuntimeAllowed, resolveRuntimeMode, createTestRuntime, createCreativeRuntime, RuntimeGuardError } from "./runtime-factory";
import { PublishEligibilityError } from "../creative-studio/publishing-provider";

let passed = 0; const failures: string[] = [];
function ok(n: string, c: boolean) { if (c) passed++; else { failures.push(n); console.error("  x " + n); } }
async function throws(n: string, fn: () => unknown, kind?: new (...a: never[]) => Error) {
  try { await fn(); failures.push(n + " (no throw)"); console.error("  x " + n); }
  catch (e) { if (kind && !(e instanceof kind)) { failures.push(n + " wrong"); console.error("  x " + n); } else passed++; }
}

function testGuards() {
  ok("test allowed with flag only", testRuntimeAllowed({ ZONO_CREATIVE_TEST_RUNTIME: "true" }).allowed);
  ok("refused without flag", !testRuntimeAllowed({}).allowed);
  ok("refused in production", !testRuntimeAllowed({ ZONO_CREATIVE_TEST_RUNTIME: "true", NODE_ENV: "production" }).allowed);
  ok("refused with prod ref", !testRuntimeAllowed({ ZONO_CREATIVE_TEST_RUNTIME: "true", SUPABASE_PROJECT_REF: "tlrefajhyrqnjtmimaos" }).allowed);
  ok("refused with real openai key", !testRuntimeAllowed({ ZONO_CREATIVE_TEST_RUNTIME: "true", OPENAI_API_KEY: "sk-x" }).allowed);
  ok("refused with real publisher", !testRuntimeAllowed({ ZONO_CREATIVE_TEST_RUNTIME: "true", CREATIVE_PUBLISHING_PROVIDER: "meta" }).allowed);
  ok("mode=test when flag", resolveRuntimeMode({ ZONO_CREATIVE_TEST_RUNTIME: "true" }) === "test");
  ok("mode=production with prod ref", resolveRuntimeMode({ SUPABASE_PROJECT_REF: "prod-xyz" }) === "production");
  ok("mode=staging otherwise", resolveRuntimeMode({ NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co" }) === "staging");
}

async function testRuntimeEnforcesRules() {
  throws0(); // guard: createTestRuntime refuses when not allowed
  const rt = createTestRuntime({ ZONO_CREATIVE_TEST_RUNTIME: "true" });
  ok("test runtime built", rt.mode === "test" && !!rt.service && !!rt.storage);
  const ctx = { orgId: "orgA", userId: "uA" };
  const o = await rt.service.generate(ctx, { idempotencyKey: "k", contentItemId: "c", kind: "property_ad_post", prompt: "p" });
  ok("generate persists in test runtime", o.state === "review" && o.orgId === "orgA");
  // real rule still enforced: cannot publish before approval
  await throws("test runtime enforces publish eligibility", () => rt.service.publish(ctx, o.id, "instagram", "v"), PublishEligibilityError);
  // production path is not constructed here
  const prod = createCreativeRuntime({ SUPABASE_PROJECT_REF: "prod-abc" });
  ok("production path not constructed in-factory", (prod as { mode: string }).mode === "production" && !("service" in prod));
}
function throws0() {
  let threw = false; try { createTestRuntime({}); } catch (e) { threw = e instanceof RuntimeGuardError; }
  ok("createTestRuntime refuses when not allowed", threw);
}

async function main() {
  console.log("Creative-Studio — Runtime Factory Tests");
  testGuards();
  await testRuntimeEnforcesRules();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) { console.error("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL RUNTIME FACTORY TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
