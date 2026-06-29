// ============================================================================
// 🔗 Evidence universe + context digest (pure). Phase 27.3.
// ----------------------------------------------------------------------------
// Derives the closed set of facts the model is allowed to cite from a
// ContextPackage: the digest fed into the prompt, and the universe of valid
// sources + entity ids used to validate the model's evidence afterwards.
// Deterministic. No AI, no DB.
// ============================================================================
import type { ContextPackage } from "@/lib/context-engine/types";

/** Compact, model-facing representation of the sanitized context. */
export function buildContextDigest(context: ContextPackage): string {
  return JSON.stringify({
    identity: context.identity,
    screen: context.screen,
    workflow: context.workflow,
    blocks: context.blocks.map((b) => ({
      key: b.key, label: b.label, priority: b.priority,
      confidence: b.confidence, source: b.source, data: b.data,
    })),
    permissions: { removedBlocks: context.permissions.removedBlocks, redactedFields: context.permissions.redactedFields },
    missing: context.explain.missing,
  });
}

function collectIds(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) { for (const v of value) collectIds(v, into); return; }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((/id$/i.test(k) || k.toLowerCase() === "id") && (typeof v === "string" || typeof v === "number")) {
        const s = String(v).trim();
        if (s) into.add(s);
      }
      collectIds(v, into);
    }
  }
}

export interface EvidenceUniverse {
  sources: Set<string>;
  entityIds: Set<string>;
  serialized: string;
}

/** The closed set of citable sources + ids, plus the serialized context for substring checks. */
export function buildEvidenceUniverse(context: ContextPackage): EvidenceUniverse {
  const sources = new Set<string>(["context", "request", "auth.session"]);
  for (const b of context.blocks) { sources.add(b.source); sources.add(b.key); }
  for (const r of context.explain.repositoriesUsed) sources.add(r);

  const entityIds = new Set<string>();
  if (context.identity.orgId) entityIds.add(context.identity.orgId);
  if (context.identity.userId) entityIds.add(context.identity.userId);
  if (context.request.entityId) entityIds.add(context.request.entityId);
  for (const b of context.blocks) collectIds(b.data, entityIds);

  return { sources, entityIds, serialized: JSON.stringify(context.blocks) };
}
