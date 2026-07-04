// ============================================================================
// 🧠 ZONO Org-Memory Store — durable persistence (server-only). 34.2.
// Gives the Organizational Memory engine a durable substrate. The engine keeps
// derive-on-read (from mission history) as a FALLBACK; this store is the primary
// place learnings/events/patterns persist and can be trended. Writes run under
// service_role; reads are org-scoped. Degrades gracefully if migration absent.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { normConfidence } from "./core";

const MEM = "zono_org_memory";
const EVT = "zono_org_memory_events";
const PAT = "zono_org_learning_patterns";

export interface MemoryRecord {
  orgId: string; entityType?: string | null; entityId?: string | null;
  memoryType: string; title: string; summary?: string | null; evidence?: Json;
  confidence?: number | null; impact?: string | null; sourceModule?: string | null; occurredAt?: string | null;
}
export interface MemoryEventRecord {
  orgId: string; entityType?: string | null; entityId?: string | null;
  eventType: string; title: string; summary?: string | null; evidence?: Json;
  impact?: string | null; sourceModule?: string | null; occurredAt?: string | null;
}

/** Persist a memory record. */
export async function recordMemory(m: MemoryRecord): Promise<boolean> {
  if (!m.orgId || !m.memoryType || !m.title) return false;
  const db = createServiceRoleClient();
  try {
    const { error } = await db.from(MEM).insert({
      org_id: m.orgId, entity_type: m.entityType ?? null, entity_id: m.entityId ?? null,
      memory_type: m.memoryType, title: m.title, summary: m.summary ?? null, evidence: m.evidence ?? [],
      confidence: normConfidence(m.confidence), impact: m.impact ?? null, source_module: m.sourceModule ?? null,
      occurred_at: m.occurredAt ?? null,
    });
    return !error;
  } catch { return false; }
}

/** Append a memory event. */
export async function recordMemoryEvent(e: MemoryEventRecord): Promise<boolean> {
  if (!e.orgId || !e.eventType || !e.title) return false;
  const db = createServiceRoleClient();
  try {
    const { error } = await db.from(EVT).insert({
      org_id: e.orgId, entity_type: e.entityType ?? null, entity_id: e.entityId ?? null,
      event_type: e.eventType, title: e.title, summary: e.summary ?? null, evidence: e.evidence ?? [],
      impact: e.impact ?? null, source_module: e.sourceModule ?? null, occurred_at: e.occurredAt ?? new Date().toISOString(),
    });
    return !error;
  } catch { return false; }
}

export interface ReadMemoryResult { records: unknown[]; patterns: unknown[]; persisted: boolean }

/** Read persisted memory + patterns for an org. `persisted:false` = store empty/absent → caller should fall back to derive-on-read. */
export async function readOrgMemory(orgId: string, limit = 100): Promise<ReadMemoryResult> {
  if (!orgId) return { records: [], patterns: [], persisted: false };
  const db = createServiceRoleClient();
  try {
    const [mem, pat] = await Promise.all([
      db.from(MEM).select("*").eq("org_id", orgId).order("occurred_at", { ascending: false }).limit(limit),
      db.from(PAT).select("*").eq("org_id", orgId).order("confidence", { ascending: false }).limit(limit),
    ]);
    const records = mem.error ? [] : (mem.data ?? []);
    const patterns = pat.error ? [] : (pat.data ?? []);
    return { records, patterns, persisted: records.length > 0 || patterns.length > 0 };
  } catch { return { records: [], patterns: [], persisted: false }; }
}
