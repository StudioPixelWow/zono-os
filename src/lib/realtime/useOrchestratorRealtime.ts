"use client";
// ============================================================================
// ZONO Realtime — orchestrator run status. Reflects running/success/partial/
// failed/skipped for the org's latest run, live.
// ============================================================================
import { useState } from "react";
import { useZonoRealtime } from "./useZonoRealtime";
import { ORCHESTRATOR_RUN_SUBS, orchestratorRealtimeChannel } from "./channels";
import type { OrchestratorLiveStatus } from "./types";

export function useOrchestratorRealtime(orgId: string | null): OrchestratorLiveStatus {
  const [status, setStatus] = useState<OrchestratorLiveStatus>(null);
  useZonoRealtime(
    orgId,
    ORCHESTRATOR_RUN_SUBS,
    (signal) => {
      const s = signal.row?.status;
      if (typeof s === "string") setStatus(s as OrchestratorLiveStatus);
    },
    { channelName: orgId ? orchestratorRealtimeChannel(orgId) : "zono_orch_realtime:none" },
  );
  return status;
}
