// ============================================================================
// 📱 ZONO — Mobile App & Native Field OS — barrel. PHASE 57.0.
// PWA installability + offline read cache + SAFE offline write queue (approved-
// only, idempotent) + GPS handoff + mock-safe push. Reuses Voice AI, Field Ops,
// document/media upload and notifications — it does not rebuild the app.
// ============================================================================
export {
  MOBILE_OS_VERSION, MAX_ATTEMPTS, QUEUE_STORAGE_KEY, OFFLINE_NOTE,
  type QueuedAction, type QueueStatus, type QueueStats, type EnqueueResult,
  type RouteStop, type MobileCapability, type PushMock,
} from "./types";
export { enqueue, pendingItems, flushPlan, markSyncing, markDone, markFailed, prune, stuckItems, stats } from "./queue";
export { buildManifest, MOBILE_VIEWPORT, buildRouteUrl, CAPABILITIES, pushMock } from "./pwa";
export { runSelfCheck } from "./qa";
