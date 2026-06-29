// ============================================================================
// 🧠 Memory engine — pure search / filter / group / explain / lifecycle. Phase 27.7.
// Deterministic, side-effect-free. No reasoning, no execution.
// ============================================================================
import type { AiMemory, MemoryExplain, MemoryFilter, MemoryGroups, MemoryStatus } from "./types";

export function isExpired(m: AiMemory, now: Date = new Date()): boolean {
  if (m.status === "expired") return true;
  return !!m.expiresAt && new Date(m.expiresAt).getTime() <= now.getTime();
}

export function searchMemories(list: AiMemory[], query: string): AiMemory[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((m) =>
    m.title.toLowerCase().includes(q)
    || (m.summary ?? "").toLowerCase().includes(q)
    || m.memoryType.toLowerCase().includes(q)
    || m.tags.some((t) => t.toLowerCase().includes(q)));
}

export function matchesFilter(m: AiMemory, f: MemoryFilter): boolean {
  if (f.type && m.memoryType !== f.type) return false;
  if (f.visibility && m.visibility !== f.visibility) return false;
  if (f.status && m.status !== f.status) return false;
  return true;
}

export function applyFilter(list: AiMemory[], f: MemoryFilter): AiMemory[] {
  let out = list.filter((m) => matchesFilter(m, f));
  if (f.query) out = searchMemories(out, f.query);
  return out;
}

/** Group for the inspector UI. Deterministic ordering. */
export function groupForDisplay(list: AiMemory[], now: Date = new Date()): MemoryGroups {
  const expired = list.filter((m) => isExpired(m, now) && m.status !== "deleted" && m.status !== "archived");
  const archived = list.filter((m) => m.status === "archived");
  const liveActive = list.filter((m) => m.status === "active" && !isExpired(m, now));
  const pinned = liveActive.filter((m) => m.pinned).sort((a, b) => a.title.localeCompare(b.title));
  const rest = liveActive.filter((m) => !m.pinned);
  const recent = [...rest].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
  const frequent = [...liveActive].filter((m) => m.usageCount > 0).sort((a, b) => b.usageCount - a.usageCount || a.title.localeCompare(b.title)).slice(0, 10);
  return { pinned, recent, frequent, expired, archived };
}

export function explainMemory(m: AiMemory): MemoryExplain {
  return {
    source: m.sourceType, confidence: m.confidence, visibility: m.visibility,
    lastUsed: m.lastUsedAt, usageCount: m.usageCount,
    created: m.createdAt, updated: m.updatedAt, expiresAt: m.expiresAt,
  };
}

/** Lifecycle transitions (archive / restore / delete). Returns null if not allowed. */
export function applyLifecycle(current: MemoryStatus, action: "archive" | "restore" | "delete"): MemoryStatus | null {
  if (action === "delete") return current === "deleted" ? null : "deleted";
  if (action === "archive") return current === "active" || current === "expired" ? "archived" : null;
  if (action === "restore") return current === "archived" ? "active" : null;
  return null;
}
