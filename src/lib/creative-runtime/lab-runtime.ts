// ============================================================================
// ZONO — creative "lab" runtime: a PROCESS-LOCAL singleton that backs the
// deterministic test-runtime UI (/creative-lab) and browser E2E. It wraps the
// guarded test runtime (in-memory store + mock providers + local storage) and
// keeps a lab-side org-scoped registry of outputs so the workspace can list /
// approve / publish across server-action requests WITHOUT Supabase.
//
// It is impossible to enable in production: getLabRuntime() delegates the guard
// to createTestRuntime(), which throws RuntimeGuardError unless the test flag is
// set and no production/real-provider references are present.
// ============================================================================
import { createTestRuntime, testRuntimeAllowed, type CreativeRuntime, type RuntimeEnv } from "./runtime-factory";
import type { OutputRecord } from "../content-orchestration/creative-content-service";

export interface LabRuntime {
  runtime: CreativeRuntime;
  /** Record (insert or replace) an output in the org-scoped registry. */
  record(rec: OutputRecord): void;
  /** Most-recent-first outputs for one organization. */
  list(orgId: string): OutputRecord[];
  /** Look up a single output by id within an org. */
  find(orgId: string, id: string): OutputRecord | undefined;
}

// Module-level singleton — one in-memory world for the running dev/test server.
let singleton: LabRuntime | null = null;

/** Read the lab-relevant environment from process.env (server context). */
export function labRuntimeEnv(): RuntimeEnv {
  return {
    ZONO_CREATIVE_TEST_RUNTIME: process.env.ZONO_CREATIVE_TEST_RUNTIME,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
    SUPABASE_PROJECT_REF: process.env.SUPABASE_PROJECT_REF,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CREATIVE_PUBLISHING_PROVIDER: process.env.CREATIVE_PUBLISHING_PROVIDER,
  };
}

/** True when the lab UI/routes may operate (delegates to the test-runtime guard). */
export function labEnabled(env: RuntimeEnv = labRuntimeEnv()): boolean {
  return testRuntimeAllowed(env).allowed;
}

/** Get (or lazily build) the process-local lab runtime. Throws if not allowed. */
export function getLabRuntime(env: RuntimeEnv = labRuntimeEnv()): LabRuntime {
  if (singleton) return singleton;
  const runtime = createTestRuntime(env); // RuntimeGuardError unless test-safe
  const byOrg = new Map<string, OutputRecord[]>();
  singleton = {
    runtime,
    record(rec: OutputRecord) {
      const arr = byOrg.get(rec.orgId) ?? [];
      const i = arr.findIndex((r) => r.id === rec.id);
      if (i >= 0) arr[i] = rec;
      else arr.unshift(rec);
      byOrg.set(rec.orgId, arr);
    },
    list(orgId: string) {
      return [...(byOrg.get(orgId) ?? [])];
    },
    find(orgId: string, id: string) {
      return (byOrg.get(orgId) ?? []).find((r) => r.id === id);
    },
  };
  return singleton;
}

/** Test-only reset hook (never used in server routes). */
export function __resetLabRuntimeForTests(): void { singleton = null; }
