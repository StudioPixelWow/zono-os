// ============================================================================
// POST /api/extension/facebook/capture-interaction  (P4.2)
// Authenticated by extension instance (same instance-secret model as the other
// extension routes). The human-confirmed capture of a Facebook interaction on a
// post the extension published. ZONO resolves ALL attribution + tenancy server-
// side and writes exactly one idempotent social_interactions row. It does NOT
// create leads or emit events — scoring/review/conversion stay in their existing
// review-gated pipeline. Dark by default (SOCIAL_INTERACTION_INGEST_ENABLED).
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { authInstance } from "@/lib/distribution/extension-service";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimiter } from "@/lib/platform/rate-limit/rate-limit";
import { ingestSocialInteraction, SOCIAL_INTERACTION_INGEST_ENABLED } from "@/lib/social/ingest";

export async function POST(req: NextRequest) {
  // Dark by default — hide existence when disabled.
  if (!SOCIAL_INTERACTION_INGEST_ENABLED) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Instance-secret auth (reuse). org is derived from the instance, never the client.
  const inst = await authInstance(req.headers.get("x-zono-instance-id"), req.headers.get("x-zono-extension-secret"));
  if (!inst) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // Rate limit per instance.
  const rl = rateLimiter.check("sync", inst.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil(rl.retryAfterMs / 1000))) } },
    );
  }

  // Parse + shape-check the untrusted body.
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const db = createServiceRoleClient();
  let outcome: Awaited<ReturnType<typeof ingestSocialInteraction>>;
  try {
    outcome = await ingestSocialInteraction(body as Record<string, unknown>, {
      db, orgId: inst.orgId, actorId: inst.userId, instanceId: inst.id,
    });
  } catch {
    // db timeout / unexpected — consistent 500.
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 500 });
  }

  if (!outcome.ok) {
    const status = outcome.error === "db_error" ? 500 : 400;
    return NextResponse.json({ ok: false, error: outcome.error }, { status });
  }
  return NextResponse.json({ ok: true, ...outcome.result });
}
