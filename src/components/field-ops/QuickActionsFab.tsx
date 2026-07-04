"use client";
// ============================================================================
// 📱 ZONO Mobile Field Operations™ — Quick Actions FAB (RTL, one-hand). 41.0.
// A thumb-friendly floating action button. Call/WhatsApp deep-link; task/draft/
// note/follow-up REUSE existing approval-gated actions via field-ops delegators.
// ============================================================================
import { useState, useTransition } from "react";
import { fieldCreateTaskAction, fieldCreateDraftAction, fieldLogNoteAction, fieldFollowupAction } from "@/lib/field-ops/actions";

type Composer = "task" | "draft" | "note" | "followup" | null;
const wa = (n: string) => `https://wa.me/${n.replace(/[^0-9]/g, "")}`;

export function QuickActionsFab({ entityType, entityId, phone, whatsapp }: { entityType: string; entityId: string; phone?: string | null; whatsapp?: string | null }) {
  const [open, setOpen] = useState(false);
  const [composer, setComposer] = useState<Composer>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () => {
    if (!text.trim() || !composer) return;
    start(async () => {
      let r: { ok: boolean; message?: string };
      if (composer === "task") r = await fieldCreateTaskAction(entityId, text);
      else if (composer === "draft") r = await fieldCreateDraftAction(text);
      else if (composer === "note") r = await fieldLogNoteAction(entityType, entityId, text, text);
      else r = await fieldFollowupAction(text, new Date(Date.now() + 86_400_000).toISOString());
      setMsg(r.message ?? (r.ok ? "בוצע" : "שגיאה"));
      if (r.ok) { setText(""); setComposer(null); setTimeout(() => { setOpen(false); setMsg(null); }, 1200); }
    });
  };

  const items: { key: Composer | "call" | "whatsapp"; label: string; icon: string; href?: string }[] = [
    ...(phone ? [{ key: "call" as const, label: "התקשר", icon: "📞", href: `tel:${phone}` }] : []),
    ...(whatsapp ? [{ key: "whatsapp" as const, label: "וואטסאפ", icon: "💬", href: wa(whatsapp) }] : []),
    { key: "task", label: "משימה", icon: "✅" }, { key: "note", label: "הערה", icon: "📝" },
    { key: "draft", label: "טיוטה", icon: "✉️" }, { key: "followup", label: "מעקב", icon: "⏰" },
  ];

  return (
    <div dir="rtl" className="fixed inset-inline-start-4 bottom-24 z-40">
      {open && (
        <div className="bg-card border-line mb-3 w-64 rounded-2xl border p-3 shadow-[var(--shadow-lift)]">
          {composer ? (
            <div>
              <div className="text-ink mb-2 text-[13px] font-black">{composer === "task" ? "משימה חדשה" : composer === "note" ? "הערה" : composer === "draft" ? "טיוטת הודעה" : "מעקב (מחר)"}</div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="הקלד…" className="bg-surface border-line text-ink w-full rounded-xl border p-2 text-[13px] outline-none" />
              <div className="mt-2 flex gap-2">
                <button disabled={pending} onClick={submit} className="btn-zono-primary flex-1 rounded-lg py-2 text-[12px] font-bold text-white disabled:opacity-50">{pending ? "…" : "שמור"}</button>
                <button onClick={() => { setComposer(null); setText(""); }} className="bg-surface text-muted rounded-lg px-3 py-2 text-[12px] font-bold">ביטול</button>
              </div>
              {msg && <div className="text-success mt-2 text-center text-[11px] font-bold">{msg}</div>}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {items.map((it) => it.href ? (
                <a key={it.key} href={it.href} className="bg-surface flex flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-bold"><span className="text-lg">{it.icon}</span><span className="text-ink">{it.label}</span></a>
              ) : (
                <button key={it.key} onClick={() => setComposer(it.key as Composer)} className="bg-surface flex flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-bold"><span className="text-lg">{it.icon}</span><span className="text-ink">{it.label}</span></button>
              ))}
            </div>
          )}
          <div className="text-muted mt-2 text-center text-[10px]">הכל דורש אישור — שום פעולה לא נשלחת/מבוצעת אוטומטית.</div>
        </div>
      )}
      <button onClick={() => { setOpen((v) => !v); setComposer(null); }} className="btn-zono-primary zono-focus-ring grid h-14 w-14 place-items-center rounded-full text-2xl text-white shadow-[var(--shadow-lift)]" aria-label="פעולות מהירות">{open ? "✕" : "+"}</button>
    </div>
  );
}
