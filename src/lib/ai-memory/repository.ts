// ============================================================================
// 🗄️ AI Memory repository (server-only). Phase 27.7. RLS-scoped CRUD.
// Defensive (returns []/null before the migration is applied). Tags live in
// metadata.tags (no separate column). No execution beyond memory rows.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { AiMemory, AiMemoryInput, MemoryStatus, MemoryVisibility } from "./types";

type Row = Record<string, unknown>;

function rowToMemory(row: Row): AiMemory {
  const metadata = (row.metadata as Record<string, unknown>) ?? {};
  const tags = Array.isArray(metadata.tags) ? (metadata.tags as string[]) : [];
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: (row.user_id as string) ?? null,
    memoryType: row.memory_type as AiMemory["memoryType"],
    title: String(row.title ?? ""),
    summary: (row.summary as string) ?? null,
    value: (row.memory_value as Record<string, unknown>) ?? {},
    sourceType: row.source_type as AiMemory["sourceType"],
    sourceId: (row.source_id as string) ?? null,
    confidence: Number(row.confidence ?? 0),
    visibility: row.visibility as MemoryVisibility,
    status: row.status as MemoryStatus,
    expiresAt: (row.expires_at as string) ?? null,
    lastUsedAt: (row.last_used_at as string) ?? null,
    usageCount: Number(row.usage_count ?? 0),
    pinned: Boolean(row.pinned),
    tags,
    metadata,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listMemories(): Promise<AiMemory[]> {
  try {
    const supabase = await createClient();
    // Defense-in-depth (STABILIZATION): never rely on RLS alone — only return
    // office/org/system memory, or private memory the CALLER owns. A private row
    // belonging to another broker can never be returned even if RLS regresses.
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id ?? null;
    let q = supabase.from("ai_memory").select("*").neq("status", "deleted");
    q = uid
      ? q.or(`visibility.in.(office,organization,system),user_id.eq.${uid}`)
      : q.in("visibility", ["office", "organization", "system"]);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(300);
    if (error) { console.error("[ai-memory] list failed:", error.message); return []; }
    return (data ?? []).map((r) => rowToMemory(r as Row));
  } catch (e) { console.error("[ai-memory] list error:", e); return []; }
}

export async function getMemoryById(id: string): Promise<AiMemory | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("ai_memory").select("*").eq("id", id).maybeSingle();
    return data ? rowToMemory(data as Row) : null;
  } catch (e) { console.error("[ai-memory] get error:", e); return null; }
}

export async function insertMemory(orgId: string, userId: string | null, input: AiMemoryInput, sanitizedValue: Record<string, unknown>): Promise<AiMemory | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ai_memory").insert({
      organization_id: orgId, user_id: userId,
      memory_type: input.memoryType, title: input.title.trim(), summary: input.summary ?? null,
      memory_value: sanitizedValue as unknown as Json,
      source_type: input.sourceType ?? "manual", source_id: input.sourceId ?? null,
      confidence: input.confidence ?? 0, visibility: input.visibility ?? "private", status: "active",
      expires_at: input.expiresAt ?? null, pinned: input.pinned ?? false,
      metadata: { ...(input.metadata ?? {}), tags: input.tags ?? [] } as unknown as Json,
    }).select("*").single();
    if (error) { console.error("[ai-memory] insert failed:", error.message); return null; }
    return data ? rowToMemory(data as Row) : null;
  } catch (e) { console.error("[ai-memory] insert error:", e); return null; }
}

export interface MemoryPatch {
  title?: string; summary?: string | null; visibility?: MemoryVisibility;
  expiresAt?: string | null; pinned?: boolean; value?: Record<string, unknown>; tags?: string[];
  metadata?: Record<string, unknown>;
}

export async function updateMemory(id: string, patch: MemoryPatch): Promise<AiMemory | null> {
  try {
    const supabase = await createClient();
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) upd.title = patch.title.trim();
    if (patch.summary !== undefined) upd.summary = patch.summary;
    if (patch.visibility !== undefined) upd.visibility = patch.visibility;
    if (patch.expiresAt !== undefined) upd.expires_at = patch.expiresAt;
    if (patch.pinned !== undefined) upd.pinned = patch.pinned;
    if (patch.value !== undefined) upd.memory_value = patch.value as unknown as Json;
    if (patch.metadata !== undefined || patch.tags !== undefined) {
      upd.metadata = { ...(patch.metadata ?? {}), ...(patch.tags !== undefined ? { tags: patch.tags } : {}) } as unknown as Json;
    }
    const { data, error } = await supabase.from("ai_memory").update(upd as never).eq("id", id).select("*").single();
    if (error) { console.error("[ai-memory] update failed:", error.message); return null; }
    return data ? rowToMemory(data as Row) : null;
  } catch (e) { console.error("[ai-memory] update error:", e); return null; }
}

export async function setMemoryStatus(id: string, status: MemoryStatus): Promise<AiMemory | null> {
  return updateStatusOrPin(id, { status });
}
export async function setMemoryPinned(id: string, pinned: boolean): Promise<AiMemory | null> {
  return updateStatusOrPin(id, { pinned });
}
async function updateStatusOrPin(id: string, fields: { status?: MemoryStatus; pinned?: boolean }): Promise<AiMemory | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ai_memory").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) { console.error("[ai-memory] status/pin failed:", error.message); return null; }
    return data ? rowToMemory(data as Row) : null;
  } catch (e) { console.error("[ai-memory] status/pin error:", e); return null; }
}

/** Increment usage on read (explicit trigger only). */
export async function touchMemoryUsage(id: string, current: number): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("ai_memory").update({ usage_count: current + 1, last_used_at: new Date().toISOString() }).eq("id", id);
  } catch (e) { console.error("[ai-memory] touch error:", e); }
}
