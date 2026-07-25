// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · WORKER ORCHESTRATION —
// PURE group metadata. Maps the eight durable Meta queues to dispatch cadence
// groups and proves the mapping is a clean partition (every queue scheduled
// exactly once). No service/store imports, no server-only, no I/O — safe to
// unit-test. The server-only orchestrator (orchestrator.ts) consumes this to
// fan out to the EXISTING per-subsystem tick services; it adds no queue logic.
// ============================================================================

/** Dispatch cadence groups → the subsystems drained on that cadence. */
export const DISPATCH_GROUPS = {
  fast: ["publish", "inbox", "messaging"],
  standard: ["engagement", "intelligence", "reconcile"],
  slow: ["insights", "listening"],
} as const;

export type DispatchGroup = keyof typeof DISPATCH_GROUPS;
export const DISPATCH_GROUP_NAMES = Object.keys(DISPATCH_GROUPS) as DispatchGroup[];

/** The eight durable Meta queues that must be drained. Kept explicit so the
 *  partition check can prove each queue is scheduled exactly once. */
export const ALL_DISPATCH_SUBSYSTEMS = [
  "publish", "inbox", "messaging", "engagement", "intelligence", "reconcile", "insights", "listening",
] as const;
export type MetaSubsystem = (typeof ALL_DISPATCH_SUBSYSTEMS)[number];

export function dispatchGroupMembers(group: DispatchGroup): readonly string[] {
  return DISPATCH_GROUPS[group];
}

/** True iff every durable subsystem appears in exactly one dispatch group and no
 *  unknown subsystem is scheduled — i.e. the schedule is a clean partition. */
export function validateDispatchPartition(): { ok: boolean; missing: readonly string[]; duplicated: readonly string[] } {
  const seen = new Map<string, number>();
  for (const g of DISPATCH_GROUP_NAMES) for (const s of DISPATCH_GROUPS[g]) seen.set(s, (seen.get(s) ?? 0) + 1);
  const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s);
  const missing = ALL_DISPATCH_SUBSYSTEMS.filter((s) => !seen.has(s));
  const extra = [...seen.keys()].filter((s) => !(ALL_DISPATCH_SUBSYSTEMS as readonly string[]).includes(s));
  return { ok: duplicated.length === 0 && missing.length === 0 && extra.length === 0, missing: [...missing, ...extra], duplicated };
}
