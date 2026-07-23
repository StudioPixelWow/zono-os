// ============================================================================
// 🤖 ZONO — Copilot deterministic IDS (pure). Phase 1.
// ----------------------------------------------------------------------------
// A stable UUIDv5 derived from the canonical conversation ref, used as the
// `entity_id` for conversation-scoped rows in communication_summaries (whose
// entity_id is `uuid not null`, no FK). Same ref → same uuid across transports
// and across regenerations, so a summary can be replaced in place. Pure.
// ============================================================================
import crypto from "node:crypto";

// Fixed namespace for ZONO comm-copilot conversation summaries.
const COPILOT_NAMESPACE = "b9f0a5c2-7e3d-5a1b-9c4e-2f6a8d0b1c37";

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}
function bytesToUuid(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Deterministic UUIDv5 of a name within the copilot namespace. */
export function conversationRefToUuid(ref: string): string {
  const hash = crypto.createHash("sha1").update(Buffer.concat([uuidToBytes(COPILOT_NAMESPACE), Buffer.from(ref, "utf8")])).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122 variant
  return bytesToUuid(bytes);
}
