// ============================================================================
// 📱 ZONO — Mobile App & Native Field OS — types (pure, client-safe). PHASE 57.0.
// Makes ZONO installable + field-ready WITHOUT rebuilding the app. The core is a
// SAFE offline write queue: only APPROVED actions may be queued offline, and they
// flush idempotently when connectivity returns (no duplicate writes). Plus PWA
// manifest, GPS route handoff, and a mock-safe push architecture. This module
// never performs I/O and never bypasses an approval gate.
// ============================================================================

export const MOBILE_OS_VERSION = "57.0";

export type QueueStatus = "queued" | "syncing" | "done" | "failed";

/** A pending offline action. It references an approved mutation — it never holds
 *  the mutation logic itself, and it is queued ONLY when already approved. */
export interface QueuedAction {
  id: string;
  idempotencyKey: string;   // dedup key — the same key is never queued twice
  kind: string;             // e.g. "mark_visit_done", "mark_post_published"
  label: string;
  approved: boolean;        // MUST be true to enqueue (safety)
  payload: Record<string, unknown>;
  createdAt: string;
  status: QueueStatus;
  attempts: number;
  error: string | null;
}

export interface EnqueueResult { queue: QueuedAction[]; added: boolean; reason: string | null }

export const MAX_ATTEMPTS = 5;
export const QUEUE_STORAGE_KEY = "zono-offline-queue-v1";

export interface QueueStats { total: number; queued: number; syncing: number; done: number; failed: number; pending: number }

// ── PWA / capabilities ────────────────────────────────────────────────────────
export interface RouteStop { address?: string | null; lat?: number | null; lng?: number | null; label?: string | null }

export interface MobileCapability { key: string; label: string; requires: string; reuse: string }

export interface PushMock { supported: boolean; subscribed: boolean; endpointMock: string | null; note: string }

export const OFFLINE_NOTE =
  "פעולות שאושרו נשמרות מקומית כשאתה לא מקוון ומסתנכרנות אוטומטית כשחוזר החיבור. פעולות שלא אושרו לא נשמרות ולא מבוצעות. אין כפילויות — כל פעולה מסתנכרנת פעם אחת בלבד.";
