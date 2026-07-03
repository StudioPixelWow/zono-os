"use client";
// ============================================================================
// 🌐 AI Brokerage Website — public Ask ZONO widget. 32.1. Part: ASK ZONO.
// Office-scoped conversational AI over the public API. Public-safe answers only.
// ============================================================================
import { useState } from "react";

interface Turn { role: "user" | "assistant"; text: string; followUps?: string[]; confidence?: number }

export default function AskWidget({ slug, office, suggestions = [], apiBase = "site-ai", title }: { slug: string; office: string; suggestions?: string[]; apiBase?: "site-ai" | "agent-site"; title?: string }) {
  const [msgs, setMsgs] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  const ask = async (q: string) => {
    const query = q.trim(); if (!query || pending) return;
    setInput(""); setMsgs((m) => [...m, { role: "user", text: query }]); setPending(true);
    try {
      const res = await fetch(`/api/${apiBase}/${encodeURIComponent(slug)}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
      const j = await res.json();
      const d = j?.data;
      setMsgs((m) => [...m, { role: "assistant", text: d?.answer ?? "לא הצלחתי לענות כרגע.", followUps: d?.followUps ?? [], confidence: d?.confidence }]);
    } catch { setMsgs((m) => [...m, { role: "assistant", text: "אירעה שגיאה — נסו שוב." }]); } finally { setPending(false); }
  };

  return (
    <div dir="rtl" className="rounded-3xl border border-white/40 bg-white/60 p-5 shadow-xl backdrop-blur-md">
      <h3 className="text-lg font-black" style={{ color: "var(--site-accent)" }}>💬 {title ?? `שאל את ${office}`}</h3>
      <p className="mt-1 text-[12px] text-slate-600">תשובות מיידיות ממלאי המשרד — נכסים, אזורים, ייעוץ קנייה/מכירה. ללא התחייבות.</p>
      {suggestions.length > 0 && msgs.length === 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 4).map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: "var(--site-accent)", color: "var(--site-accent)" }}>{s}</button>)}
        </div>
      )}
      {msgs.length > 0 && (
        <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "self-end rounded-2xl bg-slate-100 px-3 py-1.5 text-[13px]" : "rounded-2xl border border-white/50 bg-white/70 px-3 py-2 text-[13px]"}>
              <p className={m.role === "user" ? "font-bold text-slate-800" : "text-slate-800"}>{m.text}</p>
              {m.role === "assistant" && (m.followUps?.length ?? 0) > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">{m.followUps!.slice(0, 3).map((f) => <button key={f} onClick={() => ask(f)} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: "var(--site-accent)", color: "var(--site-accent)" }}>{f}</button>)}</div>
              )}
            </div>
          ))}
          {pending && <p className="text-[11px] text-slate-500">חושב…</p>}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(input); }} placeholder="למשל: אילו דירות 4 חדרים יש?" className="flex-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[13px]" />
        <button onClick={() => ask(input)} disabled={pending || !input.trim()} className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--site-gradient)" }}>שאל</button>
      </div>
    </div>
  );
}
