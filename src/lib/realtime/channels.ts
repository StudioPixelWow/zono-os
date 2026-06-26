// ============================================================================
// ZONO Realtime — channel naming + the org-scoped subscription set.
//
// Only ORG-SCOPED tables are subscribed (filtered by org column + RLS), so a
// client never receives another organization's rows:
//   • property_alerts          (org_id)         → new alert → popup + refresh
//   • zono_orchestrator_runs   (organization_id)→ run status changes
//
// market_property_events / market_property_sources are SHARED-cache tables with
// NO org column, so they cannot be org-filtered — we don't subscribe to them.
// Their user-visible effect (a price-drop / new-property alert + the run record)
// is already captured by the two org-scoped tables above.
// ============================================================================
import type { RealtimeTableSub } from "./types";

export const zonoRealtimeChannel = (orgId: string) => `zono_realtime:${orgId}`;
export const orchestratorRealtimeChannel = (orgId: string) => `zono_orch_realtime:${orgId}`;

export const ZONO_REFRESH_SUBS: RealtimeTableSub[] = [
  { table: "property_alerts", event: "INSERT", orgColumn: "org_id" },
  { table: "property_alerts", event: "UPDATE", orgColumn: "org_id" },
  { table: "zono_orchestrator_runs", event: "*", orgColumn: "organization_id" },
];

export const ORCHESTRATOR_RUN_SUBS: RealtimeTableSub[] = [
  { table: "zono_orchestrator_runs", event: "*", orgColumn: "organization_id" },
];
