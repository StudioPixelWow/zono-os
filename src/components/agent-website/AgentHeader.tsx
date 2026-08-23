"use client";
// Sticky, RTL header with brand logo/wordmark, anchor nav, WhatsApp + phone CTA,
// and a mobile navigation drawer. Token-driven; STRUCTURE fixed, IDENTITY brand.
import { useEffect, useState } from "react";
import { PublicIcon } from "@/components/public-site/PublicIcon";

export interface HeaderNavItem { href: string; label: string }

export function AgentHeader({ brandName, logo, nav, whatsapp, tel, phoneLabel, cta }: {
  brandName: string; logo: string | null; nav: HeaderNavItem[];
  whatsapp: string | null; tel: string | null; phoneLabel: string | null;
  /** Optional distinct primary CTA (e.g. the seller valuation journey). */
  cta?: { href: string; label: string };
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header className={`sticky top-0 z-40 border-b transition-all duration-200 ${scrolled ? "border-[var(--brand-border)] bg-[var(--brand-background)]/90 backdrop-blur" : "border-transparent bg-[var(--brand-background)]"}`}>
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
        {/* Right (RTL start): brand */}
        <a href="#top" className="flex items-center gap-2.5">
          {logo
            ? <img src={logo} alt={brandName} className="h-11 w-auto max-w-[190px] object-contain sm:h-12" />
            : <span className="text-lg font-black text-[var(--brand-text)]">{brandName}</span>}
        </a>

        {/* Center: nav (desktop) */}
        <nav className="hidden items-center gap-7 lg:flex">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="text-[14px] font-bold text-[var(--brand-muted)] transition hover:text-[color:var(--brand-link)]">{n.label}</a>
          ))}
        </nav>

        {/* Left (RTL end): CTAs */}
        <div className="flex items-center gap-2">
          {cta && (
            <a href={cta.href} className="hidden items-center rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-[13px] font-black text-[var(--brand-on-primary)] transition hover:bg-[color:var(--brand-primary-hover)] md:flex">{cta.label}</a>
          )}
          {tel && (
            <a href={tel} aria-label={`התקשרות ${phoneLabel ?? ""}`} className="hidden items-center gap-2 rounded-xl border border-[var(--brand-border)] px-3.5 py-2 text-[13px] font-bold text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)] sm:flex">
              <PublicIcon name="phone" size="button" /> {phoneLabel}
            </a>
          )}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="וואטסאפ" className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-primary)] text-[var(--brand-on-primary)] transition hover:bg-[color:var(--brand-primary-hover)]">
              <PublicIcon name="whatsapp" size="button" />
            </a>
          )}
          <button type="button" aria-label="תפריט" aria-expanded={open} onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--brand-border)] text-[var(--brand-text)] lg:hidden">
            <BurgerIcon />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 flex w-[82%] max-w-sm flex-col bg-[var(--brand-background)] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-lg font-black text-[var(--brand-text)]">{brandName}</span>
              <button type="button" aria-label="סגירה" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--brand-border)]">✕</button>
            </div>
            <nav className="flex flex-col gap-1">
              {nav.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-[16px] font-bold text-[var(--brand-text)] transition hover:bg-[var(--brand-surface)]">{n.label}</a>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 pt-6">
              {cta && <a href={cta.href} onClick={() => setOpen(false)} className="flex items-center justify-center rounded-xl bg-[var(--brand-primary)] py-3 font-black text-[var(--brand-on-primary)]">{cta.label}</a>}
              {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] py-3 font-bold text-[var(--brand-text)]"><PublicIcon name="whatsapp" size="button" /> שליחת הודעת וואטסאפ</a>}
              {tel && <a href={tel} className="flex items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] py-3 font-bold text-[var(--brand-text)]"><PublicIcon name="phone" size="button" /> {phoneLabel}</a>}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function BurgerIcon() { return <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>; }
