/**
 * Test-runtime SECURITY guards — proves the deterministic test runtime can NEVER
 * activate in production, and that its in-memory/local adapters can never
 * silently become production adapters. Pure + executable (no Next server).
 *   npx tsx src/lib/creative-runtime/test-runtime-security.qa.ts
 */
import { testRuntimeAllowed, resolveRuntimeMode, createTestRuntime, createCreativeRuntime, RuntimeGuardError } from "./runtime-factory";
import { labEnabled } from "./lab-runtime";
import { assertCoreEnv } from "../env-validation";

let passed = 0; const failures: string[] = [];
function ok(n: string, c: boolean) { if (c) passed++; else { failures.push(n); console.error("  x " + n); } }
function throwsGuard(n: string, fn: () => unknown) {
  try { fn(); failures.push(n + " (no throw)"); console.error("  x " + n); }
  catch (e) { if (e instanceof RuntimeGuardError) passed++; else { failures.push(n + " wrong error"); console.error("  x " + n); } }
}

const CLEAN = { ZONO_CREATIVE_TEST_RUNTIME: "true" } as const;
// Each of these MUST defeat the test runtime.
const HOSTILE: Array<[string, Record<string, string>]> = [
  ["NODE_ENV=production", { ZONO_CREATIVE_TEST_RUNTIME: "true", NODE_ENV: "production" }],
  ["production project ref", { ZONO_CREATIVE_TEST_RUNTIME: "true", SUPABASE_PROJECT_REF: "tlrefajhyrqnjtmimaos" }],
  ["'prod' in supabase url", { ZONO_CREATIVE_TEST_RUNTIME: "true", NEXT_PUBLIC_SUPABASE_URL: "https://prod-x.supabase.co" }],
  ["production DB url", { ZONO_CREATIVE_TEST_RUNTIME: "true", SUPABASE_DB_URL: "postgres://prod-db/zono" }],
  ["real OpenAI key", { ZONO_CREATIVE_TEST_RUNTIME: "true", OPENAI_API_KEY: "sk-live-xxx" }],
  ["real publishing provider", { ZONO_CREATIVE_TEST_RUNTIME: "true", CREATIVE_PUBLISHING_PROVIDER: "meta" }],
  ["flag missing entirely", {}],
];

function main() {
  console.log("Creative-Studio — Test-Runtime Security Guards");

  // 1) the guard allows ONLY the clean, explicitly-flagged, non-production env.
  ok("clean flagged env is allowed", testRuntimeAllowed(CLEAN).allowed);
  for (const [label, env] of HOSTILE) ok(`refused: ${label}`, !testRuntimeAllowed(env).allowed);

  // 2) createTestRuntime THROWS a RuntimeGuardError for every hostile env.
  for (const [label, env] of HOSTILE) throwsGuard(`createTestRuntime refuses: ${label}`, () => createTestRuntime(env));

  // 3) fixture login routes / Alpha-Beta switching are gated by labEnabled(),
  //    which must be false for every hostile env and true only for the clean env.
  ok("labEnabled true only for clean env", labEnabled(CLEAN));
  for (const [label, env] of HOSTILE) ok(`labEnabled false: ${label}`, !labEnabled(env));

  // 4) production/staging mode does NOT construct the in-memory/local adapters —
  //    proving they can never silently replace the production persistence/storage.
  const prod = createCreativeRuntime({ SUPABASE_PROJECT_REF: "prod-abc" });
  ok("production mode resolves", (prod as { mode: string }).mode === "production");
  ok("production runtime has NO in-memory service", !("service" in prod));
  ok("production runtime has NO local storage", !("storage" in prod));
  ok("mode=production for NODE_ENV=production", resolveRuntimeMode({ NODE_ENV: "production" }) === "production");
  ok("mode=production for prod project ref", resolveRuntimeMode({ SUPABASE_PROJECT_REF: "prod-xyz" }) === "production");

  // 5) the boot-time env bypass (assertCoreEnv) is itself production-guarded:
  //    it may skip the P0 Supabase check ONLY when flagged AND non-production.
  const save = { ...process.env };
  const clearSupabase = () => { delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY; };
  try {
    // (a) flagged + non-production + no supabase → bypass (no throw)
    clearSupabase();
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.ZONO_CREATIVE_TEST_RUNTIME = "true";
    let threw = false; try { assertCoreEnv(); } catch { threw = true; }
    ok("assertCoreEnv bypass in flagged non-production", !threw);

    // (b) flagged BUT production → still enforces (throws)
    clearSupabase();
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.ZONO_CREATIVE_TEST_RUNTIME = "true";
    threw = false; try { assertCoreEnv(); } catch { threw = true; }
    ok("assertCoreEnv still enforces in production even with flag", threw);

    // (c) no flag + no supabase → enforces (throws)
    clearSupabase();
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.ZONO_CREATIVE_TEST_RUNTIME;
    threw = false; try { assertCoreEnv(); } catch { threw = true; }
    ok("assertCoreEnv enforces without the test flag", threw);
  } finally {
    // restore env
    for (const k of Object.keys(process.env)) if (!(k in save)) delete process.env[k];
    Object.assign(process.env, save);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) { console.error("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL TEST-RUNTIME SECURITY GUARD TESTS PASSED");
}
main();
