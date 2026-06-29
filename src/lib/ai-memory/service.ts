"use server";
// ============================================================================
// 🧠 AI Memory — official server actions. Phase 27.7.
// User-controlled persistent memory. Every memory is created ONLY by an explicit
// action (never automatically). No reasoning, no execution, no CRM changes.
// Secrets are stripped/rejected before write. Org-scoped via RLS.
// ============================================================================
import { currentSessionOrgId } from "@/lib/agencies/api/agencyIntelligenceApiPermissions";
import { getSessionContext } from "@/lib/auth/session";
import { validateMemoryInput } from "./schema";
import { applyLifecycle } from "./memory-engine";
import {
  getMemoryById, insertMemory, listMemories, setMemoryPinned,
  setMemoryStatus, touchMemoryUsage, updateMemory, type MemoryPatch,
} from "./repository";
import type { AiMemory, AiMemoryInput, MemoryVisibility } from "./types";

export interface MemoryActionResult { ok: boolean; memory?: AiMemory; reason?: string }

export async function listMemoriesAction(): Promise<AiMemory[]> {
  return listMemories();
}

export async function createMemoryAction(input: AiMemoryInput): Promise<MemoryActionResult> {
  const orgId = await currentSessionOrgId();
  if (!orgId) return { ok: false, reason: "no organization in session" };
  const session = await getSessionContext().catch(() => null);
  const userId = session?.user?.id ?? null;
  if (!userId) return { ok: false, reason: "not authenticated" };

  const v = validateMemoryInput(input);
  if (!v.ok) return { ok: false, reason: v.errors.join("; ") };

  const memory = await insertMemory(orgId, userId, input, v.value);
  return memory ? { ok: true, memory } : { ok: false, reason: "insert failed" };
}

export async function updateMemoryAction(id: string, patch: MemoryPatch): Promise<MemoryActionResult> {
  // Re-validate text + strip secrets if title/summary/value changed.
  if (patch.title !== undefined || patch.summary !== undefined || patch.value !== undefined) {
    const current = await getMemoryById(id);
    if (!current) return { ok: false, reason: "not_found" };
    const v = validateMemoryInput({
      memoryType: current.memoryType,
      title: patch.title ?? current.title,
      summary: patch.summary ?? current.summary,
      value: patch.value ?? current.value,
    });
    if (!v.ok) return { ok: false, reason: v.errors.join("; ") };
    if (patch.value !== undefined) patch = { ...patch, value: v.value };
  }
  const memory = await updateMemory(id, patch);
  return memory ? { ok: true, memory } : { ok: false, reason: "update failed (permission?)" };
}

export async function setMemoryVisibilityAction(id: string, visibility: MemoryVisibility): Promise<MemoryActionResult> {
  const memory = await updateMemory(id, { visibility });
  return memory ? { ok: true, memory } : { ok: false, reason: "update failed" };
}

export async function pinMemoryAction(id: string, pinned: boolean): Promise<MemoryActionResult> {
  const memory = await setMemoryPinned(id, pinned);
  return memory ? { ok: true, memory } : { ok: false, reason: "update failed" };
}

async function lifecycle(id: string, action: "archive" | "restore" | "delete"): Promise<MemoryActionResult> {
  const current = await getMemoryById(id);
  if (!current) return { ok: false, reason: "not_found" };
  const next = applyLifecycle(current.status, action);
  if (!next) return { ok: false, reason: `cannot ${action} from ${current.status}` };
  const memory = await setMemoryStatus(id, next);
  return memory ? { ok: true, memory } : { ok: false, reason: "update failed (permission?)" };
}

export async function archiveMemoryAction(id: string): Promise<MemoryActionResult> { return lifecycle(id, "archive"); }
export async function restoreMemoryAction(id: string): Promise<MemoryActionResult> { return lifecycle(id, "restore"); }
/** Soft-delete (status = deleted) — keeps it user-controlled and auditable. */
export async function deleteMemoryAction(id: string): Promise<MemoryActionResult> { return lifecycle(id, "delete"); }

/** Explicit usage bump (e.g. when a memory is opened/applied). */
export async function touchMemoryAction(id: string): Promise<void> {
  const m = await getMemoryById(id);
  if (m) await touchMemoryUsage(id, m.usageCount);
}
