// ============================================================================
// ✅ ZONO — Task picker options (PURE, client-safe).
//
// Kept OUT of tasks/actions.ts: that file is "use server", and such a module
// may export only async functions. A const array export there breaks module
// evaluation for every server action in the bundle.
// ============================================================================

export const TASK_PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;
