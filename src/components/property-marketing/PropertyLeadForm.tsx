"use client";
// Short property lead form (spec §22) — name / phone / optional message. Submits
// via the auth-free action that attributes the lead to property+agent+office.
import { useState, useTransition } from "react";
import { submitPropertyLeadAction } from "@/lib/property-marketing/actions";

export function PropertyLeadForm({ propertyId }: { propertyId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ fullName: "", phone: "", message: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    start(async () => {
      const r = await submitPropertyLeadAction(propertyId, { fullName: f.fullName || undefined, phone: f.phone || undefined, message: f.message || undefined });
      if (r.error) setError(r.error); else setDone(true);
    });
  };

  if (done) return <div className="rounded-2xl bg-[#ecfdf5] p-5 text-center font-bold text-[#065f46]">תודה! הסוכן יחזור אליכם בהקדם ✓</div>;
  const input = "w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-3 py-2.5 text-sm text-[var(--brand-text)] outline-none focus:border-[color:var(--brand-primary)]";
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3">
      <input className={input} placeholder="שם מלא" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
      <input className={input} placeholder="טלפון" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
      <textarea className={input} placeholder="הודעה (אופציונלי)" rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      <button type="submit" disabled={pending} className="rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-[var(--brand-on-primary)] transition hover:bg-[color:var(--brand-primary-hover)] disabled:opacity-60">{pending ? "שולח…" : "שלחו פרטים"}</button>
      {error && <p className="text-sm font-semibold text-[#dc2626]">{error}</p>}
      <p className="text-[11px] text-[var(--brand-muted)]">בלחיצה אתם מאשרים שהסוכן ייצור אתכם קשר.</p>
    </form>
  );
}
