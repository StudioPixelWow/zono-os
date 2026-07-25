// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING NORMALIZATION (PURE). Phase 6.
// ----------------------------------------------------------------------------
// Folds a canonical (already-sealed) gateway message into a canonical MessageRecord
// + a content fingerprint (dedup). The Graph shape is normalized BELOW this by the
// sealed gateway; this module speaks only the provider-neutral CanonicalMessage
// contract. The body is carried in memory for the store to ENCRYPT — it is never
// logged and never persisted in plaintext. Deterministic + pure (drives QA).
// ============================================================================
import { MESSAGE_BODY_MAX, type MessageRecord, type MessageDirection, type SafeAttachment } from "./domain";

export interface CanonicalMessage {
  externalMessageId: string;
  direction: string;                   // inbound | outbound (validated here)
  senderExternalId: string | null;
  body: string;
  attachments: readonly { kind: string; hasMedia: boolean }[];
  providerCreatedAt: string | null;
}
export interface CanonicalConversation {
  externalThreadId: string;
  participantExternalId: string | null;
  participantDisplay: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
}

const clip = (s: string, n: number) => { const c = (s ?? "").replace(/\r/g, "").trim(); return c.length > n ? c.slice(0, n - 1) + "…" : c; };
const safeAttachments = (a: readonly { kind: string; hasMedia: boolean }[]): SafeAttachment[] => (a ?? []).slice(0, 8).map((x) => ({ kind: String(x.kind ?? "unknown").slice(0, 32), hasMedia: !!x.hasMedia }));

/** FNV-1a content fingerprint (dedup) — no crypto, no ambient (pure). */
export function messageFingerprint(m: Pick<MessageRecord, "externalMessageId" | "body" | "providerCreatedAt">): string {
  const s = `${m.externalMessageId}␟${m.body}␟${m.providerCreatedAt ?? ""}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function normalizeMessage(m: CanonicalMessage): MessageRecord {
  const direction: MessageDirection = m.direction === "outbound" ? "outbound" : "inbound";
  return { externalMessageId: String(m.externalMessageId), direction, senderExternalId: m.senderExternalId ? String(m.senderExternalId) : null, body: clip(m.body ?? "", MESSAGE_BODY_MAX), attachmentsSafe: safeAttachments(m.attachments), providerCreatedAt: m.providerCreatedAt ?? null };
}

/** A short, NON-sensitive placeholder preview for the inbox projection (no body text). */
export const safeInboxPlaceholder = (participant: string | null) => `הודעה חדשה${participant ? ` · ${participant}` : ""}`;
