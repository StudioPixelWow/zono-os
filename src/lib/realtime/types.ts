// ============================================================================
// ZONO Realtime — shared types (client-safe).
// ============================================================================

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

/** One table subscription. `orgColumn` makes it org-scoped (required for safety). */
export interface RealtimeTableSub {
  table: string;
  event?: RealtimeEvent;
  /** Column to filter by org (e.g. "org_id" / "organization_id"). Omit only for
   *  tables with no org column — but we deliberately DON'T subscribe to those. */
  orgColumn: string;
}

export type OrchestratorLiveStatus = "running" | "success" | "partial" | "failed" | "skipped" | null;
