"use client";
// ============================================================================
// 🧭 ZONO Website Design System™ — SiteNav (sticky, premium, RTL). 38.1.
// One navigation language for every ZONO public site. Glass surface, official
// tokens, keyboard-accessible, desktop + mobile. Consumes the pure nav model —
// no data fetching, no duplication of the existing renderers.
// ============================================================================
/* eslint-disable @next/next/no-img-element -- office logo is an external CDN url */
import { useState } from "react";
import Link from "next/link";
import type { SiteNavModel } from "@/lib/site-ui/nav";

export function SiteNav({ nav }: { nav: SiteNavModel }) {
  const [open, setOpen] = useState(false);
  const ctaCls = nav.cta.kind === "whatsapp" ? "bg-success text-white" : "btn-zono-primary text-white";

  return (
    <header dir="rtl" className="zono-glass sticky top-0 z-50 border-b border-white/40">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6" aria-label="ניווט ראשי">
        {/* Brand */}
        <Link href={nav.brand.href} className="zono-focus-ring flex items-center gap-2 rounded-xl" aria-label={nav.brand.name}>
          {nav.brand.logo ? <img src={nav.brand.logo} alt={nav.brand.name} className="h-8 w-auto" /> : <span className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: "var(--site-gradient)" }}>Z</span>}
          <span className="text-ink text-[15px] font-black">{nav.brand.name}</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {nav.links.map((l) => (
            <Link key={l.label} href={l.href} className="text-muted hover:text-ink hover:bg-brand-soft zono-focus-ring rounded-lg px-3 py-2 text-[13px] font-bold transition">{l.label}</Link>
          ))}
        </div>

        {/* CTA + mobile toggle */}
        <div className="flex items-center gap-2">
          <a href={nav.cta.href} className={`zono-focus-ring hidden rounded-xl px-4 py-2 text-[13px] font-bold shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 sm:inline-block ${ctaCls}`}>{nav.cta.label}</a>
          <button onClick={() => setOpen((v) => !v)} className="text-ink zono-focus-ring grid h-9 w-9 place-items-center rounded-lg md:hidden" aria-label="תפריט" aria-expanded={open}>
            <span className="text-xl leading-none">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </nav>

      {/* Mobile panel */}
      {open && (
        <div className="border-line bg-card/95 border-t px-4 py-3 backdrop-blur md:hidden">
          <div className="flex flex-col gap-1">
            {nav.links.map((l) => (
              <Link key={l.label} href={l.href} onClick={() => setOpen(false)} className="text-ink hover:bg-brand-soft rounded-lg px-3 py-2.5 text-[14px] font-bold">{l.label}</Link>
            ))}
            <a href={nav.cta.href} className={`mt-1 rounded-xl px-4 py-2.5 text-center text-[14px] font-bold ${ctaCls}`}>{nav.cta.label}</a>
          </div>
        </div>
      )}
    </header>
  );
}
