// ============================================================================
// 🔌 ZONO — Platform API™ & Integration Hub — types (pure). 31.0.
// ----------------------------------------------------------------------------
// ONE secure API layer that makes ZONO an integration platform. It EXPOSES the
// existing engines read-only and via approval-gated actions — it never implements
// business logic itself (the gateway dispatches to the existing services). API
// keys + scopes + rate limits + audit guard every call; actions remain approval-
// gated (created missions/drafts/workflows are themselves gated); nothing auto-
// executes. No engine modified. Evidence-only.
// ============================================================================
export const PLATFORM_API_VERSION = "31.0";
export const API_BASE = "/api/platform/v1";

// ── Part 5 — scopes ─────────────────────────────────────────────────────────
export type Scope =
  | "read:buyers" | "read:sellers" | "read:leads" | "read:properties" | "read:offices"
  | "read:missions" | "read:workflows" | "read:ai"
  | "ask:zono" | "action:mission" | "action:draft" | "action:workflow"
  | "admin:webhooks" | "admin:keys" | "*";
export const ALL_SCOPES: Scope[] = [
  "read:buyers", "read:sellers", "read:leads", "read:properties", "read:offices",
  "read:missions", "read:workflows", "read:ai", "ask:zono",
  "action:mission", "action:draft", "action:workflow", "admin:webhooks", "admin:keys",
];
export const SCOPE_HE: Record<string, string> = {
  "read:buyers": "קריאת קונים", "read:sellers": "קריאת מוכרים", "read:leads": "קריאת לידים", "read:properties": "קריאת נכסים",
  "read:offices": "קריאת משרדים", "read:missions": "קריאת משימות", "read:workflows": "קריאת תהליכים", "read:ai": "קריאת מודיעין AI",
  "ask:zono": "שאילת Ask ZONO", "action:mission": "יצירת משימה (לאישור)", "action:draft": "יצירת טיוטה (לאישור)", "action:workflow": "הפעלת תהליך (לאישור)",
  "admin:webhooks": "ניהול Webhooks", "admin:keys": "ניהול מפתחות", "*": "גישה מלאה",
};

// ── Part 1/2/3 — endpoint registry (drives dispatch + OpenAPI) ──────────────
export type HttpMethod = "GET" | "POST";
export type EndpointKind = "read" | "action" | "ai";
export interface EndpointSpec {
  id: string; method: HttpMethod; path: string;      // path under API_BASE, e.g. "/buyers"
  scope: Scope; kind: EndpointKind; summary: string;
  approvalGated: boolean;                             // action endpoints create approval-gated artifacts
  params?: { name: string; in: "query" | "body"; required: boolean; description: string }[];
}

// ── Part 5 — API key ────────────────────────────────────────────────────────
export type KeyType = "personal" | "organization";
export interface ApiKeyRecord {
  id: string; organizationId: string | null; name: string; type: KeyType;
  scopes: Scope[]; rateLimitPerMin: number;
  prefix: string;                                     // public prefix (shown), e.g. "zk_ab12cd"
  lastUsedAt: string | null; createdAt: string; revokedAt: string | null;
}
export interface CreatedApiKey extends ApiKeyRecord { plaintext: string }  // shown ONCE

// ── Part 4 — webhooks ───────────────────────────────────────────────────────
export type WebhookEvent =
  | "mission.created" | "workflow.completed" | "buyer.changed" | "seller.changed"
  | "lead.changed" | "listing.changed" | "draft.approved" | "mission.approved";
export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "mission.created", "workflow.completed", "buyer.changed", "seller.changed",
  "lead.changed", "listing.changed", "draft.approved", "mission.approved",
];
export interface WebhookRecord {
  id: string; organizationId: string | null; url: string; events: WebhookEvent[];
  active: boolean; createdAt: string; lastDeliveryAt: string | null; lastStatus: number | null;
}
export interface WebhookPayload {
  id: string; event: WebhookEvent; at: string; organizationId: string | null; data: Record<string, unknown>;
}

// ── Part 5 — audit ──────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string; keyId: string | null; keyName: string | null; method: string; path: string;
  scope: string | null; status: number; at: string; ip: string | null;
}

// ── Part 6 — integration hub connector ──────────────────────────────────────
export type ConnectorId = "google" | "microsoft" | "whatsapp" | "slack" | "meta" | "crm" | "automation";
export interface Connector {
  id: ConnectorId; name: string; category: string; description: string;
  capabilities: string[]; authType: "oauth" | "api_key" | "webhook"; status: "available" | "beta" | "planned";
}

// ── Gateway result envelope ─────────────────────────────────────────────────
export interface ApiError { error: string; code: string; status: number }
export interface ApiOk<T = unknown> { ok: true; data: T; meta: { version: string; approvalGated?: boolean } }
export type ApiResult<T = unknown> = ApiOk<T> | (ApiError & { ok: false });
