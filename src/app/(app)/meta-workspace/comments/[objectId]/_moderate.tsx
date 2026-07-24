// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Comment moderation control. Phase 1 (client, RTL).
// Requests an APPROVAL-GATED moderation action (reply/hide/delete). It never
// executes anything itself — it POSTs to the server, which creates a pending
// action for a privileged approver. No token/provider call ever touches the browser.
// ============================================================================
"use client";
import { useState } from "react";

export function ModerateControl({ commentId, isHidden }: { commentId: string; isHidden: boolean }) {
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(actionKind: string, replyText?: string) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/meta/engagement/comments/${commentId}/moderate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actionKind, replyText }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? "נשלח לאישור" : `שגיאה: ${data?.error ?? "נכשל"}`);
    } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="כתיבת תגובה…" className="min-w-[12rem] flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
        <button disabled={busy || !reply.trim()} onClick={() => act("reply", reply)} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:bg-gray-300">השב</button>
        <button disabled={busy} onClick={() => act(isHidden ? "unhide" : "hide")} className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700">{isHidden ? "הצג" : "הסתר"}</button>
        <button disabled={busy} onClick={() => act("delete")} className="rounded border border-red-300 px-3 py-1 text-sm text-red-700">מחק</button>
      </div>
      {msg && <p className="mt-1 text-xs text-gray-600">{msg}</p>}
      <p className="mt-1 text-xs text-gray-400">כל פעולה דורשת אישור מנהל לפני ביצוע. אין ביצוע אוטומטי.</p>
    </div>
  );
}
