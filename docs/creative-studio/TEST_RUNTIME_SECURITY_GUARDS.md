# Test-Runtime Security Guards

Automated negative suite: `src/lib/creative-runtime/test-runtime-security.qa.ts`
— **31 assertions, 0 failed**. Proves the deterministic test runtime can never
activate in production and its adapters can never silently replace production ones.

## Production guard (must all defeat the test runtime)
For each hostile environment the suite asserts three things at once:
`testRuntimeAllowed()` is **false**, `createTestRuntime()` **throws
`RuntimeGuardError`**, and `labEnabled()` (which gates the whole `/creative-lab`
route tree, the fixture-login route, and Alpha/Beta switching) is **false**:

- `NODE_ENV=production`
- production Supabase project reference present (`SUPABASE_PROJECT_REF`)
- `prod` marker in the Supabase URL
- production DB URL present (`SUPABASE_DB_URL`)
- real OpenAI provider selected (`OPENAI_API_KEY`)
- real publishing provider selected (`CREATIVE_PUBLISHING_PROVIDER != mock`)
- the test flag missing entirely

Only the single clean, explicitly-flagged, non-production env
(`ZONO_CREATIVE_TEST_RUNTIME=true`, nothing else) is allowed.

## Fixture-route exposure
Because `labEnabled()` is false in every hostile env, the layout calls
`notFound()` and the `/creative-lab/session` login route returns 404 — so fixture
login and Alpha/Beta switching are **unreachable** outside the test runtime.

## Adapter-selection proof
`createCreativeRuntime()` in production/staging mode returns a bare
`{ mode }` object with **no `service` and no `storage`** — the in-memory
`DbOrchestrationStore(InMemoryStoreClient)` and `LocalPrivateStorage` are **never
constructed** in those modes. This proves in-memory persistence and local storage
cannot accidentally become the production persistence/storage adapters.

## Boot bypass is itself guarded
`assertCoreEnv()` (Supabase P0 env check at server boot) skips **only** when
`ZONO_CREATIVE_TEST_RUNTIME=true` **and** `NODE_ENV!==production`. The suite
asserts:
- flagged + non-production + no Supabase → bypass (no throw);
- flagged **but** production → still throws (enforced);
- no flag + no Supabase → still throws (enforced).

**Result: test-runtime security certified by automated negative tests (31/0).**
