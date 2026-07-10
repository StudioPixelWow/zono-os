// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 4 · Batch 4.4 · Canonical AI Memory · repository (server).
// Reads/writes the canonical ai_memory rows under the service role (kernel
// subscriber + backfill). The partial unique index (organization_id, identity_key)
// WHERE active guarantees ONE active memory per dimension. Supersession preserves
// history (old → active=false + superseded_by), never hard-deletes. Never throws
// on reads. The generated types don't yet include the new columns → `as never`.
// ============================================================================
import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import type { MemoryOpIntent } from "./types";
import type { ExistingMemory } from "./conflict";
import type { Provenance } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

const visibilityForScope = (scope: MemoryOpIntent["scope"]): string =>
  scope === "user" ? "private" : "organization";

/** The active memory (if any) for an identity, shaped for conflict resolution. */
export async function readActiveByIdentity(db: Db, orgId: string, identityKey: string): Promise<ExistingMemory | null> {
  try {
    const { data } = await db.from("ai_memory" as never)
      .select("normalized_fact,explicit_or_inferred,source_event_id")
      .eq("organization_id", orgId).eq("identity_key", identityKey).eq("active", true)
      .limit(1).maybeSingle();
    if (!data) return null;
    const r = data as unknown as { normalized_fact: string | null; explicit_or_inferred: Provenance; source_event_id: string | null };
    return { normalizedFact: r.normalized_fact ?? "", provenance: r.explicit_or_inferred, sourceEventId: r.source_event_id };
  } catch { return null; }
}

/** Insert a new active canonical memory. Returns the new id (or null on failure). */
export async function createMemory(
  db: Db, orgId: string, intent: MemoryOpIntent, identityKey: string, normalizedFact: string,
  sourceEventId: string | null, actorUserId: string | null,
): Promise<string | null> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await db.from("ai_memory" as never).insert({
      organization_id: orgId,
      user_id: intent.scope === "user" ? intent.userId : actorUserId,
      scope_type: intent.scope,
      entity_type: intent.entityType,
      entity_id: intent.entityId,
      memory_type: intent.memoryType,
      title: intent.title,
      summary: intent.fact,
      fact: intent.fact,
      normalized_fact: normalizedFact,
      normalized_fact_key: intent.normalizedFactKey,
      identity_key: identityKey,
      memory_value: { fact: intent.fact },
      source_type: "kernel",
      source_event_id: sourceEventId,
      source_entity_refs: intent.sourceEntityRefs,
      confidence: intent.confidence,
      sensitivity: intent.sensitivity,
      explicit_or_inferred: intent.provenance,
      visibility: visibilityForScope(intent.scope),
      status: "active",
      active: true,
      valid_from: now,
      last_confirmed_at: now,
    } as never).select("id").single();
    if (error || !data) return null;
    return (data as unknown as { id: string }).id;
  } catch { return null; }
}

/** Deactivate the currently-active memory for an identity (supersession/expiry). */
async function deactivate(db: Db, orgId: string, identityKey: string): Promise<void> {
  const now = new Date().toISOString();
  await db.from("ai_memory" as never)
    .update({ active: false, status: "archived", valid_to: now } as never)
    .eq("organization_id", orgId).eq("identity_key", identityKey).eq("active", true);
}

/** Supersede: deactivate the old active memory, insert the new one, link the chain. */
export async function supersedeMemory(
  db: Db, orgId: string, intent: MemoryOpIntent, identityKey: string, normalizedFact: string,
  sourceEventId: string | null, actorUserId: string | null,
): Promise<string | null> {
  try {
    await deactivate(db, orgId, identityKey);
    const newId = await createMemory(db, orgId, intent, identityKey, normalizedFact, sourceEventId, actorUserId);
    if (newId) {
      // Link the retired row(s) to the replacement (history preserved).
      const now = new Date().toISOString();
      await db.from("ai_memory" as never)
        .update({ superseded_by: newId } as never)
        .eq("organization_id", orgId).eq("identity_key", identityKey).eq("active", false).is("superseded_by", null)
        .lte("valid_to", now);
    }
    return newId;
  } catch { return null; }
}

/** Reinforce the active memory (same fact re-confirmed): bump last_confirmed_at + confidence. */
export async function confirmMemory(db: Db, orgId: string, identityKey: string, sourceEventId: string | null, confidence: number): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const { error } = await db.from("ai_memory" as never)
      .update({ last_confirmed_at: now, confidence, source_event_id: sourceEventId } as never)
      .eq("organization_id", orgId).eq("identity_key", identityKey).eq("active", true);
    return !error;
  } catch { return false; }
}
