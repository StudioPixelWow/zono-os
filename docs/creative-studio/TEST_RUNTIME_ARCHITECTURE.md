# Creative Test Runtime — Architecture

## Purpose
Run the **real** ZONO Next.js app and the **real** `CreativeContentService` — with
generation, approval, publish eligibility, idempotency, optimistic locking,
lineage, usage logging and organization isolation all enforced — **without**
Supabase, OpenAI, Docker or any credential. This makes the Single Creative
Workspace, the Bulk Property Generator and the browser E2E buildable and
runnable locally.

## One factory, three modes
`src/lib/creative-runtime/runtime-factory.ts` is the single place that decides
which adapters back the same service interfaces:

| Mode | Store | Image | Publisher | Storage |
|------|-------|-------|-----------|---------|
| `production` | Supabase (server context) | OpenAI (gpt-image-2) | Meta/distribution | Supabase private bucket |
| `staging` | Supabase (server context) | OpenAI/mock | mock/real | Supabase |
| `test` | `InMemoryStoreClient` → `DbOrchestrationStore` | `MockImageProvider` | `MockPublishingProvider` | `LocalPrivateStorage` |

The presentation layer never reads `process.env` directly — it asks the factory.

## The guard (impossible to enable in production)
`testRuntimeAllowed(env)` returns `allowed` only when **all** hold:
- `ZONO_CREATIVE_TEST_RUNTIME === "true"` (explicit opt-in), and
- `NODE_ENV !== "production"`, and
- no production project/db reference present (`PROD_MARKERS = /prod|production|tlrefajhyrqnjtmimaos/i`), and
- no real `OPENAI_API_KEY`, and
- no real publishing provider (`CREATIVE_PUBLISHING_PROVIDER` unset or `mock`).

`createTestRuntime` calls the guard and throws `RuntimeGuardError` otherwise, so
even a mistaken import cannot construct a test runtime against real infrastructure.

## Boot without Supabase
`assertCoreEnv()` (run at server boot via `src/instrumentation.ts`) normally
fails fast if the three P0 Supabase variables are missing. It now returns early
**only** when `ZONO_CREATIVE_TEST_RUNTIME==="true"` **and** `NODE_ENV!=="production"`.
Production is unaffected: production sets `NODE_ENV=production`, and the bypass
still requires the explicit flag. This is the single, guarded change that lets the
app boot with in-memory stores + mock providers.

## Test auth + fixtures
`src/lib/creative-runtime/fixtures.ts` defines a deterministic two-organization
world (`ALPHA`, `BETA`) with owner/manager/agent/**inactive** users, resolved
brands, valid + invalid properties, and fresh + stale market stats.
`resolveTestSession(token)` maps a stable token
(`alpha-owner|alpha-agent|alpha-inactive|beta-owner|anonymous`) to a session.
The UI "logs in" by setting a cookie naming that token (`/creative-lab/session?as=…`).

## Lab runtime singleton
`src/lib/creative-runtime/lab-runtime.ts` holds one process-local guarded test
runtime plus an org-scoped registry of outputs, so the workspace can
list / approve / publish across server-action requests without a database.

## Flow logic is Next-free (and therefore executable headlessly)
`src/lib/creative-runtime/lab-flows.ts` contains all workspace/bulk logic with
**no** Next.js import. The server actions (`src/app/creative-lab/actions.ts`)
only read the session cookie and delegate here. Because the logic is Next-free,
`src/lib/creative-runtime/lab-flows.qa.ts` executes the identical
generation → approval → publish and bulk flows headlessly (36 assertions, no
browser, no Docker), giving deterministic proof of the same behavior the browser
E2E drives.
