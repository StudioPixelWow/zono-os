// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Inbox filter + sync controls. Phase 3 (client, RTL).
// Filters/sort/search drive the URL (server re-queries with the same predicates the
// pure `search` module defines). The sync button POSTs to enqueue a bounded inbox
// sync (local projection) — it never calls Meta from the browser.
// ============================================================================
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function InboxFilters({ labels }: { labels: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") u.delete(k); else u.set(k, v); }
    u.delete("offset"); // reset paging on any filter change
    start(() => router.push(`?${u.toString()}`));
  };
  const get = (k: string) => params.get(k) ?? "";

  async function sync(platform: string) {
    setBusy(true); setSyncMsg(null);
    try {
      const res = await fetch(`/api/meta/inbox/conversations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform }) });
      const data = await res.json().catch(() => ({}));
      setSyncMsg(res.ok ? "סנכרון נוסף לתור" : `שגיאה: ${data?.error ?? "נכשל"}`);
      if (res.ok) start(() => router.refresh());
    } catch { setSyncMsg("שגיאת רשת"); } finally { setBusy(false); }
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={get("status")} onChange={(e) => set({ status: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="">כל הסטטוסים</option><option value="open">פתוח</option><option value="snoozed">נדחה</option><option value="archived">בארכיון</option><option value="resolved">נסגר</option>
        </select>
        <select value={get("platform")} onChange={(e) => set({ platform: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="">כל הפלטפורמות</option><option value="facebook">פייסבוק</option><option value="instagram">אינסטגרם</option>
        </select>
        <select value={get("assignee")} onChange={(e) => set({ assignee: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="">כל השיוכים</option><option value="me">שויך אליי</option><option value="none">לא משויך</option>
        </select>
        {labels.length > 0 && (
          <select value={get("label")} onChange={(e) => set({ label: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="">כל התוויות</option>{labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <select value={get("sort")} onChange={(e) => set({ sort: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="recent">חדש ביותר</option><option value="oldest">ישן ביותר</option><option value="priority">עדיפות</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={get("unread") === "1"} onChange={(e) => set({ unread: e.target.checked ? "1" : null })} /> לא נקראו בלבד
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || null }); }} className="flex flex-1 gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי משתתף או תוכן…" className="min-w-[12rem] flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
          <button type="submit" disabled={pending} className="rounded bg-gray-800 px-3 py-1 text-sm text-white disabled:bg-gray-300">חפש</button>
        </form>
        <button disabled={busy} onClick={() => sync("facebook")} className="rounded border border-blue-300 px-3 py-1 text-sm text-blue-700 disabled:opacity-50">סנכרן פייסבוק</button>
        <button disabled={busy} onClick={() => sync("instagram")} className="rounded border border-pink-300 px-3 py-1 text-sm text-pink-700 disabled:opacity-50">סנכרן אינסטגרם</button>
      </div>
      {syncMsg && <p className="text-xs text-gray-600">{syncMsg}</p>}
    </div>
  );
}
