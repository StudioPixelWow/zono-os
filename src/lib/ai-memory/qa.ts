// ============================================================================
// ✅ AI Memory QA — offline, deterministic self-check (pure). Phase 27.7.
// Exercises schema + engine only (no DB, no network, no AI).
// ============================================================================
import { validateMemoryInput, deepStripSecrets, looksLikeSecret } from "./schema";
import { searchMemories, applyFilter, groupForDisplay, explainMemory, applyLifecycle, isExpired } from "./memory-engine";
import type { AiMemory } from "./types";

export interface QaCheck { name: string; ok: boolean; detail: string }
export interface QaResult { passed: boolean; checks: QaCheck[] }

function mem(over: Partial<AiMemory>): AiMemory {
  return {
    id: "m1", organizationId: "org1", userId: "u1", memoryType: "favorite_area",
    title: "כרמל חיפה", summary: "אזור מועדף", value: {}, sourceType: "manual", sourceId: null,
    confidence: 80, visibility: "private", status: "active", expiresAt: null, lastUsedAt: null,
    usageCount: 0, pinned: false, tags: ["חיפה"], metadata: {}, createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z",
    ...over,
  };
}

export function runSelfCheck(): QaResult {
  const checks: QaCheck[] = [];
  const add = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });

  // 1) create valid
  add("1-create-valid", validateMemoryInput({ memoryType: "favorite_area", title: "כרמל" }).ok);

  // 2) invalid type rejected
  add("2-invalid-type", !validateMemoryInput({ memoryType: "nope" as never, title: "x" }).ok);

  // 3) secret in value stripped
  const stripped = deepStripSecrets({ note: "ok", api_key: "sk-123", nested: { password: "p", keep: 1 } }) as Record<string, unknown>;
  add("3-secret-stripped", !("api_key" in stripped) && (stripped.nested as Record<string, unknown>).password === undefined && (stripped.nested as Record<string, unknown>).keep === 1, JSON.stringify(stripped));

  // 4) secret in title rejected
  add("4-secret-title-rejected", !validateMemoryInput({ memoryType: "manual_note", title: "password = 1234" }).ok && looksLikeSecret("sk-abcdef0123456789"));

  // 5) search by title/type/tag
  const list = [mem({ id: "a", title: "כרמל" }), mem({ id: "b", title: "רמת אביב", tags: ["תל אביב"] }), mem({ id: "c", memoryType: "rule", title: "כלל תמחור" })];
  add("5-search", searchMemories(list, "כרמל").length === 1 && searchMemories(list, "תל אביב").length === 1 && searchMemories(list, "rule").length === 1);

  // 6) filter by type/visibility/status
  add("6-filter", applyFilter(list, { type: "rule" }).length === 1);

  // 7) expiration
  add("7-expired", isExpired(mem({ expiresAt: "2020-01-01T00:00:00Z" })) && !isExpired(mem({ expiresAt: "2999-01-01T00:00:00Z" })));

  // 8) grouping: pinned / frequent / archived / expired
  const groups = groupForDisplay([
    mem({ id: "p", pinned: true }),
    mem({ id: "f", usageCount: 9 }),
    mem({ id: "ar", status: "archived" }),
    mem({ id: "ex", expiresAt: "2000-01-01T00:00:00Z" }),
  ]);
  add("8-grouping", groups.pinned.length === 1 && groups.frequent.length >= 1 && groups.archived.length === 1 && groups.expired.length === 1);

  // 9) explain has all inspector fields
  const ex = explainMemory(mem({ usageCount: 3, lastUsedAt: "2026-01-03T00:00:00Z" }));
  add("9-explain", ex.source === "manual" && ex.confidence === 80 && ex.usageCount === 3 && ex.visibility === "private" && !!ex.created);

  // 10) lifecycle transitions
  add("10-archive", applyLifecycle("active", "archive") === "archived");
  add("11-restore", applyLifecycle("archived", "restore") === "active");
  add("12-delete", applyLifecycle("active", "delete") === "deleted");
  add("13-no-restore-active", applyLifecycle("active", "restore") === null);

  // 14) determinism
  const g1 = JSON.stringify(groupForDisplay(list));
  const g2 = JSON.stringify(groupForDisplay(list));
  add("14-deterministic", g1 === g2);

  return { passed: checks.every((c) => c.ok), checks };
}
