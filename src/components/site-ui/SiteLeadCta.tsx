"use client";
// ============================================================================
// 🤝 ZONO Website Design System™ — SiteLeadCta (premium conversion block).
// A luxury "tell me what you're looking for" card that turns a visitor into a
// WhatsApp conversation with the agent/office — prefilled with their intent.
// No backend, no fabricated form; it just opens the real WhatsApp deep link (or
// falls back to a call). Public-safe, RTL, mobile-first. Uses --site-* theme.
// ============================================================================
import { useState } from "react";

export function SiteLeadCta({ name, whatsapp, phone, headline, subtitle }: {
  name: string; whatsapp: string | null; phone: string | null;
  headline?: string; subtitle?: string;
}) {
  const [q, setQ] = useState("");
  const go = () => {
    const text = q.trim() ? `היי ${name}, אני מחפש/ת: ${q.trim()}` : `היי ${name}, אשמח לפרטים על נכסים`;
    const digits = (whatsapp || phone || "").replace(/\D/g, "");
    if (whatsapp && digits) { window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank", "noopener"); return; }
    if (phone) { window.location.href = `tel:${phone}`; }
  };
  const canWa = !!(whatsapp && whatsapp.replace(/\D/g, ""));

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-xl2)] p-7 text-white shadow-[var(--shadow-lift)] sm:p-10" style={{ background: "var(--site-gradient)" }}>
      <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
      <div className="relative">
        <p className="text-[13px] font-bold text-white/80">התאמה אישית · חינם</p>
        <h2 className="mt-1 text-2xl font-black leading-tight sm:text-3xl">{headline ?? "ספר/י לי מה את/ה מחפש/ת — ואמצא לך התאמה"}</h2>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/85">{subtitle ?? "כתוב/כתבי בכמה מילים מה חשוב לך (אזור, תקציב, חדרים) ואחזור אליך אישית עם נכסים מתאימים."}</p>

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            placeholder="למשל: 4 חדרים, קריית ביאליק, עד 2.2 מיליון"
            className="h-12 flex-1 rounded-2xl bg-white/95 px-4 text-[15px] font-medium text-slate-900 outline-none ring-2 ring-white/30 placeholder:text-slate-400 focus:ring-white/70"
          />
          <button
            type="button"
            onClick={go}
            className="zono-focus-ring inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-[15px] font-black text-[#1a1236] shadow-lg transition hover:-translate-y-0.5 hover:bg-white/90"
          >
            {canWa ? "שלח לי בוואטסאפ" : "צור קשר"} <span>←</span>
          </button>
        </div>
        {phone && (
          <a href={`tel:${phone}`} className="mt-3 inline-block text-[13px] font-bold text-white/80 underline-offset-2 hover:underline">או חייגו: {phone}</a>
        )}
      </div>
    </section>
  );
}
