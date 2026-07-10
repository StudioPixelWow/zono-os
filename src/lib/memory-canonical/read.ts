// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Canonical AI Memory · read (server).
// The canonical-first READ side of memory. Reads ACTIVE ai_memory under the
// cookie/RLS client so the org + user-private + role gate is enforced by Postgres
// (a broker never sees another broker's private memory; public/anon can't read).
// Adds an application-level sensitivity filter so callers assembling BROAD AI
// prompts can exclude confidential/restricted facts. Never throws (returns []).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MemoryType, Provenance, Sensitivity, MemoryScope, EntityRef } from "./types";

export interface MemoryView {
  id: string;
  scope: MemoryScope;
  entityType: string | null;
  entityId: string | null;
  memoryType: MemoryType;
  fact: string;
  confidence: number;
  sensitivity: Sensitivity;
  provenance: Provenance;
  sourceEntityRefs: EntityRef[];
  sourceEventId: string | null;
  validFrom: string | null;
  lastConfirmedAt: string | null;
}

export interface MemoryReadOptions {
  /** Cap results (default 40). */
  limit?: number;
  /** Restrict to these memory types. */
  memoryTypes?: MemoryType[];
  /** Max sensitivity to include. For broad prompts pass 'internal' to drop
   *  confidential/restricted. Default: all (cockpit/context use). */
  maxSensitivity?: Sensitivity;
}

const SENSITIVITY_RANK: Record<Sensitivity, number> = { normal: 0, internal: 1, confidential: 2, restricted: 3 };

interface Row {
  id: string; scope_type: MemoryScope; entity_type: string | null; entity_id: string | null;
  memory_type: MemoryType; fact: string | null; summary: string | null; confidence: number;
  sensitivity: Sensitivity; explicit_or_inferred: Provenance; source_entity_refs: unknown;
  source_event_id: string | null; valid_from: string | null; last_confirmed_at: string | null;
}

function toView(r: Row): MemoryView {
  return {
    id: r.id, scope: r.scope_type, entityType: r.entity_type, entityId: r.entity_id,
    memoryType: r.memory_type, fact: r.fact ?? r.summary ?? "", confidence: r.confidence,
    sensitivity: r.sensitivity, provenance: r.explicit_or_inferred,
    sourceEntityRefs: Array.isArray(r.source_entity_refs) ? (r.source_entity_refs as EntityRef[]) : [],
    sourceEventId: r.source_event_id, validFrom: r.valid_from, lastConfirmedAt: r.last_confirmed_at,
  };
}

const COLS = "id,scope_type,entity_type,entity_id,memory_type,fact,summary,confidence,sensitivity,explicit_or_inferred,source_entity_refs,source_event_id,valid_from,last_confirmed_at";

// Defense-in-depth (STABILIZATION): never rely on RLS alone for broker-private
// isolation. Every read below ALSO filters in SQL so a private/user-scoped row is
// returned only to its owner — even if an RLS regression reappears. Mirrors the
// intended ai_memory_select predicate: visibility in (office|organization|system)
// OR user_id = caller.
const OWNER_VISIBLE_OR = "visibility.in.(office,organization,system),user_id.eq.";

/** The authenticated caller's user id (null if unauthenticated). Never throws. */
async function callerId(db: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  try { const { data } = await db.auth.getUser(); return data.user?.id ?? null; } catch { return null; }
}

function applyFilters(views: MemoryView[], opts: MemoryReadOptions): MemoryView[] {
  let out = views;
  if (opts.memoryTypes?.length) out = out.filter((v) => opts.memoryTypes!.includes(v.memoryType));
  if (opts.maxSensitivity) {
    const cap = SENSITIVITY_RANK[opts.maxSensitivity];
    out = out.filter((v) => SENSITIVITY_RANK[v.sensitivity] <= cap);
  }
  return out
    .sort((a, b) => (b.confidence - a.confidence) || (b.lastConfirmedAt ?? "").localeCompare(a.lastConfirmedAt ?? ""))
    .slice(0, opts.limit ?? 40);
}

/** Active memory for one entity (RLS-scoped + app-level owner/visibility gate). */
export async function getEntityMemory(entityType: string, entityId: string, opts: MemoryReadOptions = {}): Promise<MemoryView[]> {
  try {
    const db = await createClient();
    const uid = await callerId(db);
    // Defense-in-depth: only office/org/system rows, or private rows the caller owns.
    let q = db.from("ai_memory" as never)
      .select(COLS).eq("active", true).eq("scope_type", "entity")
      .eq("entity_type", entityType).eq("entity_id", entityId);
    q = uid ? q.or(`${OWNER_VISIBLE_OR}${uid}`) : q.in("visibility", ["office", "organization", "system"]);
    const { data } = await q.limit(200);
    return applyFilters(((data as unknown as Row[]) ?? []).map(toView), opts);
  } catch { return []; }
}

/** Active organization-scope memory (business rules, provider availability, …). */
export async function getOrgMemory(opts: MemoryReadOptions = {}): Promise<MemoryView[]> {
  try {
    const db = await createClient();
    const uid = await callerId(db);
    let q = db.from("ai_memory" as never)
      .select(COLS).eq("active", true).eq("scope_type", "organization");
    // Org-scope memory is normally office/org/system, but gate defensively anyway.
    q = uid ? q.or(`${OWNER_VISIBLE_OR}${uid}`) : q.in("visibility", ["office", "organization", "system"]);
    const { data } = await q.limit(200);
    return applyFilters(((data as unknown as Row[]) ?? []).map(toView), opts);
  } catch { return []; }
}

/** Active user/broker-scope memory — STRICTLY the caller's own rows (never another
 *  broker's private memory), enforced in SQL as well as by RLS. */
export async function getUserMemory(opts: MemoryReadOptions = {}): Promise<MemoryView[]> {
  try {
    const db = await createClient();
    const uid = await callerId(db);
    if (!uid) return []; // no authenticated caller → no user-scoped memory
    const { data } = await db.from("ai_memory" as never)
      .select(COLS).eq("active", true).eq("scope_type", "user").eq("user_id", uid).limit(200);
    return applyFilters(((data as unknown as Row[]) ?? []).map(toView), opts);
  } catch { return []; }
}
