"use client";
// ============================================================================
// 🌍 Area Portal — public lead capture. 32.5. Request valuation / schedule visit /
// contact office / looking to buy or sell. Approval-safe; nothing auto-executes.
// ============================================================================
import { useState } from "react";

const KINDS: { id: string; label: string }[] = [
  { id: "valuation", label: "בקשת הערכת שווי" }, { id: "visit", label: "תיאום ביקור" },
  { id: "buy", label: "מעוניין/ת לקנות" }, { id: "sell", label: "מעוניין/ת למכור" }, { id: "contact", label: "יצירת קשר" },
];

export default function LeadForm({ city, neighborhood = null }: { city: string; neighborhood?: string | null }) {
  const [kind, setKind] = useState("valuation");
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(""); const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (!phone && !email) { setState("error"); setNote("אנא השאירו טלפון או אימייל."); return; }
    setState("sending");
    try {
      const res = await fetch("/api/area/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, city, neighborhood, name, phone, email, message: msg }) });
      const j = await res.json();
      if (j?.data?.ok) { setState("done"); setNote(j.data.message); } else { setState("error"); setNote(j?.data?.message ?? "אירעה שגיאה."); }
    } catch { setState("error"); setNote("אירעה שגיאה — נסו שוב."); }
  };

  if (state === "done") return <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-center text-[14px] font-bold text-emerald-800">✓ {note}</div>;

  return (
    <div dir="rtl" className="rounded-3xl border border-white/40 bg-white/60 p-5 shadow-xl backdrop-blur-md">
      <h3 className="text-lg font-black text-slate-800">מעוניינים בליווי מקצועי?</h3>
      <p className="mt-1 text-[12px] text-slate-600">השאירו פרטים ונחזור אליכם. ללא התחייבות.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {KINDS.map((k) => <button key={k.id} onClick={() => setKind(k.id)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${kind === k.id ? "text-white" : "border border-slate-200 text-slate-600"}`} style={kind === k.id ? { background: "var(--ap-gradient)" } : undefined}>{k.label}</button>)}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם" className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[13px]" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון" className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[13px]" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="אימייל" className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[13px]" />
      </div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="הודעה (אופציונלי)" rows={2} className="mt-2 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[13px]" />
      <div className="mt-3 flex items-center gap-3">
        <button onClick={submit} disabled={state === "sending"} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--ap-gradient)" }}>{state === "sending" ? "שולח…" : "שליחה"}</button>
        {state === "error" && <span className="text-[12px] font-semibold text-rose-600">{note}</span>}
      </div>
    </div>
  );
}
