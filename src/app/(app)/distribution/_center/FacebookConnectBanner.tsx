"use client";
// ============================================================================
// ZONO — Facebook "not connected" banner (Phase 10.3). Shown in the Distribution
// Center while there is no live Meta API connection (always, in this phase). It
// points the agent to the Connection Center and to the Manual Publish Assistant.
// Reads the real connection state — never assumes/fakes "connected".
// ============================================================================
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getDistributionConnectionsAction } from "@/lib/distribution/provider-connections-actions";

export function FacebookConnectBanner({ onOpenAssistant }: { onOpenAssistant?: () => void }) {
  // Default to showing the banner (FB is not API-connected in this phase); hide
  // only if a real "connected" API state is ever found.
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let alive = true;
    getDistributionConnectionsAction()
      .then((rows) => {
        if (!alive) return;
        const fb = rows.find((r) => r.provider === "facebook");
        setConnected(fb?.status === "connected" && fb?.connectionMode === "api");
      })
      .catch(() => { /* keep banner visible on error */ });
    return () => { alive = false; };
  }, []);

  if (connected) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <Icon name="AlertTriangle" size={18} className="shrink-0" />
        פייסבוק עדיין לא מחובר. ניתן להשתמש כרגע במסייע פרסום ידני.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/settings/distribution-connections"
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-amber-800 shadow-sm transition hover:brightness-95">
          <Icon name="Send" size={14} /> עבור לחיבורי הפצה
        </Link>
        {onOpenAssistant ? (
          <button type="button" onClick={onOpenAssistant}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 px-3 py-1.5 text-sm font-bold text-amber-800 transition hover:bg-amber-100">
            <Icon name="ShieldCheck" size={14} /> פתח מסייע פרסום ידני
          </button>
        ) : (
          <Link href="/distribution"
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 px-3 py-1.5 text-sm font-bold text-amber-800 transition hover:bg-amber-100">
            <Icon name="ShieldCheck" size={14} /> פתח מסייע פרסום ידני
          </Link>
        )}
      </div>
    </div>
  );
}
