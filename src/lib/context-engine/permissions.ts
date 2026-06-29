// ============================================================================
// 🛡️ Context Permission Engine — strips private data before context leaves the
// engine (pure, deterministic). Respects the viewer's role. No AI, no DB.
// ----------------------------------------------------------------------------
// Two layers: (1) manager-only blocks are removed for non-managers; (2) private
// field keys are deep-stripped from every payload. Nothing is fabricated — we
// only ever REMOVE. The set of removals is reported in ContextPermissions.
// ============================================================================
import type { ContextBlock, ContextIdentity, ContextPermissions } from "./types";

/** Field names never exposed in a context package (privacy by default). */
export const PRIVATE_FIELD_KEYS = new Set<string>([
  "phone", "phone_number", "mobile", "email", "email_address",
  "password", "token", "secret", "api_key", "ssn", "national_id",
  "owner_id", "user_id", "created_by", "auth_id",
]);

function deepRedact(value: unknown, redacted: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => deepRedact(v, redacted));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PRIVATE_FIELD_KEYS.has(k)) { redacted.add(k); continue; }
      out[k] = deepRedact(v, redacted);
    }
    return out;
  }
  return value;
}

/**
 * Apply permissions to a list of blocks for a given viewer. Deterministic:
 * same blocks + identity → same output. Returns the filtered blocks plus a
 * record of what was removed/redacted.
 */
export function applyPermissions(
  blocks: ContextBlock[],
  identity: ContextIdentity,
): { blocks: ContextBlock[]; permissions: ContextPermissions } {
  const removedBlocks: string[] = [];
  const redacted = new Set<string>();

  const kept = blocks.filter((b) => {
    if (b.managerOnly && !identity.isManager) { removedBlocks.push(b.key); return false; }
    return true;
  });

  const safe = kept.map((b) => ({ ...b, data: deepRedact(b.data, redacted) }));

  return {
    blocks: safe,
    permissions: {
      isManager: identity.isManager,
      removedBlocks,
      redactedFields: [...redacted].sort(),
    },
  };
}
