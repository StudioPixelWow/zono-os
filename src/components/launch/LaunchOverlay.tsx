"use client";
// ============================================================================
// ZONO — global launch overlay (Phase 21). Renders the Beta banner (when the
// org/user is enrolled) and a floating Feedback button + modal. The feedback
// envelope (browser, app version, role, page, correlation id) is captured
// automatically; the role is re-stamped server-side. No business content.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { currentVersion, FEEDBACK_TYPES, buildFeedbackContext } from "@/lib/launch";
import { getBetaActiveAction, submitFeedbackAction } from "@/lib/launch/server/actions";
import type { FeedbackType } from "@/lib/launch";

function newCorr(): string { return `corr_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`; }

export function LaunchOverlay() {
  const [beta, setBeta] = useState(false);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => { getBetaActiveAction().then((r) => { if (r.ok) setBeta(r.data.active); }).catch(() => {}); }, []);

  function submit() {
    setMsg(null);
    const ctx = buildFeedbackContext({
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      appVersion: currentVersion(), roleKey: "", page: typeof location !== "undefined" ? location.pathname : "/",
      correlationId: newCorr(),
      viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      locale: typeof navigator !== "undefined" ? navigator.language : undefined,
    });
    start(async () => {
      const r = await submitFeedbackAction({ type, title, body }, ctx);
      if (r.ok) { setMsg("תודה! המשוב נשלח."); setTitle(""); setBody(""); setTimeout(() => { setOpen(false); setMsg(null); }, 1200); }
      else setMsg(r.error);
    });
  }

  return (
    <div dir="rtl">
      {beta && (
        <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500/90 to-orange-500/90 px-3 py-1.5 text-center text-[12px] font-bold text-white shadow">
          <Icon name="Sparkles" size={14} /> מצב Beta — תכונות חדשות בבדיקה. נשמח למשוב שלך.
        </div>
      )}

      {/* Floating feedback button */}
      <button
        onClick={() => setOpen(true)}
        className="bg-brand-strong fixed bottom-5 inset-inline-start-5 z-[55] inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:opacity-90"
        aria-label="שליחת משוב"
      >
        <Icon name="MessageCircle" size={16} /> משוב
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-card border-line w-full max-w-md rounded-[20px] border p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-ink text-base font-black">שליחת משוב</h2>
              <button onClick={() => setOpen(false)} className="text-muted"><Icon name="X" size={18} /></button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              {FEEDBACK_TYPES.map((t) => (
                <button key={t.value} onClick={() => setType(t.value)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold ${type === t.value ? "bg-brand-strong border-brand-strong text-white" : "bg-surface text-ink border-line"}`}>
                  <Icon name={t.icon} size={14} /> {t.label}
                </button>
              ))}
            </div>

            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת קצרה" className="bg-surface border-line text-ink mb-2 w-full rounded-xl border px-3 py-2 text-sm" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="תיאור (לא לכלול פרטים אישיים של לקוחות)" rows={4} className="bg-surface border-line text-ink mb-3 w-full rounded-xl border px-3 py-2 text-sm" />

            {msg && <p className="text-muted mb-2 text-center text-xs font-semibold">{msg}</p>}
            <p className="text-muted mb-3 text-[11px]">נצרף אוטומטית: דפדפן, גרסה, תפקיד, הדף הנוכחי ומזהה מעקב — ללא תוכן עסקי.</p>

            <button onClick={submit} disabled={pending} className="bg-brand-strong w-full rounded-xl px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {pending ? "שולח…" : "שליחה"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
