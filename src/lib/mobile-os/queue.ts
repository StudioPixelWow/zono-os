// ============================================================================
// 📱 ZONO — Mobile OS — safe offline write queue (pure & deterministic). PHASE 57.0.
// Only APPROVED actions may be queued. Enqueue is idempotent (same key never
// duplicated → no duplicate storage / no double-write). When offline the flush
// plan is empty (hold); when online it returns the pending items to run. Failed
// items retry up to MAX_ATTEMPTS (sync recovery), then are held for manual review.
// No I/O — the client persists the array (e.g. localStorage) and runs the flush.
// ============================================================================
import { MAX_ATTEMPTS, type QueuedAction, type EnqueueResult, type QueueStats } from "./types";

export interface EnqueueInput {
  idempotencyKey: string;
  kind: string;
  label: string;
  approved: boolean;
  payload?: Record<string, unknown>;
  now?: string;
}

/** Enqueue an APPROVED action, idempotently. Unapproved actions are rejected. */
export function enqueue(queue: QueuedAction[], input: EnqueueInput): EnqueueResult {
  if (!input.approved) return { queue, added: false, reason: "פעולה לא מאושרת — לא נשמרת לתור לא-מקוון." };
  if (!input.idempotencyKey) return { queue, added: false, reason: "חסר מפתח ייחודי." };
  // Dedup: never queue the same idempotencyKey twice (unless the prior one failed permanently? still skip — no duplicate writes).
  if (queue.some((q) => q.idempotencyKey === input.idempotencyKey && q.status !== "done")) {
    return { queue, added: false, reason: "כבר קיים בתור — לא נוצרת כפילות." };
  }
  const action: QueuedAction = {
    id: `q_${input.idempotencyKey}`,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind, label: input.label, approved: true,
    payload: input.payload ?? {},
    createdAt: input.now ?? new Date().toISOString(),
    status: "queued", attempts: 0, error: null,
  };
  return { queue: [...queue, action], added: true, reason: null };
}

/** Items that still need to sync (queued, or failed but under the retry cap). */
export function pendingItems(queue: QueuedAction[]): QueuedAction[] {
  return queue.filter((q) => q.status === "queued" || (q.status === "failed" && q.attempts < MAX_ATTEMPTS));
}

/** What to flush now. Offline → hold (empty). Online → the pending items. */
export function flushPlan(queue: QueuedAction[], online: boolean): QueuedAction[] {
  return online ? pendingItems(queue) : [];
}

export function markSyncing(queue: QueuedAction[], id: string): QueuedAction[] {
  return queue.map((q) => (q.id === id ? { ...q, status: "syncing", attempts: q.attempts + 1, error: null } : q));
}
export function markDone(queue: QueuedAction[], id: string): QueuedAction[] {
  return queue.map((q) => (q.id === id ? { ...q, status: "done", error: null } : q));
}
export function markFailed(queue: QueuedAction[], id: string, error: string): QueuedAction[] {
  return queue.map((q) => (q.id === id ? { ...q, status: "failed", error } : q));
}

/** Remove synced items (keeps the queue small; never removes pending). */
export function prune(queue: QueuedAction[]): QueuedAction[] {
  return queue.filter((q) => q.status !== "done");
}

/** Items that exhausted retries and need manual attention. */
export function stuckItems(queue: QueuedAction[]): QueuedAction[] {
  return queue.filter((q) => q.status === "failed" && q.attempts >= MAX_ATTEMPTS);
}

export function stats(queue: QueuedAction[]): QueueStats {
  const by = (s: string) => queue.filter((q) => q.status === s).length;
  return { total: queue.length, queued: by("queued"), syncing: by("syncing"), done: by("done"), failed: by("failed"), pending: pendingItems(queue).length };
}
