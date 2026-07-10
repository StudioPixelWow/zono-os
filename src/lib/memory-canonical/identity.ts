// ============================================================================
// 🔑 ZONO OS 2.0 — Stage 4 · Batch 4.4 · Canonical AI Memory · identity (PURE).
// A deterministic identity key per memory DIMENSION — org + scope + subject +
// memory_type + normalized_fact_key. All values of the same dimension (e.g. all
// "budget" values for a buyer) share one identity, so the newest supersedes the
// prior under the "one active per identity" unique index. Also normalizes facts
// for replay/reinforce detection. Pure + deterministic + offline-testable.
// ============================================================================
import { createHash } from "crypto";
import type { MemoryOpIntent } from "./types";

/** Normalize a fact string for equality checks (lower/trim/collapse/strip niqqud). */
export function normalizeFact(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .replace(/[֑-ׇ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The stable identity key (uuid-shaped, deterministic) for a memory dimension.
 * The subject is the user (user scope), the entity (entity scope), or the org.
 */
export function memoryIdentityKey(orgId: string, intent: MemoryOpIntent): string {
  const subject =
    intent.scope === "user" ? `user:${intent.userId ?? ""}`
    : intent.scope === "entity" ? `entity:${intent.entityType ?? ""}:${intent.entityId ?? ""}`
    : intent.scope === "conversation" ? `conv:${intent.entityId ?? ""}`
    : "org";
  const seed = [orgId, intent.scope, subject, intent.memoryType, intent.normalizedFactKey].join("|");
  const h = createHash("md5").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
