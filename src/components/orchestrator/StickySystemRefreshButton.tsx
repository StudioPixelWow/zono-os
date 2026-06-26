"use client";
// ============================================================================
// ZONO — global sticky "רענן מערכת" button + live freshness indicator.
// Fixed to the (physical) left of the authenticated app, it manually runs the
// FULL orchestrator (bridge → snapshots → decision brain → events → alerts →
// revalidation) AND shows a small live system-health line: when the system was
// last updated, how many unread alerts exist, and whether a run is active.
// Premium purple, RTL-safe, mobile-friendly (icon-only on small screens).
// Respects the per-org lock: double-clicks / an active run → "כבר מתבצע".
// ============================================================================
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Check, TriangleAlert, X, Loader2 } from "lucide-react";
import { runManualSystemRefreshAction } from "@/lib/orchestrator/actions";
import { unreadAlertsLabel } from "@/lib/orchestrator/status";
import { useCurrentOrganization } from "@/components/dashboard/DashboardDataProvider";
import { useSystemRefreshStatus } from "@/lib/realtime";

type Phase = "idle" | "running" | "success" | "partial" | "failed" | "skipped";

const MESSAGES: Record<Exclude<Phase, "idle" | "running">, string> = {
  success: "המערכת רועננה בהצלחה",
  partial: "הרענון הושלם חלקית — כדאי לבדוק דוח",
  failed: "הרענון נכשל — נסה שוב",
  skipped: "רענון כבר מתבצע",
};

export function StickySystemRefreshButton() {
  const router = useRouter();
  const org = useCurrentOrganization();
  const { status, refetch } = useSystemRefreshStatus(org?.id ?? null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [toast, setToast] = useState<string | null>(null);
  const busyRef = useRef(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async () => {
    if (busyRef.current) return; // prevent double-submit
    busyRef.current = true;
    setPhase("running"); setToast(null);
    if (resetRef.current) clearTimeout(resetRef.current);
    try {
      const r = await runManualSystemRefreshAction();
      const next: Phase =
        r.status === "success" ? "success"
        : r.status === "partial" ? "partial"
        : r.status === "skipped" ? "skipped"
        : "failed";
      setPhase(next);
      // Richer toast on success when events/alerts were produced.
      if ((next === "success" || next === "partial") && ((r.newProperties ?? 0) > 0 || (r.alertsCreated ?? 0) > 0)) {
        setToast(`נמצאו ${r.newProperties ?? 0} אירועים חדשים · נוצרו ${r.alertsCreated ?? 0} התראות`);
      } else {
        setToast(MESSAGES[next]);
      }
      if (next === "success" || next === "partial") router.refresh();
    } catch {
      setPhase("failed"); setToast(MESSAGES.failed);
    } finally {
      busyRef.current = false;
      void refetch(); // pull the fresh freshness/alert status right after the run
      resetRef.current = setTimeout(() => { setPhase("idle"); setToast(null); }, 4000);
    }
  }, [router, refetch]);

  const running = phase === "running" || status.isRunning;
  const statusDot =
    phase === "running" ? <Loader2 className="zono-sysrefresh-spin" size={14} aria-hidden="true" />
    : phase === "success" ? <Check size={14} aria-hidden="true" />
    : phase === "partial" ? <TriangleAlert size={14} aria-hidden="true" />
    : phase === "failed" ? <X size={14} aria-hidden="true" />
    : null;

  // Secondary line: running → "מתעדכנת"; else unread alerts → count; else freshness.
  const alertsText = unreadAlertsLabel(status.unreadAlertsCount);
  const secondary = running ? "המערכת מתעדכנת" : alertsText ?? status.freshnessLabel;

  const mainLabel = running ? "מרענן…" : phase === "skipped" ? "כבר מתבצע" : "רענן מערכת";
  const ariaLabel = `רענן מערכת, ${secondary}`;
  // Drives the subtle accent on the indicator (calm / warning / alerts).
  const indicatorState: string =
    running ? "running"
    : status.lastStatus === "failed" ? "failed"
    : status.lastStatus === "partial" ? "partial"
    : alertsText ? "alerts"
    : "fresh";

  return (
    <div className="zono-sysrefresh-wrap" data-phase={phase} data-status={indicatorState}>
      {toast && <div className="zono-sysrefresh-toast" role="status">{toast}</div>}
      <button
        type="button"
        className="zono-sysrefresh"
        onClick={run}
        disabled={running}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <span className="zono-sysrefresh-icon">
          <RefreshCw className={running ? "zono-sysrefresh-spin" : ""} size={18} aria-hidden="true" />
          {alertsText && !running && (
            <span className="zono-sysrefresh-badge" aria-hidden="true">
              {status.unreadAlertsCount > 9 ? "9+" : status.unreadAlertsCount}
            </span>
          )}
        </span>
        <span className="zono-sysrefresh-text">
          <span className="zono-sysrefresh-label">{mainLabel}</span>
          <span className="zono-sysrefresh-sub">{secondary}</span>
        </span>
        {statusDot && <span className="zono-sysrefresh-status">{statusDot}</span>}
      </button>
    </div>
  );
}
