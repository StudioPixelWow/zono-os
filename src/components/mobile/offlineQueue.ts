"use client";
// ============================================================================
// 📱 ZONO — offline queue client store. PHASE 57.0.
// localStorage-backed store using the PURE mobile-os queue logic. Only APPROVED
// actions are enqueued. On reconnect, pending items whose kind has a registered
// processor are flushed idempotently; unregistered kinds stay pending until the
// relevant screen is open. Nothing here bypasses an approval gate.
// ============================================================================
import {
  enqueue, flushPlan, markSyncing, markDone, markFailed, stats,
  QUEUE_STORAGE_KEY, type QueuedAction, type QueueStats,
} from "@/lib/mobile-os";

type Processor = (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
const processors = new Map<string, Processor>();

/** Register how a queued action `kind` is replayed when connectivity returns. */
export function registerOfflineProcessor(kind: string, fn: Processor): void { processors.set(kind, fn); }

function load(): QueuedAction[] {
  try { const raw = localStorage.getItem(QUEUE_STORAGE_KEY); return raw ? (JSON.parse(raw) as QueuedAction[]) : []; }
  catch { return []; }
}
function save(q: QueuedAction[]): void {
  try { localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(q)); } catch { /* quota / private mode */ }
}

/** Enqueue an APPROVED action for offline replay. Returns whether it was added. */
export function enqueueApprovedOffline(input: { idempotencyKey: string; kind: string; label: string; payload?: Record<string, unknown> }): { added: boolean; reason: string | null } {
  const r = enqueue(load(), { ...input, approved: true });
  if (r.added) { save(r.queue); notify(); }
  return { added: r.added, reason: r.reason };
}

export function getQueueStats(): QueueStats { return stats(load()); }

/** Flush pending items (idempotent). Call on reconnect. */
export async function flushOfflineQueue(online: boolean): Promise<{ synced: number; failed: number }> {
  let q = load();
  const plan = flushPlan(q, online).filter((it) => processors.has(it.kind));
  let synced = 0, failed = 0;
  for (const item of plan) {
    q = markSyncing(q, item.id); save(q);
    try {
      const res = await processors.get(item.kind)!(item.payload);
      if (res.ok) { q = markDone(q, item.id); synced++; }
      else { q = markFailed(q, item.id, res.error ?? "failed"); failed++; }
    } catch (e) {
      q = markFailed(q, item.id, e instanceof Error ? e.message : "error"); failed++;
    }
    save(q);
  }
  notify();
  return { synced, failed };
}

// Lightweight change signal for UI badges.
function notify() { try { window.dispatchEvent(new Event("zono:offline-queue-changed")); } catch { /* ignore */ } }
