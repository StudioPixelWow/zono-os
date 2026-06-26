"use client";
// ============================================================================
// ZONO Realtime — property events/alerts → debounced refresh. Subscribes to the
// org-scoped property_alerts + zono_orchestrator_runs and calls `onChange` at
// most once per 3s burst, with a 30s polling fallback when realtime is down.
// ============================================================================
import { useCallback, useEffect, useRef } from "react";
import { useZonoRealtime } from "./useZonoRealtime";
import { ZONO_REFRESH_SUBS, zonoRealtimeChannel } from "./channels";

export function usePropertyEventsRealtime(orgId: string | null, onChange: () => void) {
  // Hold the latest onChange in a ref, updated in an effect (not during render).
  const cbRef = useRef(onChange);
  useEffect(() => { cbRef.current = onChange; });
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce: collapse a burst of realtime rows into a single onChange call.
  const debounced = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => { pending.current = null; cbRef.current(); }, 3000);
  }, []);

  useZonoRealtime(orgId, ZONO_REFRESH_SUBS, debounced, {
    channelName: orgId ? zonoRealtimeChannel(orgId) : "zono_realtime:none",
    pollMs: 30_000,
    onPoll: debounced,
  });
}
