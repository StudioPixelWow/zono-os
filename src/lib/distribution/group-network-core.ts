// ============================================================================
// ZONO — Facebook GROUP NETWORK pure core (P9.8). No server-only, no DB — safe to
// import from tests. Holds the state vocabulary + the reconciliation planner.
// ============================================================================
export type GroupNetworkStatus = "discovered" | "active" | "ignored" | "unavailable";
export const GROUP_STATUS_LABEL: Record<GroupNetworkStatus, string> = {
  discovered: "נמצאה", active: "פעילה", ignored: "מוסתרת", unavailable: "לא זמינה",
};

export interface GroupStateRow { id: string; externalGroupId: string | null; status: string | null; source: string | null }
export interface ReconcilePlan {
  toUnavailable: string[];   // scan-sourced groups no longer seen → mark unavailable (never delete)
  toRestore: string[];       // previously-unavailable groups seen again → restore to discovered
  unchanged: number;
}

/**
 * Decide the reconciliation for a COMPLETE scan batch (P9.8 §A/§B6):
 *  - a scan-sourced group NOT in the seen set → UNAVAILABLE (preserve history, no delete)
 *  - an UNAVAILABLE group seen again → restore to DISCOVERED (agent re-decides)
 *  - ACTIVE / IGNORED choices are PRESERVED even if temporarily missing (never auto-flip
 *    an agent's decision; only 'discovered'/'unavailable'/null auto-manage)
 *  - MANUAL groups (source='manual') are never touched by scan reconciliation
 * Pure: caller supplies the org's current rows + the freshly-seen external ids.
 */
export function planReconcile(current: GroupStateRow[], seenExternalIds: string[]): ReconcilePlan {
  const seen = new Set(seenExternalIds.filter(Boolean));
  const toUnavailable: string[] = [];
  const toRestore: string[] = [];
  let unchanged = 0;
  for (const g of current) {
    const isScan = g.source !== "manual";
    const present = g.externalGroupId ? seen.has(g.externalGroupId) : false;
    const neutral = g.status === "discovered" || g.status === "unavailable" || g.status === null;
    if (isScan && !present && neutral && g.status !== "unavailable") {
      toUnavailable.push(g.id);
    } else if (isScan && present && g.status === "unavailable") {
      toRestore.push(g.id);
    } else {
      unchanged++;
    }
  }
  return { toUnavailable, toRestore, unchanged };
}
