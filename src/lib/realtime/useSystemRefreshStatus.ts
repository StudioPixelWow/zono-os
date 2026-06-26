"use client";
// ============================================================================
// ZONO Realtime — system-refresh freshness status for the sticky button.
// Loads the org's status on mount, re-loads every 30s, exposes refetch() (used
// right after a manual refresh completes), and subscribes (org-scoped, debounced)
// to property_alerts + zono_orchestrator_runs so the small label updates live.
// IMPORTANT: this hook only refetches the tiny status — it NEVER calls
// router.refresh (full-page refresh is owned by ZonoRealtimeProvider).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useZonoRealtime } from "./useZonoRealtime";
import { ZONO_REFRESH_SUBS } from "./channels";
import { getSystemRefreshStatusAction } from "@/lib/orchestrator/actions";
import {
  buildSystemRefreshStatus,
  EMPTY_SYSTEM_REFRESH_STATUS,
  type SystemRefreshStatusResult,
} from "@/lib/orchestrator/status";

const POLL_MS = 30_000;

export function useSystemRefreshStatus(orgId: string | null): {
  status: SystemRefreshStatusResult;
  refetch: () => void;
} {
  const [status, setStatus] = useState<SystemRefreshStatusResult>(EMPTY_SYSTEM_REFRESH_STATUS);
  const inFlight = useRef(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!orgId || inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await getSystemRefreshStatusAction();
      setStatus(next);
    } catch {
      /* keep last known status; action already logs server-side */
    } finally {
      inFlight.current = false;
    }
  }, [orgId]);

  // Initial load + single 30s poll loop (no duplicate loops). When there is no
  // org we simply don't load — the state stays at the safe EMPTY default. The
  // first load is deferred to a microtask so no setState happens during the
  // effect body itself (avoids cascading-render lint + churn).
  useEffect(() => {
    if (!orgId) return;
    const kick = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), POLL_MS);
    return () => { clearTimeout(kick); clearInterval(id); };
  }, [orgId, load]);

  // Re-tick the relative time label locally between polls (no server call), so
  // "עודכן לפני X דק׳" advances smoothly. Recompute from the stored raw fields.
  useEffect(() => {
    if (!orgId) return;
    const id = setInterval(() => {
      setStatus((prev) =>
        buildSystemRefreshStatus(
          {
            lastRunAt: prev.lastRunAt,
            lastStatus: prev.lastStatus,
            lastSuccessAt: prev.lastSuccessAt,
            isRunning: prev.isRunning,
            unreadAlertsCount: prev.unreadAlertsCount,
          },
          Date.now(),
        ),
      );
    }, POLL_MS);
    return () => clearInterval(id);
  }, [orgId]);

  // Debounced realtime → refetch the small status only (never router.refresh).
  const debouncedRefetch = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void load();
    }, 2500);
  }, [load]);

  useZonoRealtime(orgId, ZONO_REFRESH_SUBS, debouncedRefetch, {
    channelName: orgId ? `zono_sysrefresh_status:${orgId}` : "zono_sysrefresh_status:none",
    pollMs: POLL_MS,
    onPoll: debouncedRefetch,
  });

  return { status, refetch: load };
}
