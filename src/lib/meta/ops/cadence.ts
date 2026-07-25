// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · SCHEDULER — single source
// of truth for worker cadence. Vercel Cron invokes endpoints with GET and (on
// Pro) supports minute-level schedules; each path below maps to a GET
// orchestrator route that fans out to the EXISTING per-subsystem tick services.
// These entries are documentation-as-code and are mirrored verbatim into
// vercel.json (asserted by QA). No scheduling logic is duplicated here — this is
// only the cadence policy; the actual claim/lease/retry stays in the subsystem
// queues untouched.
// ============================================================================
export interface MetaCronEntry { path: string; schedule: string; group: string }

export const META_WORKER_CRONS: readonly MetaCronEntry[] = [
  { path: "/api/cron/meta-dispatch-fast", schedule: "* * * * *", group: "dispatch-fast" },
  { path: "/api/cron/meta-dispatch-standard", schedule: "*/3 * * * *", group: "dispatch-standard" },
  { path: "/api/cron/meta-dispatch-slow", schedule: "*/10 * * * *", group: "dispatch-slow" },
  { path: "/api/cron/meta-recover", schedule: "*/15 * * * *", group: "recover-all" },
];
