// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Listening controls. Phase 5 (client, RTL).
// Filters drive the URL (server re-queries with the same predicates the pure `feed`
// module defines). Source config (create/enable/disable) + refresh POST to the
// server, which role/capability-gates and enqueues work only — the browser NEVER
// calls Meta. Mention status/project actions are local + audited (no provider write).
// ============================================================================
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type SourceLite = { id: string; label: string; enabled: boolean; capabilityState: string; lastSyncStatus: string; safeBlockReason: string | null };

export function ListeningControls({ sources, canConfigure, canRefresh }: { sources: SourceLite[]; canConfigure: boolean; canRefresh: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Record<string, string | null>) => { const u = new URLSearchParams(params.toString()); for (const [k, v] of Object.entries(patch)) { if (!v) u.delete(k); else u.set(k, v); } u.delete("offset"); start(() => router.push(`?${u.toString()}`)); };
  const get = (k: string) => params.get(k) ?? "";

  async function post(url: string, body?: unknown) { setBusy(true); setMsg(null); try { const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const data = await res.json().catch(() => ({})); setMsg(res.ok ? "בוצע" : `שגיאה: ${data?.error ?? "נכשל"}`); if (res.ok) start(() => router.refresh()); } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); } }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={get("source")} onChange={(e) => set({ source: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="">כל המקורות</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={get("platform")} onChange={(e) => set({ platform: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">כל הפלטפורמות</option><option value="facebook">פייסבוק</option><option value="instagram">אינסטגרם</option></select>
        <select value={get("match")} onChange={(e) => set({ match: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">הכל</option><option value="matched">משויך</option><option value="unmatched">לא משויך</option></select>
        <select value={get("status")} onChange={(e) => set({ status: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">כל הסטטוסים</option><option value="new">חדש</option><option value="reviewed">נבדק</option><option value="actionable">לטיפול</option><option value="ignored">בוטל</option><option value="resolved">נסגר</option></select>
        <select value={get("sentiment")} onChange={(e) => set({ sentiment: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">כל הרגשות</option><option value="negative">שלילי</option><option value="neutral">ניטרלי</option><option value="positive">חיובי</option><option value="mixed">מעורב</option></select>
        <select value={get("urgency")} onChange={(e) => set({ urgency: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">כל הדחיפויות</option><option value="low">נמוכה</option><option value="normal">רגילה</option><option value="high">גבוהה</option><option value="critical">קריטית</option></select>
        <select value={get("sort")} onChange={(e) => set({ sort: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="recent">חדש ביותר</option><option value="oldest">ישן ביותר</option></select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={get("since")} onChange={(e) => set({ since: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        <input type="date" value={get("until")} onChange={(e) => set({ until: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        <form onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || null }); }} className="flex flex-1 gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי מחבר או תוכן…" className="min-w-[10rem] flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-gray-800 px-3 py-1 text-sm text-white">חפש</button>
        </form>
      </div>
      {(canConfigure || canRefresh) && sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2 text-sm">
          <span className="text-gray-600">מקורות:</span>
          {sources.map((s) => (
            <span key={s.id} className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs">
              {s.label} · {s.enabled ? "פעיל" : "כבוי"}{s.capabilityState !== "allowed" ? ` · חסום (${s.capabilityState})` : ""}
              {canConfigure && <button disabled={busy} onClick={() => post(`/api/meta/listening/sources/${s.id}/${s.enabled ? "disable" : "enable"}`)} className="rounded bg-gray-100 px-1.5 py-0.5">{s.enabled ? "כבה" : "הפעל"}</button>}
              {canRefresh && s.enabled && <button disabled={busy} onClick={() => post(`/api/meta/listening/sources/${s.id}/refresh`, { kind: "poll" })} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">רענן</button>}
            </span>
          ))}
        </div>
      )}
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
    </div>
  );
}

export function MentionActions({ id, matched, projected }: { id: string; matched: boolean; projected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function act(url: string, body?: unknown) { setBusy(true); setMsg(null); try { const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const data = await res.json().catch(() => ({})); setMsg(res.ok ? "בוצע" : `שגיאה: ${data?.error ?? "נכשל"}`); if (res.ok) router.refresh(); } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); } }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button disabled={busy} onClick={() => act(`/api/meta/listening/mentions/${id}/status`, { status: "reviewed" })} className="rounded border border-gray-300 px-2 py-1 text-xs">סמן כנבדק</button>
      <button disabled={busy} onClick={() => act(`/api/meta/listening/mentions/${id}/status`, { status: "ignored" })} className="rounded border border-gray-300 px-2 py-1 text-xs">התעלם</button>
      <button disabled={busy} onClick={() => act(`/api/meta/listening/mentions/${id}/status`, { status: "resolved" })} className="rounded border border-green-300 px-2 py-1 text-xs text-green-700">סגור</button>
      {matched && !projected && <button disabled={busy} onClick={() => act(`/api/meta/listening/mentions/${id}/project-to-inbox`)} className="rounded bg-indigo-600 px-2 py-1 text-xs text-white">שלח לתיבת הדואר</button>}
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
