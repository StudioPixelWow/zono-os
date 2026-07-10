// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context Assembler (server).
// THE single context assembler every reasoning call should use — so no screen
// builds its own AI context. Layers, in order:
//   1 current entity truth   2 recent timeline   3 graph relationships
//   4 active canonical memory 5 current recommendations 6 permission-safe docs
//   7 user/org preferences
// All reads are org/role/user scoped by the underlying services (RLS). For BROAD
// prompts confidential/restricted memory is dropped at render time. Best-effort —
// a failing layer never fails the whole assembly. (Batch 4.5 wires consumers to
// this; docs layer is intentionally minimal/omitted until a safe doc-fact source.)
// ============================================================================
import "server-only";
import { getEntityMemory, getOrgMemory, getUserMemory } from "@/lib/memory-canonical/read";
import { getEntityTimeline, getEntityRelationships } from "@/lib/activity/service";
import { getBrokerIntelligenceQueue } from "@/lib/broker-intelligence/aggregate-service";
import type { AssembledContext, CtxRelationship } from "./render";
import { renderContextText, hasContextSignal } from "./render";

const toCtxMem = (m: { fact: string; provenance: AssembledContext["memory"][number]["provenance"]; sensitivity: AssembledContext["memory"][number]["sensitivity"]; confidence: number }) =>
  ({ fact: m.fact, provenance: m.provenance, sensitivity: m.sensitivity, confidence: m.confidence });

export interface AssembleOptions {
  /** Drop confidential/restricted memory (org-wide / cross-broker prompts). */
  forBroadPrompt?: boolean;
  /** Include user/org preference memory (default true). */
  includePreferences?: boolean;
}

/** Assemble the canonical reasoning context for one entity. Never throws. */
export async function assembleEntityContext(entityType: string, entityId: string, opts: AssembleOptions = {}): Promise<AssembledContext> {
  const empty: AssembledContext = {
    entityType, entityId, truthLine: null, memory: [], orgPreferences: [], userPreferences: [],
    timeline: [], relationships: [], recommendations: [],
  };
  try {
    const [memory, orgPrefs, userPrefs, timeline, rels, queue] = await Promise.all([
      getEntityMemory(entityType, entityId).catch(() => []),
      opts.includePreferences === false ? Promise.resolve([]) : getOrgMemory({ memoryTypes: ["business_rule", "office_preference"] }).catch(() => []),
      opts.includePreferences === false ? Promise.resolve([]) : getUserMemory({ memoryTypes: ["broker_preference", "preference"] }).catch(() => []),
      getEntityTimeline(entityType, entityId, { limit: 8 }).catch(() => []),
      getEntityRelationships(entityType, entityId).catch(() => []),
      getBrokerIntelligenceQueue({ limit: 30 }).catch(() => ({ items: [] as { entityType: string; entityId: string; title: string; why: string }[] })),
    ]);

    const relationships: CtxRelationship[] = [];
    for (const r of rels as { source_entity_type: string; source_entity_id: string; target_entity_type: string; target_entity_id: string; relationship_type: string; status: string }[]) {
      if (r.status && r.status !== "active") continue;
      const isSource = r.source_entity_type === entityType && r.source_entity_id === entityId;
      const otherType = isSource ? r.target_entity_type : r.source_entity_type;
      const otherId = isSource ? r.target_entity_id : r.source_entity_id;
      relationships.push({ relationshipType: r.relationship_type, otherType, otherId });
    }

    const recommendations = (queue.items ?? [])
      .filter((i) => i.entityType === entityType && i.entityId === entityId)
      .slice(0, 5)
      .map((i) => ({ title: i.title, why: i.why }));

    // Layer 1 (truth): the highest-confidence explicit fact, as a one-liner.
    const truth = memory.find((m) => m.provenance === "explicit") ?? memory[0] ?? null;

    return {
      entityType, entityId,
      truthLine: truth ? truth.fact : null,
      truthSensitivity: truth ? truth.sensitivity : undefined,
      memory: memory.map(toCtxMem),
      orgPreferences: orgPrefs.map(toCtxMem),
      userPreferences: userPrefs.map(toCtxMem),
      timeline: (timeline as { title: string; occurred_at: string }[]).map((t) => ({ title: t.title, occurredAt: t.occurred_at })),
      relationships,
      recommendations,
    };
  } catch {
    return empty;
  }
}

/** Convenience: assemble + render the prompt-safe context text (or "" if empty). */
export async function assembleEntityContextText(entityType: string, entityId: string, opts: AssembleOptions = {}): Promise<string> {
  const ctx = await assembleEntityContext(entityType, entityId, opts);
  if (!hasContextSignal(ctx)) return "";
  return renderContextText(ctx, { forBroadPrompt: opts.forBroadPrompt });
}
