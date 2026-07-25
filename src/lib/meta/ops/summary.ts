// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · OPS SUMMARY (server-only).
// ----------------------------------------------------------------------------
// READ-ONLY aggregation for the Ops Console. Unions the EIGHT existing per-queue
// health readers into one uniform, secret-free row set, plus the existing safe
// dead-letter records (DeadLetterDTO — ids/reason/kind only, never a token,
// ciphertext, payload, or raw error) and the existing webhook-health snapshot.
// It opens NO store, runs NO claim, touches NO provider/graph, and performs NO
// mutation — it only reads the shipped health/dead-letter/webhook services.
// ============================================================================
import "server-only";
import { getQueueHealth, listDeadLetters } from "@/lib/meta/schedule/service";
import { getEngagementQueueHealth } from "@/lib/meta/engagement/service";
import { getInsightsQueueHealth } from "@/lib/meta/insights/service";
import { getInboxQueueHealth } from "@/lib/meta/inbox/service";
import { getIntelligenceQueueHealth } from "@/lib/meta/intelligence/service";
import { getListeningQueueHealth } from "@/lib/meta/listening/service";
import { getMessagingQueueHealth } from "@/lib/meta/messaging/service";
import { getReconcileQueueHealth } from "@/lib/meta/reconcile/service";
import { getWebhookHealth } from "@/lib/meta/webhooks/service";
import { computeQueueHealth, type QueueHealthSnapshot } from "@/lib/meta/schedule/queue-health";
import type { DeadLetterDTO } from "@/lib/meta/schedule/read";

export type OpsGrade = "healthy" | "degraded" | "unhealthy";

export interface OpsQueueRow {
  subsystem: string;
  grade: OpsGrade;
  backlog: number;
  inFlight: number;
  deadLetter: number;
  oldestDueMs: number | null;
}

export interface MetaOpsSummary {
  generatedAtIso: string;
  worstGrade: OpsGrade;
  totalBacklog: number;
  totalInFlight: number;
  totalDeadLetter: number;
  queues: readonly OpsQueueRow[];
  /** Safe dead-letter records for the durable publish queue (no auto-replay — manual redrive only). */
  deadLetters: readonly DeadLetterDTO[];
  webhook: { lastValidAgeMs: number | null; invalidSignatureRate: number; unmatchedBacklog: number };
}

/** Normalize the canonical 3-state grades (incl. reconcile's "critical") into one vocabulary. */
function normGrade(g: string): OpsGrade {
  if (g === "unhealthy" || g === "critical") return "unhealthy";
  if (g === "degraded") return "degraded";
  return "healthy";
}
function fromSnapshot(subsystem: string, s: QueueHealthSnapshot): OpsQueueRow {
  return { subsystem, grade: normGrade(s.grade), backlog: s.backlog, inFlight: s.inFlight, deadLetter: s.deadLetter, oldestDueMs: s.oldestDueMs };
}

const SEVERITY: Record<OpsGrade, number> = { healthy: 0, degraded: 1, unhealthy: 2 };

/** Aggregate all eight Meta queues + dead-letters + webhook health for `orgId` (RLS-scoped). */
export async function getMetaOpsSummary(orgId: string): Promise<MetaOpsSummary> {
  const [publish, engagement, insights, inbox, intelligence, listening, messaging, reconcile, deadLetters, webhook] = await Promise.all([
    getQueueHealth(orgId),
    getEngagementQueueHealth(orgId).then((c) => computeQueueHealth(c)),
    getInsightsQueueHealth(orgId).then((c) => computeQueueHealth(c)),
    getInboxQueueHealth(orgId).then((c) => computeQueueHealth(c)),
    getIntelligenceQueueHealth(orgId).then((c) => computeQueueHealth(c)),
    getListeningQueueHealth(orgId).then((c) => computeQueueHealth(c)),
    getMessagingQueueHealth(orgId).then((c) => computeQueueHealth(c)),
    getReconcileQueueHealth(orgId),
    listDeadLetters(orgId),
    getWebhookHealth(),
  ]);

  const queues: OpsQueueRow[] = [
    fromSnapshot("publish", publish),
    fromSnapshot("inbox", inbox),
    fromSnapshot("messaging", messaging),
    fromSnapshot("engagement", engagement),
    fromSnapshot("intelligence", intelligence),
    { subsystem: "reconcile", grade: normGrade(reconcile.grade), backlog: reconcile.backlog, inFlight: reconcile.inFlight, deadLetter: reconcile.deadLetter, oldestDueMs: null },
    fromSnapshot("insights", insights),
    fromSnapshot("listening", listening),
  ];

  const totalBacklog = queues.reduce((a, q) => a + q.backlog, 0);
  const totalInFlight = queues.reduce((a, q) => a + q.inFlight, 0);
  const totalDeadLetter = queues.reduce((a, q) => a + q.deadLetter, 0);
  const worstGrade = queues.reduce<OpsGrade>((w, q) => (SEVERITY[q.grade] > SEVERITY[w] ? q.grade : w), "healthy");

  return { generatedAtIso: new Date().toISOString(), worstGrade, totalBacklog, totalInFlight, totalDeadLetter, queues, deadLetters, webhook };
}
