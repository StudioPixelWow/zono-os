// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 4 · Batch 4.4 · Canonical AI Memory · ingest (server).
// Turns ONE domain event into canonical-memory writes: classify salient facts →
// resolve each against the currently-active memory for its identity → create /
// reinforce / supersede / skip. Idempotent (identity + source_event_id). Never
// throws — returns per-outcome counts the processor records as a 'memory' delivery.
// ============================================================================
import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import type { DomainEventLike } from "@/lib/kernel/subscriber";
import { classifyMemory } from "./salience";
import { memoryIdentityKey, normalizeFact } from "./identity";
import { resolveMemoryConflict } from "./conflict";
import { readActiveByIdentity, createMemory, supersedeMemory, confirmMemory } from "./repository";

type Db = ReturnType<typeof createServiceRoleClient>;

export interface MemoryIngestResult {
  created: number;
  reinforced: number;
  superseded: number;
  skipped: number;
  failed: number;
}

/** Ingest all salient memories for one event. Deterministic decisions, idempotent writes. */
export async function ingestMemoryForEvent(db: Db, evt: DomainEventLike): Promise<MemoryIngestResult> {
  const out: MemoryIngestResult = { created: 0, reinforced: 0, superseded: 0, skipped: 0, failed: 0 };
  const org = evt.organization_id;
  const actor = evt.actor_user_id;
  const intents = classifyMemory(evt);

  for (const intent of intents) {
    try {
      const identityKey = memoryIdentityKey(org, intent);
      const normalized = normalizeFact(intent.fact);
      const existing = await readActiveByIdentity(db, org, identityKey);
      const decision = resolveMemoryConflict(existing, { fact: intent.fact, provenance: intent.provenance, sourceEventId: evt.id });

      switch (decision.action) {
        case "create": {
          const id = await createMemory(db, org, intent, identityKey, normalized, evt.id, actor);
          if (id) out.created++; else out.failed++;
          break;
        }
        case "reinforce": {
          const ok = await confirmMemory(db, org, identityKey, evt.id, intent.confidence);
          if (ok) out.reinforced++; else out.failed++;
          break;
        }
        case "supersede": {
          const id = await supersedeMemory(db, org, intent, identityKey, normalized, evt.id, actor);
          if (id) out.superseded++; else out.failed++;
          break;
        }
        default:
          out.skipped++;
      }
    } catch { out.failed++; }
  }
  return out;
}
