"use client";
// ============================================================================
// ZONO — global sticky "רענן מערכת" button. Fixed to the (physical) left of the
// authenticated app, it manually runs the FULL orchestrator (bridge → snapshots
// → decision brain → events → alerts → revalidation). Premium purple, RTL-safe,
// mobile-friendly (icon-only on small screens). Respects the per-org lock:
// double-clicks / an active run yield a "כבר מתבצע" state, never a duplicate run.
// ============================================================================
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Check, TriangleAlert, X, Loader2 } from "lucide-react";
import { runManualSystemRefreshAction } from "@/lib/orchestrator/actions";

type Phase = "idle" | "running" | "success" | "partial" | "failed" | "skipped";

const MESSAGES: Record<Exclude<Phase, "idle" | "running">, string> = {
  success: "המערכת רועננה בהצלחה",
  partial: "הרענון הושלם חלקית — כדאי לבדוק דוח",
  failed: "הרענון נכשל — נסה שוב",
  skipped: "רענון כבר מתבצע",
};

export function StickySystemRefreshButton() {
  const router = useRouter();
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
      resetRef.current = setTimeout(() => { setPhase("idle"); setToast(null); }, 4000);
    }
  }, [router]);

  const running = phase === "running";
  const statusDot =
    phase === "running" ? <Loader2 className="zono-sysrefresh-spin" size={14} aria-hidden="true" />
    : phase === "success" ? <Check size={14} aria-hidden="true" />
    : phase === "partial" ? <TriangleAlert size={14} aria-hidden="true" />
    : phase === "failed" ? <X size={14} aria-hidden="true" />
    : null;

  return (
    <div className="zono-sysrefresh-wrap" data-phase={phase}>
      {toast && <div className="zono-sysrefresh-toast" role="status">{toast}</div>}
      <button
        type="button"
        className="zono-sysrefresh"
        onClick={run}
        disabled={running}
        aria-label="רענן מערכת"
        title="רענן מערכת"
      >
        <RefreshCw className={running ? "zono-sysrefresh-spin" : ""} size={18} aria-hidden="true" />
        <span className="zono-sysrefresh-label">{running ? "מרענן…" : phase === "skipped" ? "כבר מתבצע" : "רענן מערכת"}</span>
        {statusDot && <span className="zono-sysrefresh-status">{statusDot}</span>}
      </button>
    </div>
  );
}
