"use client";
// ============================================================================
// Management cockpit — "שאל את ZONO על המשרד" (client). A COMPACT contextual
// command field near the intelligence layer (not a bolted-on footer form). It
// calls the existing canonical askExecutiveAction (deterministic Q&A over the
// same executive model) — no fabricated answers, suggestions map to supported
// queries only.
// ============================================================================
import { useState, useTransition } from "react";
import { askExecutiveAction } from "@/lib/executive-os/actions";

const SUGGESTIONS = ["למה הציון ירד?", "אילו עסקאות בסיכון?", "מי צריך ממני תשומת לב?", "איפה אנחנו מאבדים לידים?"];

export function AskZono() {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ answer: string; items: { title: string; detail: string }[] } | null>(null);

  const ask = (question: string) => {
    const query = question.trim();
    if (!query) return;
    setQ(query);
    start(async () => { try { const r = await askExecutiveAction(query); setRes(r.result); } catch { setRes({ answer: "לא הצלחתי לענות כרגע.", items: [] }); } });
  };

  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="bg-brand text-white grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black">Z</span>
        <p className="text-ink text-sm font-black">שאל את ZONO על המשרד</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="למשל: אילו עסקאות בסיכון?" className="border-line bg-surface text-ink focus:border-brand-light min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none" />
        <button type="submit" disabled={pending} className="bg-brand hover:bg-brand-strong shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "…" : "שאל"}</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} className="bg-surface text-muted hover:text-ink rounded-lg px-2 py-1 text-[11px] font-bold transition">{s}</button>)}
      </div>
      {res && (
        <div className="border-line mt-3 rounded-xl border p-3">
          <p className="text-ink text-sm font-bold leading-relaxed">{res.answer}</p>
          {res.items.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {res.items.slice(0, 4).map((it, i) => <li key={i} className="text-muted text-xs"><span className="text-ink font-bold">{it.title}</span> · {it.detail}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
