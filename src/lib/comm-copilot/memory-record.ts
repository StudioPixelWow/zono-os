// ============================================================================
// 🧠 ZONO — Copilot MEMORY record builders (pure). Phase 4.
// ----------------------------------------------------------------------------
// Maps the merged CopilotMemory into rows for the EXISTING memory stores — no
// new memory database. The full taxonomy is stored in client_memory's existing
// jsonb columns; durable high-confidence explicit facts are ALSO surfaced as
// canonical ai_memory inputs (persisted through the existing ai-memory service).
// ============================================================================
import crypto from "node:crypto";
import type { AiMemoryInput } from "@/lib/ai-memory/types";
import type { CopilotMemory } from "./memory-types";

const listVals = (m: CopilotMemory, k: string) => (m.lists[k] ?? []).map((i) => i.value);
const sVal = (m: CopilotMemory, k: string) => m.scalars[k]?.value ?? null;

/** A client_memory row (reuses existing columns; full taxonomy in jsonb). */
export interface ClientMemoryRow {
  org_id: string; entity_type: string; entity_id: string;
  communication_style: string | null; timeline: string | null;
  preferences: unknown; family: unknown; budget: unknown; budget_evolution: unknown;
  motivations: unknown; desired_cities: unknown; desired_neighborhoods: unknown; property_types: unknown;
  updated_at: string;
}

export function buildClientMemoryRow(orgId: string, entityType: string, entityId: string, m: CopilotMemory, nowIso: string): ClientMemoryRow {
  const budgetVal = sVal(m, "property.budget");
  return {
    org_id: orgId, entity_type: entityType, entity_id: entityId,
    communication_style: sVal(m, "behavior.preferredCommunicationHours"),
    timeline: sVal(m, "behavior.timeline"),
    // Full taxonomy (nothing lost) — the canonical copilot memory blob.
    preferences: { scalars: m.scalars, lists: m.lists, contradictions: m.contradictions, version: m.version, firstSeen: m.firstSeen, lastUpdated: m.lastUpdated },
    family: {
      familyStatus: sVal(m, "personal.familyStatus"), children: sVal(m, "personal.children"),
      pets: sVal(m, "personal.pets"), occupation: sVal(m, "personal.occupation"), lifestyle: listVals(m, "personal.lifestyle"),
    },
    budget: budgetVal ? { amount: Number(budgetVal) } : {},
    budget_evolution: m.budgetEvolution,
    motivations: listVals(m, "behavior.motivations"),
    desired_cities: listVals(m, "property.cities"),
    desired_neighborhoods: listVals(m, "property.neighborhoods"),
    property_types: listVals(m, "property.propertyTypes"),
    updated_at: nowIso,
  };
}

/** Durable, high-confidence EXPLICIT facts → canonical ai_memory inputs. A
 *  deterministic sourceId+tag makes the bridge idempotent (dedup on re-run). */
export function buildAiMemoryInputs(m: CopilotMemory, conversationRef: string): AiMemoryInput[] {
  const out: AiMemoryInput[] = [];
  for (const [field, s] of Object.entries(m.scalars)) {
    if (s.source !== "explicit" || s.confidence < 80) continue;      // durable only
    const memoryType = field.startsWith("property.cit") ? "favorite_area" : field.startsWith("behavior") ? "user_preference" : "context";
    out.push({
      memoryType, title: `${field}: ${s.value}`, summary: `נלמד מהשיחה (${s.confidence}%)`,
      value: { field, value: s.value, confidence: s.confidence, evidenceMessageIds: s.evidenceMessageIds, version: s.version },
      sourceType: "conversation", sourceId: conversationRef, confidence: s.confidence,
      visibility: "organization", tags: ["copilot", field],
      metadata: { conversation_ref: conversationRef, first_seen: s.firstSeen, last_updated: s.lastUpdated },
    });
  }
  return out;
}

/** Deterministic uuid for the conversation-scoped client_memory key (no FK). */
export function memoryEntityId(conversationRef: string): string {
  const h = crypto.createHash("sha1").update("copilot-memory:" + conversationRef).digest("hex");
  const b = Buffer.from(h.slice(0, 32), "hex"); b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
