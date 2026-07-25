// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Messaging thread + compose. Phase 6 (client, RTL).
// Fetches decrypted messages (server-authorized), shows the 24h-window indicator,
// offers a Copilot DRAFT, and creates an APPROVAL-GATED send. Approving (privileged
// role) releases a SINGLE server-side provider write via the queue — the browser
// NEVER calls Meta, and nothing auto-sends. Outside the window, a supported Meta
// policy tag is required (surfaced in the UI).
// ============================================================================
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Msg = { id: string; direction: string; body: string; policyTag: string | null; deliveryState: string | null; providerCreatedAt: string | null };
type Send = { id: string; approvalState: string; status: string; windowState: string; safeErrorKind: string | null };

export function MessagingFilters() {
  const router = useRouter(); const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const set = (patch: Record<string, string | null>) => { const u = new URLSearchParams(params.toString()); for (const [k, v] of Object.entries(patch)) { if (!v) u.delete(k); else u.set(k, v); } u.delete("offset"); router.push(`?${u.toString()}`); };
  const get = (k: string) => params.get(k) ?? "";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select value={get("platform")} onChange={(e) => set({ platform: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">כל הפלטפורמות</option><option value="facebook">מסנג׳ר</option><option value="instagram">אינסטגרם</option></select>
      <select value={get("status")} onChange={(e) => set({ status: e.target.value || null })} className="rounded border border-gray-300 px-2 py-1 text-sm"><option value="">כל הסטטוסים</option><option value="open">פתוח</option><option value="assigned">שויך</option><option value="snoozed">נדחה</option><option value="resolved">נסגר</option></select>
      <label className="flex items-center gap-1 text-sm text-gray-600"><input type="checkbox" checked={get("unread") === "1"} onChange={(e) => set({ unread: e.target.checked ? "1" : null })} /> לא נקראו</label>
      <form onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || null }); }} className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש משתתף…" className="rounded border border-gray-300 px-2 py-1 text-sm" /><button className="rounded bg-gray-800 px-3 py-1 text-sm text-white">חפש</button></form>
    </div>
  );
}

const TAGS = ["", "HUMAN_AGENT", "CONFIRMED_EVENT_UPDATE", "POST_PURCHASE_UPDATE", "ACCOUNT_UPDATE"];

export function MessageThread({ conversationId, windowOpen, participant, canApprove }: { conversationId: string; windowOpen: boolean; participant: string | null; canApprove: boolean }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState<Send[]>([]);
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const res = await fetch(`/api/meta/messaging/conversations/${conversationId}/messages`); const data = await res.json().catch(() => ({})); if (res.ok) setMessages(data.messages ?? []); } catch { /* keep */ }
  }, [conversationId]);
  useEffect(() => { let alive = true; void (async () => { try { const res = await fetch(`/api/meta/messaging/conversations/${conversationId}/messages`); const data = await res.json().catch(() => ({})); if (alive && res.ok) setMessages(data.messages ?? []); } catch { /* keep */ } })(); return () => { alive = false; }; }, [conversationId]);

  async function draft() { setBusy(true); setMsg(null); try { const res = await fetch(`/api/meta/messaging/conversations/${conversationId}/draft`, { method: "POST" }); const data = await res.json().catch(() => ({})); if (res.ok && data.body) setBody(data.body); else setMsg(`שגיאה: ${data?.error ?? "אין טיוטה"}`); } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); } }
  async function createSend() { setBusy(true); setMsg(null); try { const res = await fetch(`/api/meta/messaging/conversations/${conversationId}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body, policyTag: tag || null }) }); const data = await res.json().catch(() => ({})); if (res.ok) { setMsg(data.note ? `נוצרה טיוטה — ${data.note}` : "נוצרה טיוטה לאישור"); setPending((p) => [...p, data.send]); setBody(""); } else setMsg(`שגיאה: ${data?.error ?? "נכשל"}`); } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); } }
  async function act(url: string) { setBusy(true); setMsg(null); try { const res = await fetch(url, { method: "POST" }); const data = await res.json().catch(() => ({})); setMsg(res.ok ? "בוצע" : `שגיאה: ${data?.error ?? "נכשל"}`); if (res.ok) { await load(); router.refresh(); } } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); } }

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold">{participant ?? "משתמש"}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${windowOpen ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>{windowOpen ? "חלון 24 שעות פתוח" : "מחוץ לחלון — נדרשת תגית מדיניות"}</span>
      </div>
      <ul className="mb-3 max-h-80 space-y-2 overflow-y-auto">
        {messages.length === 0 && <li className="text-center text-xs text-gray-400">אין הודעות עדיין. ניתן לסנכרן מהכפתור.</li>}
        {messages.map((m) => (
          <li key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === "outbound" ? "ml-auto bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
            <p className="whitespace-pre-wrap">{m.body || "—"}</p>
            <span className={`mt-1 block text-[10px] ${m.direction === "outbound" ? "text-blue-100" : "text-gray-400"}`}>{m.providerCreatedAt ? new Date(m.providerCreatedAt).toLocaleString("he-IL") : ""}{m.policyTag ? ` · ${m.policyTag}` : ""}{m.deliveryState ? ` · ${m.deliveryState}` : ""}</span>
          </li>
        ))}
      </ul>
      <button disabled={busy} onClick={() => act(`/api/meta/messaging/conversations/${conversationId}/sync`)} className="mb-2 rounded border border-gray-300 px-3 py-1 text-xs">סנכרן הודעות</button>

      <div className="rounded-lg border border-gray-200 p-2">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="כתיבת תשובה (דורשת אישור לפני שליחה)…" className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button disabled={busy} onClick={draft} className="rounded border border-indigo-300 px-3 py-1 text-xs text-indigo-700">טיוטת Copilot</button>
          {!windowOpen && (
            <select value={tag} onChange={(e) => setTag(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">{TAGS.map((t) => <option key={t} value={t}>{t || "בחר תגית מדיניות"}</option>)}</select>
          )}
          <button disabled={busy || !body.trim()} onClick={createSend} className="rounded bg-gray-800 px-3 py-1 text-xs text-white disabled:bg-gray-300">צור טיוטה לאישור</button>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">אין שליחה אוטומטית. כל הודעה יוצאת נשלחת רק לאחר אישור מפורש, בכפוף לחלון 24 השעות ולתגיות המדיניות של Meta.</p>
      </div>

      {pending.length > 0 && (
        <ul className="mt-3 space-y-2">
          {pending.map((s) => (
            <li key={s.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-2 text-xs">
              טיוטה #{s.id.slice(0, 6)} · {s.status}{s.safeErrorKind ? ` · ${s.safeErrorKind}` : ""}
              {s.status !== "manual_review" && canApprove && <button disabled={busy} onClick={() => act(`/api/meta/messaging/sends/${s.id}/approve`)} className="mr-2 rounded bg-green-600 px-2 py-0.5 text-white">אשר ושלח</button>}
              <button disabled={busy} onClick={() => act(`/api/meta/messaging/sends/${s.id}/reject`)} className="mr-2 rounded border border-gray-300 px-2 py-0.5">דחה</button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
