// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Insight refresh control. Phase 2 (client, RTL).
// Enqueues a bounded refresh for a post's insights. It never calls the provider —
// it POSTs to the server, which schedules a durable refresh job (capability-gated).
// ============================================================================
"use client";
import { useState } from "react";

export function RefreshInsights({ objectId, platform }: { objectId: string; platform: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/meta/insights/objects/${objectId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? "רענון תוזמן" : `שגיאה: ${data?.error ?? "נכשל"}`);
    } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); }
  }
  return (
    <div className="flex items-center gap-2">
      <button disabled={busy} onClick={go} className="rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:opacity-50">רענן נתונים</button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
