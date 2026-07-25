// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Inbox conversation actions. Phase 3 (client, RTL).
// Applies LOCAL state changes (read/unread/archive/resolve/reopen/snooze/assign/
// label) by POSTing to the server, which role-gates and persists them. These never
// touch Meta — there is no provider call, token, or approval involved. Assign/label
// controls appear only when the caller holds the matching role.
// ============================================================================
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  conversationId: string; status: string; unread: boolean; assigneeUserId: string | null;
  currentUserId: string | null; labels: { id: string; name: string }[]; canManage: boolean; canAssign: boolean;
};

export function InboxActions({ conversationId, status, unread, assigneeUserId, currentUserId, labels, canManage, canAssign }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [labelId, setLabelId] = useState(labels[0]?.id ?? "");

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/meta/inbox/conversations/${conversationId}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? "בוצע" : `שגיאה: ${data?.error ?? "נכשל"}`);
      if (res.ok) router.refresh();
    } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); }
  }

  const snooze = () => { const until = new Date(Date.now() + 24 * 3600_000).toISOString(); act("snooze", { snoozedUntil: until }); };
  const assignedToMe = !!assigneeUserId && assigneeUserId === currentUserId;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => act(unread ? "mark_read" : "mark_unread")} className="rounded border border-gray-300 px-3 py-1 text-sm">{unread ? "סמן כנקרא" : "סמן כלא נקרא"}</button>
        {canManage && status !== "archived" && <button disabled={busy} onClick={() => act("archive")} className="rounded border border-gray-300 px-3 py-1 text-sm">העבר לארכיון</button>}
        {canManage && status === "archived" && <button disabled={busy} onClick={() => act("unarchive")} className="rounded border border-gray-300 px-3 py-1 text-sm">הוצא מארכיון</button>}
        {canManage && status !== "resolved" && <button disabled={busy} onClick={() => act("resolve")} className="rounded border border-green-300 px-3 py-1 text-sm text-green-700">סמן כנסגר</button>}
        {canManage && status !== "open" && <button disabled={busy} onClick={() => act("reopen")} className="rounded border border-gray-300 px-3 py-1 text-sm">פתח מחדש</button>}
        {canManage && status !== "archived" && <button disabled={busy} onClick={snooze} className="rounded border border-gray-300 px-3 py-1 text-sm">דחה ל‑24 שעות</button>}
      </div>

      {canAssign && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
          <span className="text-sm text-gray-600">שיוך:</span>
          {!assignedToMe && currentUserId && <button disabled={busy} onClick={() => act("assign", { assigneeUserId: currentUserId })} className="rounded bg-blue-600 px-3 py-1 text-sm text-white">שייך אליי</button>}
          {assigneeUserId && <button disabled={busy} onClick={() => act("unassign")} className="rounded border border-gray-300 px-3 py-1 text-sm">בטל שיוך</button>}
          {!assigneeUserId && <span className="text-xs text-gray-400">לא משויך</span>}
        </div>
      )}

      {canManage && labels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
          <span className="text-sm text-gray-600">תווית:</span>
          <select value={labelId} onChange={(e) => setLabelId(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">{labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <button disabled={busy || !labelId} onClick={() => act("add_label", { labelId })} className="rounded border border-amber-300 px-3 py-1 text-sm text-amber-800">הוסף</button>
          <button disabled={busy || !labelId} onClick={() => act("remove_label", { labelId })} className="rounded border border-gray-300 px-3 py-1 text-sm">הסר</button>
        </div>
      )}
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
      <p className="text-xs text-gray-400">כל הפעולות מקומיות (סטטוס/קריאה/שיוך/תווית) ואינן נשלחות ל‑Meta.</p>
    </div>
  );
}
