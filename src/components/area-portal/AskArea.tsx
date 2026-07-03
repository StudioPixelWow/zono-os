"use client";
// ============================================================================
// 🌍 Area Portal — public Area Ask AI. 32.5. Scoped to this area's PUBLIC market
// intelligence only (server enforces it). Evidence-backed; nothing auto-sent.
// ============================================================================
import { useState } from "react";

interface Turn { role: "user" | "assistant"; text: string; evidence?: string[] }

export default function AskArea({ city, neighborhood = null, street = null, suggestions = [] }: { city: string; neighborhood?: string | null; street?: string | null; suggestions?: string[] }) {
  const [msgs, setMsgs] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  const ask = async (q: string) => {
    const query = q.trim(); if (!query || pending) return;
    setInput(""); setMsgs((m) => [...m, { role: "user", text: query }]); setPending(true);
    try {
      const res = await fetch("/api/area/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, neighborhood, street, query }) });
      const j = await res.json();
      const d = j?.data;
      setMsgs((m) => [...m, { role: "assistant", text: d?.answer ?? "לא הצלחתי לענות כרגע.", evidence: d?.evidence ?? [] }]);
    } catch { setMsgs((m) => [...m, { role: "assistant", text: "אירעה שגיאה — נסו שוב." }]); } finally { setPending(false); }
  };

  return (
    <div dir="rtl" className="rounded-3xl border border-white/40 bg-white/60 p-5 shadow-xl backdrop-blur-md">
      <h3 className="text-lg font-black" style={{ color: "var(--ap-accent)" }}>💬 שאלו על האזור</h3>
      <p className="mt-1 text-[12px] text-slate-600">תשובות מבוססות נתוני שוק ציבוריים — מחירים, ביקוש, עסקאות והשקעה.</p>
      {suggestions.length > 0 && msgs.length === 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 4).map((sug) => <button key={sug} onClick={() => ask(sug)} className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: "var(--ap-accent)", color: "var(--ap-accent)" }}>{sug}</button>)}
        </div>
      )}
      {msgs.length > 0 && (
        <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "self-end rounded-2xl bg-slate-100 px-3 py-1.5 text-[13px]" : "rounded-2xl border border-white/50 bg-white/70 px-3 py-2 text-[13px]"}>
              <p className={m.role === "user" ? "font-bold text-slate-800" : "text-slate-800"}>{m.text}</p>
              {m.role === "assistant" && (m.evidence?.length ?? 0) > 0 && <p className="mt-1 text-[10px] text-slate-400">מבוסס על: {m.evidence!.join(" · ")}</p>}
            </div>
          ))}
          {pending && <p className="text-[11px] text-slate-500">חושב…</p>}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(input); }} placeholder="למשל: מה המחירים באזור?" className="flex-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[13px]" />
        <button onClick={() => ask(input)} disabled={pending || !input.trim()} className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--ap-gradient)" }}>שאל</button>
      </div>
    </div>
  );
}
