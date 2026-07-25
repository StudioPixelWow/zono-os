// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · WORKER ORCHESTRATION.
// ----------------------------------------------------------------------------
// A STATELESS, server-only fan-out over the EXISTING per-subsystem tick services.
// It owns no queue state: every tick already claims (SKIP-LOCKED), leases,
// retries, and dead-letters internally, so double-invocation is safe (a second
// tick claims nothing already leased). This module NEVER touches provider/graph,
// never opens a store, never runs a claim RPC, and never talks to a model — it
// only invokes run*DispatchTick / run*RecoveryTick and aggregates their results.
// One failing tick is isolated and does not abort the rest of the group.
// ============================================================================
import "server-only";
import { runDispatchTick, runRecoveryTick } from "@/lib/meta/schedule/service";
import { runInboxDispatchTick, runInboxRecoveryTick } from "@/lib/meta/inbox/service";
import { runMessagingDispatchTick, runMessagingRecoveryTick } from "@/lib/meta/messaging/service";
import { runCommentDispatchTick, runCommentRecoveryTick } from "@/lib/meta/engagement/service";
import { runIntelligenceDispatchTick, runIntelligenceRecoveryTick } from "@/lib/meta/intelligence/service";
import { runReconcileDispatchTick, runReconcileRecoveryTick } from "@/lib/meta/reconcile/service";
import { runInsightDispatchTick, runInsightRecoveryTick } from "@/lib/meta/insights/service";
import { runListeningDispatchTick, runListeningRecoveryTick } from "@/lib/meta/listening/service";
import { DISPATCH_GROUPS, ALL_DISPATCH_SUBSYSTEMS, type DispatchGroup } from "./groups";

type Tick = () => Promise<unknown>;

// subsystem → its EXISTING dispatch tick service (no reimplementation).
const DISPATCH: Readonly<Record<string, Tick>> = {
  publish: () => runDispatchTick(),
  inbox: () => runInboxDispatchTick(),
  messaging: () => runMessagingDispatchTick(),
  engagement: () => runCommentDispatchTick(),
  intelligence: () => runIntelligenceDispatchTick(),
  reconcile: () => runReconcileDispatchTick(),
  insights: () => runInsightDispatchTick(),
  listening: () => runListeningDispatchTick(),
};

// subsystem → its EXISTING recovery tick service.
const RECOVER: Readonly<Record<string, Tick>> = {
  publish: () => runRecoveryTick(),
  inbox: () => runInboxRecoveryTick(),
  messaging: () => runMessagingRecoveryTick(),
  engagement: () => runCommentRecoveryTick(),
  intelligence: () => runIntelligenceRecoveryTick(),
  reconcile: () => runReconcileRecoveryTick(),
  insights: () => runInsightRecoveryTick(),
  listening: () => runListeningRecoveryTick(),
};

export interface TickRunResult { subsystem: string; ok: boolean; result?: unknown; error?: string }
export interface GroupRunResult { group: string; ran: readonly TickRunResult[] }

async function runAll(group: string, subsystems: readonly string[], table: Readonly<Record<string, Tick>>): Promise<GroupRunResult> {
  const ran: TickRunResult[] = [];
  for (const s of subsystems) {
    const tick = table[s];
    if (!tick) { ran.push({ subsystem: s, ok: false, error: "unknown_subsystem" }); continue; }
    try { ran.push({ subsystem: s, ok: true, result: await tick() }); }
    catch (e) { ran.push({ subsystem: s, ok: false, error: e instanceof Error ? e.message : "tick_failed" }); }
  }
  return { group, ran };
}

/** Fan out one dispatch group to the existing per-subsystem tick services. */
export async function runDispatchGroup(group: DispatchGroup): Promise<GroupRunResult> {
  return runAll(`dispatch-${group}`, DISPATCH_GROUPS[group], DISPATCH);
}

/** Fan out recovery across all eight durable Meta queues. */
export async function runRecoverAll(): Promise<GroupRunResult> {
  return runAll("recover-all", ALL_DISPATCH_SUBSYSTEMS, RECOVER);
}
