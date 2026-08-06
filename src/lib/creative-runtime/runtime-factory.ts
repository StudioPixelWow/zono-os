// ============================================================================
// ZONO — creative runtime dependency factory. One place decides which adapters
// back the SAME service interfaces in production / staging / test. The
// presentation layer never checks env directly. The deterministic TEST runtime
// (in-memory store + mocks + local storage) lets the real Next app + browser
// E2E run WITHOUT Docker — but it still enforces every real rule (org/role,
// approval, authorization, idempotency, optimistic locking, eligibility,
// lineage, usage). It is impossible to enable in production.
// ============================================================================
import { CreativeContentService } from "../content-orchestration/creative-content-service";
import type { ImageProviderLike } from "../content-orchestration/creative-content-service";
import { DbOrchestrationStore } from "../content-orchestration/supabase-orchestration-store";
import { InMemoryStoreClient } from "../content-orchestration/store-client";
import { MockPublishingProvider } from "../creative-studio/publishing-provider";
import { LocalPrivateStorage } from "../creative-studio/asset-storage";
import type { AssetStorage } from "../creative-studio/asset-storage";

export type RuntimeMode = "production" | "staging" | "test";

export interface RuntimeEnv {
  NODE_ENV?: string;
  ZONO_CREATIVE_TEST_RUNTIME?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_DB_URL?: string;
  SUPABASE_PROJECT_REF?: string;
  OPENAI_API_KEY?: string;
  CREATIVE_PUBLISHING_PROVIDER?: string;
}

const PROD_MARKERS = /prod|production|tlrefajhyrqnjtmimaos/i;

export class RuntimeGuardError extends Error {
  constructor(message: string) { super(message); this.name = "RuntimeGuardError"; }
}

/** True only when the deterministic test runtime is safe to enable. Pure. */
export function testRuntimeAllowed(env: RuntimeEnv): { allowed: boolean; reason: string } {
  if (env.ZONO_CREATIVE_TEST_RUNTIME !== "true") return { allowed: false, reason: "flag not set" };
  if (env.NODE_ENV === "production") return { allowed: false, reason: "NODE_ENV is production" };
  if (PROD_MARKERS.test(`${env.NEXT_PUBLIC_SUPABASE_URL ?? ""}${env.SUPABASE_DB_URL ?? ""}${env.SUPABASE_PROJECT_REF ?? ""}`))
    return { allowed: false, reason: "production project/db reference present" };
  if (env.OPENAI_API_KEY) return { allowed: false, reason: "real OpenAI provider selected" };
  if (env.CREATIVE_PUBLISHING_PROVIDER && env.CREATIVE_PUBLISHING_PROVIDER !== "mock")
    return { allowed: false, reason: "real publishing provider selected" };
  return { allowed: true, reason: "ok" };
}

export function resolveRuntimeMode(env: RuntimeEnv): RuntimeMode {
  if (env.ZONO_CREATIVE_TEST_RUNTIME === "true") return "test";
  if (PROD_MARKERS.test(`${env.SUPABASE_PROJECT_REF ?? ""}${env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`) || env.NODE_ENV === "production") return "production";
  return "staging";
}

export interface CreativeRuntime {
  mode: RuntimeMode;
  service: CreativeContentService;
  storage: AssetStorage;
}

const mockImage: ImageProviderLike = {
  name: "mock",
  async generate() { return { provider: "mock", model: "gpt-image-2", images: [{ b64: "AA==", mime: "image/png" }], durationMs: 0 }; },
};

/** Build the deterministic TEST runtime (no Docker, no server-only imports). */
export function createTestRuntime(env: RuntimeEnv): CreativeRuntime {
  const gate = testRuntimeAllowed(env);
  if (!gate.allowed) throw new RuntimeGuardError(`test runtime refused: ${gate.reason}`);
  const client = new InMemoryStoreClient();
  let n = 0;
  const service = new CreativeContentService({
    store: new DbOrchestrationStore(client),
    image: mockImage,
    publisher: new MockPublishingProvider(),
    ids: () => `o${++n}`,
    now: () => "2026-01-01T00:00:00.000Z",
  });
  return { mode: "test", service, storage: new LocalPrivateStorage("test-secret", () => 0) };
}

/**
 * Entry point. In test mode returns the in-memory runtime; production/staging
 * modes are wired by the server context (real Supabase store + storage) and are
 * intentionally NOT constructed here to keep this module server-only-free and
 * unit-testable. Callers in server context supply the real adapters.
 */
export function createCreativeRuntime(env: RuntimeEnv): CreativeRuntime | { mode: "production" | "staging" } {
  if (resolveRuntimeMode(env) === "test") return createTestRuntime(env);
  return { mode: resolveRuntimeMode(env) as "production" | "staging" };
}
