// ============================================================================
// 🧠 ZONO — Copilot MEMORY persistence (server-only). Phase 4.
// ----------------------------------------------------------------------------
// Writes ONLY through the existing memory stores — no new memory database:
//   · client_memory  — the full merged taxonomy (existing table + jsonb columns);
//     idempotent via its unique (org_id, entity_type, entity_id) constraint.
//   · canonical ai_memory — durable high-confidence explicit facts, surfaced
//     through the existing ai-memory service (best-effort, idempotent by
//     sourceId+title; skipped when there is no session, e.g. cron).
// Keyed by the linked CRM entity when present, else a deterministic
// conversation uuid. Deterministic merge (never downgrade, contradictions).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { mergeMemory } from "./memory-merge";
import { emptyMemory, type CopilotMemory, type PartialMemory } from "./memory-types";
import { buildClientMemoryRow, buildAiMemoryInputs, memoryEntityId } from "./memory-record";

type CrmLinks = { lead: string | null; buyer: string | null; seller: string | null };

function resolveKey(ref: string, crm: CrmLinks): { entityType: string; entityId: string } {
  if (crm.buyer) return { entityType: "buyer", entityId: crm.buyer };
  if (crm.seller) return { entityType: "seller", entityId: crm.seller };
  if (crm.lead) return { entityType: "lead", entityId: crm.lead };
  return { entityType: "conversation", entityId: memoryEntityId(ref) };
}

function reconstruct(pref: unknown, budgetEvo: unknown, nowIso: string): CopilotMemory {
  const p = (pref ?? {}) as Partial<CopilotMemory>;
  return {
    scalars: p.scalars ?? {}, lists: p.lists ?? {},
    budgetEvolution: Array.isArray(budgetEvo) ? (budgetEvo as CopilotMemory["budgetEvolution"]) : (p.budgetEvolution ?? []),
    contradictions: p.contradictions ?? [], firstSeen: p.firstSeen ?? nowIso, lastUpdated: p.lastUpdated ?? nowIso, version: p.version ?? 0,
  };
}

export interface MemoryPersistResult { changed: boolean; changes: number; contradictions: number; version: number }

/** Merge the extracted facts into the stored memory and persist (client_memory +
 *  best-effort ai_memory bridge). Returns nothing to write? still upserts to keep
 *  reinforcement/confidence current — the caller gates on the memory hash. */
export async function persistMemory(orgId: string, ref: string, crm: CrmLinks, extracted: PartialMemory, nowIso: string): Promise<MemoryPersistResult> {
  const db = createServiceRoleClient();
  const { entityType, entityId } = resolveKey(ref, crm);

  const prevRow = await db.from("client_memory" as never).select("preferences,budget_evolution")
    .eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  const prev = reconstruct((prevRow.data as { preferences?: unknown } | null)?.preferences, (prevRow.data as { budget_evolution?: unknown } | null)?.budget_evolution, nowIso);

  const { memory, changes } = mergeMemory(prev, extracted, nowIso);

  await db.from("client_memory" as never)
    .upsert(buildClientMemoryRow(orgId, entityType, entityId, memory, nowIso) as never, { onConflict: "org_id,entity_type,entity_id" });

  // Best-effort canonical ai_memory bridge (idempotent; skipped without a session).
  try {
    const inputs = buildAiMemoryInputs(memory, ref);
    if (inputs.length) {
      const { createMemoryAction, listMemoriesAction } = await import("@/lib/ai-memory/service");
      const existing = await listMemoriesAction().catch(() => []);
      const seen = new Set(existing.filter((e) => e.sourceType === "conversation" && e.sourceId === ref).map((e) => e.title));
      for (const input of inputs) if (!seen.has(input.title)) await createMemoryAction(input).catch(() => undefined);
    }
  } catch { /* bridge is best-effort — never blocks client_memory */ }

  await logAudit({ action: "copilot.memory_updated", category: "recommendation", entityType: "client_memory", entityId, summary: `Copilot memory updated (${changes.length} changes)`, metadata: { changes: changes.length, contradictions: memory.contradictions.length } });

  return { changed: changes.length > 0, changes: changes.length, contradictions: memory.contradictions.length, version: memory.version };
}

export { reconstruct as reconstructMemory, resolveKey as resolveMemoryKey };
export { emptyMemory };
