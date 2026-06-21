"use client";

import { useState, useTransition } from "react";
import { submitWebsiteLeadAction } from "@/lib/office-website/actions";

type Variant = "valuation" | "recruitment" | "contact";

/** Public lead form used on the office site. Posts via an auth-free action. */
export function SiteLeadForm({ slug, variant, cta }: { slug: string; variant: Variant; cta: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ fullName: "", phone: "", city: "", propertyType: "", rooms: "", message: "", experience: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await submitWebsiteLeadAction(slug, {
        sourceSection: variant,
        fullName: f.fullName || undefined, phone: f.phone || undefined, city: f.city || undefined,
        propertyType: f.propertyType || undefined, rooms: f.rooms || undefined,
        message: variant === "recruitment" ? `ניסיון: ${f.experience}` : f.message || undefined,
      });
      if (r.error) setError(r.error); else setDone(true);
    });
  };

  if (done) return <div className="rounded-2xl bg-[#ecfdf5] p-5 text-center text-[#065f46] font-bold">תודה! ניצור איתך קשר בהקדם ✓</div>;

  const input = "w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7C3AED]";
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {variant === "valuation" && <>
        <input className={input} placeholder="עיר" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <input className={input} placeholder="סוג נכס (דירה/בית...)" value={f.propertyType} onChange={(e) => setF({ ...f, propertyType: e.target.value })} />
        <input className={input} placeholder="חדרים" value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value })} />
        <input className={input} placeholder="טלפון" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
      </>}
      {variant === "recruitment" && <>
        <input className={input} placeholder="שם מלא" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        <input className={input} placeholder="טלפון" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        <input className={`${input} sm:col-span-2`} placeholder="ניסיון בתחום" value={f.experience} onChange={(e) => setF({ ...f, experience: e.target.value })} />
      </>}
      {variant === "contact" && <>
        <input className={input} placeholder="שם מלא" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        <input className={input} placeholder="טלפון" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        <textarea className={`${input} sm:col-span-2`} placeholder="במה נוכל לעזור?" rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </>}
      <button type="submit" disabled={pending} className="rounded-xl bg-[#7C3AED] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:col-span-2">{pending ? "שולח…" : cta}</button>
      {error && <p className="text-sm font-semibold text-[#dc2626] sm:col-span-2">{error}</p>}
      <p className="text-[11px] text-[#9ca3af] sm:col-span-2">בלחיצה על השליחה אתה מאשר שניצור איתך קשר. המידע מאובטח.</p>
    </form>
  );
}
