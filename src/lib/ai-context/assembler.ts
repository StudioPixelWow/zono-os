// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context Assembler (server).
// THE single, mode-driven, permission-safe context assembler every reasoning
// call uses — so no screen builds its own AI context. Fixed layer order:
//   1 truth  2 timeline  3 graph  4 memory  5 recommendations  6 preferences
//   7 documents (metadata only; full legal text never in broad contexts)
// A ContextMode chooses which layers to include, the memory sensitivity ceiling,
// per-layer hard caps, and whether user-private memory is allowed (executive
// NEVER; public_site drops everything but public-safe truth). Each layer is
// independently best-effort — one failing layer is recorded in diagnostics and
// never breaks the assembly (truth always returns). Structured provenance is
// preserved for "למה?" + stale detection. Deterministic ordering.
// ============================================================================
import "server-only";
import { getEntityMemory, getOrgMemory, getUserMemory, type MemoryView } from "@/lib/memory-canonical/read";
import { getEntityTimeline, getEntityRelationships } from "@/lib/activity/service";
import { getBrokerIntelligenceQueue } from "@/lib/broker-intelligence/aggregate-service";
import { modePolicy, sensitivityAllowed, type ContextMode } from "./modes";
import type { AssembledContext, CtxRelationship, ProvenanceItem, ContextDiagnostics } from "./render";
import { renderContextText, hasContextSignal } from "./render";

export interface ContextRequest {
  mode: ContextMode;
  // Entity is optional: when present → entity-scoped context (cockpits/Ask); when
  // absent → GLOBAL context (Broker Brain / Daily / Executive) — org memory +
  // org-wide recommendations, no entity truth/graph. ONE assembler, both shapes.
  entityType?: string;
  entityId?: string;
}

const capMem = (m: MemoryView) => ({ fact: m.fact, provenance: m.provenance, sensitivity: m.sensitivity, confidence: m.confidence });

/** Assemble the canonical reasoning context under a mode. Never throws. */
export async function assembleEntityContext(req: ContextRequest): Promise<AssembledContext> {
  const { mode } = req;
  const isEntity = !!(req.entityType && req.entityId);
  const entityType = req.entityType ?? "org";
  const entityId = req.entityId ?? "*";
  const pol = modePolicy(mode);
  const provenance: ProvenanceItem[] = [];
  const diag: ContextDiagnostics = { failedLayers: [], truncated: {} };

  const empty: AssembledContext = {
    entityType, entityId, mode, provenance, diagnostics: diag,
    truthLine: null, memory: [], orgPreferences: [], userPreferences: [],
    timeline: [], relationships: [], recommendations: [],
  };

  // Each layer resolves independently; a rejection is recorded, never thrown.
  const settle = async <T>(layer: string, on: boolean, fn: () => Promise<T>, fallback: T): Promise<T> => {
    if (!on) return fallback;
    try { return await fn(); } catch { diag.failedLayers.push(layer); return fallback; }
  };
  const cap = <T>(layer: string, arr: T[], n: number): T[] => {
    if (arr.length > n) diag.truncated[layer] = arr.length - n;
    return arr.slice(0, n);
  };

  const [memRaw, orgRaw, userRaw, tlRaw, relRaw, queue] = await Promise.all([
    // Memory layer: entity memory for a cockpit; org memory for a global surface.
    settle("memory", pol.includeMemory,
      () => isEntity
        ? getEntityMemory(entityType, entityId, { maxSensitivity: pol.sensitivityCeiling })
        : getOrgMemory({ maxSensitivity: pol.sensitivityCeiling, limit: pol.caps.memory + 8 }),
      [] as MemoryView[]),
    settle("preferences", pol.includePreferences, () => getOrgMemory({ memoryTypes: ["business_rule", "office_preference"], maxSensitivity: pol.sensitivityCeiling }), [] as MemoryView[]),
    settle("preferences", pol.includePreferences && pol.includeUserPrivate, () => getUserMemory({ memoryTypes: ["broker_preference", "preference"], maxSensitivity: pol.sensitivityCeiling }), [] as MemoryView[]),
    // Timeline + graph are entity-only (global surfaces bring their own via engines).
    settle("timeline", pol.includeTimeline && isEntity, () => getEntityTimeline(entityType, entityId, { limit: pol.caps.timeline + 4 }), [] as { title: string; occurred_at: string; id?: string }[]),
    settle("graph", pol.includeGraph && isEntity, () => getEntityRelationships(entityType, entityId), [] as { source_entity_type: string; source_entity_id: string; target_entity_type: string; target_entity_id: string; relationship_type: string; status: string; id?: string }[]),
    settle<{ items: { entityType: string; entityId: string; title: string; why: string; id?: string }[] }>(
      "recommendations", pol.includeRecommendations,
      async () => { const q = await getBrokerIntelligenceQueue({ limit: 30 }); return { items: q.items.map((i) => ({ entityType: i.entityType, entityId: i.entityId, title: i.title, why: i.why, id: i.id })) }; },
      { items: [] }),
  ]);

  // Extra defensive sensitivity gate (belt-and-suspenders over the read cap).
  const memory = cap("memory", memRaw.filter((m) => sensitivityAllowed(mode, m.sensitivity)), pol.caps.memory);
  const orgPreferences = cap("preferences", orgRaw.filter((m) => sensitivityAllowed(mode, m.sensitivity)), pol.caps.preferences);
  const userPreferences = pol.includeUserPrivate ? cap("preferences", userRaw.filter((m) => sensitivityAllowed(mode, m.sensitivity)), pol.caps.preferences) : [];

  const relationships: CtxRelationship[] = [];
  for (const r of relRaw) {
    if (r.status && r.status !== "active") continue;
    const isSource = r.source_entity_type === entityType && r.source_entity_id === entityId;
    relationships.push({ relationshipType: r.relationship_type, otherType: isSource ? r.target_entity_type : r.source_entity_type, otherId: isSource ? r.target_entity_id : r.source_entity_id });
  }
  const relCapped = cap("graph", relationships, pol.caps.graph);

  const timeline = cap("timeline", tlRaw.map((t) => ({ title: t.title, occurredAt: t.occurred_at, id: t.id })), pol.caps.timeline);

  // Entity surfaces get their own recommendations; a global surface gets the org-wide queue.
  const recommendations = cap("recommendations",
    (queue.items ?? []).filter((i) => !isEntity || (i.entityType === entityType && i.entityId === entityId)).map((i) => ({ title: i.title, why: i.why, id: i.id })),
    pol.caps.recommendations);

  // ── Provenance (PART 10) — one record per included item. ────────────────────
  for (const m of memory) provenance.push({ layer: "memory", entityType, entityId, sourceId: null, timestamp: null, confidence: m.confidence, sensitivity: m.sensitivity, provenance: m.provenance });
  for (const t of timeline) provenance.push({ layer: "timeline", entityType, entityId, sourceId: t.id ?? null, timestamp: t.occurredAt, confidence: null, sensitivity: null, provenance: null });
  for (const r of relCapped) provenance.push({ layer: "graph", entityType, entityId, sourceId: `${r.otherType}:${r.otherId}`, timestamp: null, confidence: null, sensitivity: null, provenance: "derived" });
  for (const rec of recommendations) provenance.push({ layer: "recommendation", entityType, entityId, sourceId: (rec as { id?: string }).id ?? null, timestamp: null, confidence: null, sensitivity: "internal", provenance: "derived" });

  // Layer 1 (truth): highest-confidence explicit memory fact, as a one-liner.
  const truth = memory.find((m) => m.provenance === "explicit") ?? memory[0] ?? null;

  return {
    ...empty,
    truthLine: pol.includeTruth && truth ? truth.fact : null,
    truthSensitivity: truth ? truth.sensitivity : undefined,
    memory: memory.map(capMem),
    orgPreferences: orgPreferences.map(capMem),
    userPreferences: userPreferences.map(capMem),
    timeline: timeline.map((t) => ({ title: t.title, occurredAt: t.occurredAt })),
    relationships: relCapped,
    recommendations: recommendations.map((r) => ({ title: r.title, why: r.why })),
  };
}

/** Assemble + render the prompt-safe context text under a mode (or "" if empty). */
export async function assembleEntityContextText(req: ContextRequest): Promise<string> {
  const ctx = await assembleEntityContext(req);
  if (!hasContextSignal(ctx)) return "";
  return renderContextText(ctx, { forBroadPrompt: modePolicy(req.mode).forBroadPrompt });
}
