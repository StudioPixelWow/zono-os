// ============================================================================
// 🔌 ZONO — Platform API™ & Integration Hub — barrel. 31.0.
// Secure, approval-gated access to the existing engines (read-only + gated
// actions). No engine modified; no business logic duplicated; nothing auto-runs.
// ============================================================================
export { ENDPOINTS, findEndpoint, hasScope, withinRateLimit } from "./registry";
export { buildOpenApi } from "./openapi";
export { buildWebhookPayload, canonicalPayload } from "./webhook-payload";
export { CONNECTORS, findConnector } from "./connectors";
export { runSelfCheck } from "./qa";
export * from "./types";
