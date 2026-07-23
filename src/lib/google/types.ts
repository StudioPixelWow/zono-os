// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — canonical types.
//
// The single source of truth for the Google integration shapes. No logic here,
// no secrets — just the model every google/* module and the Integration Center
// share. Token ciphertext never appears in any browser-facing type.
// ============================================================================

/** Part 1 — the connection lifecycle states (exactly the spec's six). */
export type GoogleConnectionStatus =
  | "connected"
  | "disconnected"
  | "expired"
  | "revoked"
  | "permission_missing"
  | "syncing";

/** The connection states that permit live API calls. */
export const LIVE_GOOGLE_STATUSES: readonly GoogleConnectionStatus[] = ["connected", "syncing"] as const;

/** Server-side connection record (tokens are ENCRYPTED; never sent to a browser). */
export interface GoogleConnection {
  id: string;
  orgId: string;
  userId: string;
  googleSub: string | null;
  email: string | null;
  displayName: string | null;
  scopes: string[];
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: string | null;
  status: GoogleConnectionStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  metadata: Record<string, unknown>;
}

/** The browser-safe projection of a connection — NO token fields at all. */
export interface GoogleConnectionPublic {
  connected: boolean;
  status: GoogleConnectionStatus;
  email: string | null;
  displayName: string | null;
  scopes: string[];
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  health: GoogleHealth;
}

/** Part 1 — derived health for the Integration Center card. */
export type GoogleHealth = "healthy" | "needs_reconnect" | "permission_missing" | "not_connected" | "syncing";

// ── OAuth ───────────────────────────────────────────────────────────────────
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  configured: boolean;   // all env present
  enabled: boolean;      // operator flipped GOOGLE_OAUTH_ENABLED=true
  ready: boolean;        // configured && enabled — the only state we redirect to Google
  missing: string[];
}

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number | null;
  scope: string | null;
  idToken: string | null;
}

export interface GoogleUserInfo {
  sub: string;
  email: string | null;
  name: string | null;
}

// ── Calendar (Part 2) ─────────────────────────────────────────────────────────
export interface GoogleCalendarSummary {
  id: string;
  summary: string;
  primary: boolean;
  timeZone: string | null;
  accessRole: string | null;
  selected: boolean;
}

export interface GoogleAttendee {
  email: string;
  displayName: string | null;
  responseStatus: string | null;
  organizer: boolean;
}

/** A Google Calendar event in canonical google-layer shape. `meetLink` is the
 *  hangoutLink when present — NEVER fabricated. */
export interface GoogleEvent {
  id: string;
  calendarId: string;
  iCalUID: string | null;
  etag: string | null;
  status: string | null;              // confirmed | tentative | cancelled
  summary: string | null;
  description: string | null;
  location: string | null;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  attendees: GoogleAttendee[];
  recurrence: string[] | null;        // RRULE lines (verbatim)
  recurringEventId: string | null;
  meetLink: string | null;            // hangoutLink (Google Meet)
  reminders: GoogleReminder[] | null;
  updated: string | null;
  htmlLink: string | null;
}

export interface GoogleEventDateTime {
  dateTime: string | null;            // RFC3339 with offset when timed
  date: string | null;                // yyyy-mm-dd when all-day
  timeZone: string | null;
}

export interface GoogleReminder {
  method: string;                     // "email" | "popup"
  minutes: number;
}

/** Input to create/update an event — the caller supplies FACTS only. */
export interface GoogleEventInput {
  summary: string;
  description?: string | null;
  location?: string | null;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  attendees?: { email: string; displayName?: string | null }[];
  recurrence?: string[] | null;       // RRULE lines
  reminders?: GoogleReminder[] | null;
  /** When true, request a Google Meet link be created (Part 5). */
  addMeet?: boolean;
  /** Internal reference stored in extendedProperties.private for round-trip. */
  internalRef?: string | null;
}

// ── Gmail (Part 3) — maps into Communication OS, never a new email model ──────
/** Attachment METADATA only (per spec) — no bytes. */
export interface GmailAttachmentMeta {
  id: string;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: { name: string | null; address: string | null };
  to: string[];
  cc: string[];
  subject: string | null;
  snippet: string | null;
  sentAt: string;
  unread: boolean;
  outbound: boolean;                  // sent by the connected account
  attachments: GmailAttachmentMeta[];
}

export interface GmailThread {
  id: string;
  subject: string | null;
  from: { name: string | null; address: string | null };
  participants: string[];
  lastAt: string;
  unread: number;
  snippet: string | null;
  messageCount: number;
}

// ── Contacts (Part 4) — read-only ─────────────────────────────────────────────
export interface GoogleContact {
  resourceName: string;
  displayName: string | null;
  emails: string[];
  phones: string[];
  organization: string | null;
}

// ── Sync (Part 6) ─────────────────────────────────────────────────────────────
export type SyncOutcome = "ok" | "full_resync" | "auth_error" | "permission_missing" | "error";

export interface SyncResult {
  outcome: SyncOutcome;
  calendarId: string;
  imported: number;
  updated: number;
  deleted: number;
  duplicatesSkipped: number;
  conflicts: number;
  nextSyncToken: string | null;
  error: string | null;
}

/** A typed error reason mirrored from the provider (mirrors the Meta pattern). */
export type GoogleErrorType = "auth_expired" | "revoked" | "permission" | "rate_limit" | "gone" | "network" | "unknown";
