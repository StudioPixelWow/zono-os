// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · INTERNAL reconcile+webhook health. Phase 3C.
// GET → global, secret-free reconciliation queue + webhook ingestion health.
// PROTECTED: Bearer CRON_SECRET only. No identifiers, tokens, or payloads.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { getReconcileQueueHealth } from "@/lib/meta/reconcile/service";
import { getWebhookHealth } from "@/lib/meta/webhooks/service";
import { evaluateWebhookHealth } from "@/lib/meta/reconcile/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const wh = await getWebhookHealth();
  const webhookHealth = evaluateWebhookHealth({ lastValidWebhookAgeMs: wh.lastValidAgeMs, invalidSignatureRate: wh.invalidSignatureRate, unmatchedBacklog: wh.unmatchedBacklog, failed: 0 });
  return NextResponse.json({ ok: true, reconcile: await getReconcileQueueHealth(null), webhook: { ...webhookHealth, ...wh } });
}
