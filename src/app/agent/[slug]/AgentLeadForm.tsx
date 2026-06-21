"use client";

import { useState, useTransition } from "react";
import { submitAgentLeadAction } from "@/lib/agent-website/actions";

type Variant = "buyer_request" | "valuation" | "contact";

/** Public lead form on the agent site. Posts via an auth-free action. */
export function AgentLeadForm({ slug, variant, cta, accent = "#7C3AED" }: { slug: string; variant: Variant; cta: string; accent?: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ fullName: "", phone: "", city: "", propertyType: "", rooms: "", budget: "", timeline: "", message: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    start(async () => {
      const r = await submitAgentLeadAction(slug, {
        sourceSection: variant, fullName: f.fullName || undefined, phone: f.phone || undefined, city: f.city || undefined,
        propertyType: f.propertyType || undefined, rooms: f.rooms || undefined, budget: f.budget || undefined,
        timeline: f.timeline || undefined, message: f.message || undefined,
      });
      if (r.error) setError(r.error); else setDone(true);
    });
  };

  if (done) return <div className="rounded-2xl bg-[#ecfdf5] p-5 text-center font-bold text-[#065f46]">תודה! ניצור איתך קשר בהקדם ✓</div>;
  const input = "w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7C3AED]";
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {variant === "buyer_request" && <>
        <input className={input} placeholder="אזור" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <input className={input} placeholder="תקציב עד" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        <input className={input} placeholder="מס׳ חדרים" value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value })} />
        <input className={input} placeholder="טלפון" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
      </>}
      {variant === "valuation" && <>
        <input className={input} placeholder="עיר" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <input className={input} placeholder="סוג נכס" value={f.propertyType} onChange={(e) => setF({ ...f, propertyType: e.target.value })} />
        <input className={input} placeholder="חדרים" value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value })} />
        <input className={input} placeholder="טלפון" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
      </>}
      {variant === "contact" && <>
        <input className={input} placeholder="שם מלא" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        <input className={input} placeholder="טלפון" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        <textarea className={`${input} sm:col-span-2`} placeholder="במה אוכל לעזור?" rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </>}
      <button type="submit" disabled={pending} style={{ backgroundColor: accent }} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:col-span-2">{pending ? "שולח…" : cta}</button>
      {error && <p className="text-sm font-semibold text-[#dc2626] sm:col-span-2">{error}</p>}
      <p className="text-[11px] text-[#9ca3af] sm:col-span-2">בלחיצה אתה מאשר שניצור איתך קשר.</p>
    </form>
  );
}
