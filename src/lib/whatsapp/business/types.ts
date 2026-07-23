// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS PLATFORM OS — canonical types.
//
// The per-org WhatsApp Business connection layer. These types describe the
// OAuth/WABA connection and outbound message inputs. They do NOT redefine the
// conversation/message model — that stays the canonical Communication OS model
// (whatsapp_conversations / whatsapp_messages). Token ciphertext never appears
// in any browser-facing type.
// ============================================================================

/** Part 1 — the connection lifecycle states. */
export type WaConnectionStatus =
  | "connected"
  | "disconnected"
  | "expired"
  | "revoked"
  | "permission_missing"
  | "pending_number"      // WABA connected but no live phone number registered yet
  | "syncing";

export const WA_LIVE_STATUSES: readonly WaConnectionStatus[] = ["connected", "syncing"] as const;

export type WaHealth = "healthy" | "needs_reconnect" | "permission_missing" | "pending_number" | "not_connected" | "syncing";

/** Server-side connection record (token is ENCRYPTED; never sent to a browser). */
export interface WaConnection {
  id: string;
  orgId: string;
  status: WaConnectionStatus;
  businessId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  scopes: string[];
  accessTokenEncrypted: string | null;
  tokenExpiresAt: string | null;
  lastValidatedAt: string | null;
  metadata: Record<string, unknown>;
}

/** Browser-safe projection — NO token fields. */
export interface WaConnectionPublic {
  connected: boolean;
  status: WaConnectionStatus;
  health: WaHealth;
  businessId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  scopes: string[];
  lastValidatedAt: string | null;
  lastWebhookAt: string | null;
  lastMessageAt: string | null;
}

// ── OAuth ───────────────────────────────────────────────────────────────────
export interface WaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
  configId: string;        // Facebook Login for Business / Embedded Signup config id
  configured: boolean;
  enabled: boolean;
  ready: boolean;
  missing: string[];
}

/** The scopes a WhatsApp Business connection needs (least privilege). */
export const WA_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"] as const;

// ── WABA / phone discovery ────────────────────────────────────────────────────
export interface WabaSummary {
  id: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
}

export interface WaPhoneNumber {
  id: string;                     // phone_number_id
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  platformType: string | null;
}

// ── Templates ─────────────────────────────────────────────────────────────────
export interface WaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;                 // APPROVED | PENDING | REJECTED
  category: string | null;
  variableCount: number;          // number of {{n}} body placeholders
}

// ── Outbound message inputs ───────────────────────────────────────────────────
export type WaMediaKind = "image" | "document" | "video" | "audio";

export interface WaButton { id: string; title: string }
export interface WaListRow { id: string; title: string; description?: string }
export interface WaListSection { title: string; rows: WaListRow[] }

export type WaSendResult = { ok: true; messageId: string } | { ok: false; error: string; type?: string };

export type WaErrorType = "auth_expired" | "revoked" | "permission" | "rate_limit" | "invalid" | "network" | "unknown";
