// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Inbox intelligence panel. Phase 4 (client, RTL).
// ADDITIVE panel over the Phase-3 conversation detail — it does NOT change the
// conversation's canonical semantics. Shows the sentiment / intent / urgency /
// confidence badges, last-scored time, next-best-action cards with a reviewable
// reply preview, and manual rescore + accept/dismiss controls. Every action POSTs
// to the server; the browser never calls a model or Meta. AI output is a suggestion.
// ============================================================================
"use client";
import { useCallback, useEffect, useState } from "react";

type Signal = { id: string; sentiment: string; sentimentScore: number; intent: string; urgency: string; confidence: number; modelProviderSafe: string | null; processingState: string; computedAt: string } | null;
type Suggestion = { id: string; actionKind: string; rationaleSafe: string; hasDraft: boolean; confidence: number; status: string };
type Intelligence = { conversationId: string; current: Signal; suggestions: Suggestion[]; history: unknown[]; unavailableReason: string | null };

const SENTIMENT_LABEL: Record<string, string> = { negative: "שלילי", neutral: "ניטרלי", positive: "חיובי", mixed: "מעורב", unknown: "לא ידוע" };
const URGENCY_LABEL: Record<string, string> = { low: "נמוכה", normal: "רגילה", high: "גבוהה", critical: "קריטית" };
const INTENT_LABEL: Record<string, string> = { lead: "ליד", pricing_question: "שאלת מחיר", availability_question: "שאלת זמינות", project_question: "שאלת פרויקט", general_question: "שאלה כללית", complaint: "תלונה", escalation: "הסלמה", support_request: "בקשת תמיכה", spam: "ספאם", praise: "מחמאה", feedback: "משוב", unrelated: "לא רלוונטי", unknown: "לא ידוע" };
const ACTION_LABEL: Record<string, string> = { suggest_reply: "הצע תשובה", request_human_review: "בדיקה אנושית", escalate: "הסלם", route_to_sales: "נתב למכירות", route_to_support: "נתב לתמיכה", prepare_moderation_action: "הכן פעולת ניהול", ignore: "התעלם", mark_spam_candidate: "סמן כספאם", no_action: "אין פעולה" };
const URGENCY_COLOR: Record<string, string> = { low: "bg-gray-100 text-gray-600", normal: "bg-blue-100 text-blue-700", high: "bg-amber-100 text-amber-800", critical: "bg-red-100 text-red-700" };
const SENTIMENT_COLOR: Record<string, string> = { negative: "bg-red-100 text-red-700", neutral: "bg-gray-100 text-gray-600", positive: "bg-green-100 text-green-700", mixed: "bg-purple-100 text-purple-700", unknown: "bg-gray-100 text-gray-500" };

export function InboxIntelligence({ conversationId, canManage }: { conversationId: string; canManage: boolean }) {
  const [intel, setIntel] = useState<Intelligence | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<{ tone: string; body: string }[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/meta/inbox/conversations/${conversationId}/intelligence`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setIntel(data.intelligence);
    } catch { /* keep prior */ }
  }, [conversationId]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/meta/inbox/conversations/${conversationId}/intelligence`);
        const data = await res.json().catch(() => ({}));
        if (alive && res.ok) setIntel(data.intelligence);
      } catch { /* keep prior */ }
    })();
    return () => { alive = false; };
  }, [conversationId]);

  async function rescore() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/meta/inbox/conversations/${conversationId}/intelligence/rescore`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? "בקשת ניתוח מחדש נשלחה לתור" : `שגיאה: ${data?.error ?? "נכשל"}`);
    } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); }
  }
  async function accept(id: string) {
    setBusy(true); setMsg(null); setDrafts(null);
    try {
      const res = await fetch(`/api/meta/intelligence/suggestions/${id}/accept`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setMsg("ההצעה אושרה ונותבה לתהליך הקיים (טיוטה/אישור/ניתוב)"); if (data.draft) setDrafts(data.draft); await load(); }
      else setMsg(`שגיאה: ${data?.error ?? "נכשל"}`);
    } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); }
  }
  async function dismiss(id: string) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/meta/intelligence/suggestions/${id}/dismiss`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setMsg("ההצעה נדחתה"); await load(); } else setMsg(`שגיאה: ${data?.error ?? "נכשל"}`);
    } catch { setMsg("שגיאת רשת"); } finally { setBusy(false); }
  }

  const cur = intel?.current ?? null;
  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-indigo-900">בינת מעורבות</h2>
        {canManage && <button disabled={busy} onClick={rescore} className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 disabled:opacity-50">נתח מחדש</button>}
      </div>

      {!cur ? (
        <p className="text-xs text-gray-500">{intel?.unavailableReason === "not_scored_yet" ? "השיחה עדיין לא נותחה. הניתוח יתבצע אוטומטית או בלחיצה על “נתח מחדש”." : "אין נתוני בינה זמינים."}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${SENTIMENT_COLOR[cur.sentiment] ?? "bg-gray-100"}`}>רגש: {SENTIMENT_LABEL[cur.sentiment] ?? cur.sentiment}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-200">כוונה: {INTENT_LABEL[cur.intent] ?? cur.intent}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${URGENCY_COLOR[cur.urgency] ?? "bg-gray-100"}`}>דחיפות: {URGENCY_LABEL[cur.urgency] ?? cur.urgency}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500 ring-1 ring-gray-200">ביטחון {cur.confidence}%</span>
          </div>
          <p className="mt-2 text-xs text-gray-400">נותח: {cur.computedAt ? new Date(cur.computedAt).toLocaleString("he-IL") : "—"}{cur.modelProviderSafe ? ` · מקור: ${cur.modelProviderSafe}` : ""}</p>
        </>
      )}

      {intel && intel.suggestions.length > 0 && (
        <ul className="mt-3 space-y-2">
          {intel.suggestions.map((s) => (
            <li key={s.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{ACTION_LABEL[s.actionKind] ?? s.actionKind}{s.hasDraft ? " · טיוטה מוכנה" : ""}</span>
                <span className="text-xs text-gray-400">ביטחון {s.confidence}%</span>
              </div>
              {s.rationaleSafe && <p className="mt-1 text-xs text-gray-600">{s.rationaleSafe}</p>}
              {canManage && (
                <div className="mt-2 flex gap-2">
                  <button disabled={busy} onClick={() => accept(s.id)} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:bg-gray-300">אשר</button>
                  <button disabled={busy} onClick={() => dismiss(s.id)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600">דחה</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {drafts && drafts.length > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          <p className="mb-1 text-xs font-medium text-emerald-800">טיוטת תשובה לאישור (אינה נשלחת אוטומטית):</p>
          {drafts.map((d, i) => (<p key={i} className="mt-1 whitespace-pre-wrap text-sm text-gray-800">[{d.tone}] {d.body}</p>))}
          <p className="mt-1 text-[11px] text-emerald-700">הטיוטה נוצרה על ידי ה-Copilot הקיים ודורשת אישור לפני שליחה.</p>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
