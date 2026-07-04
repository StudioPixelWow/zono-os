// ============================================================================
// 🎬 ZONO Website Design System™ — SiteHero (premium, server-safe). 38.1.
// The definitive office hero: emotional cover/gradient, glass overlay, headline,
// dual CTA, trust badges + stat band. Uses --site-gradient/--site-accent (per-
// office theme) over the official ZONO tokens. RTL, motion-friendly, a11y.
// ============================================================================
/* eslint-disable @next/next/no-img-element -- office logo/cover are external CDN urls */
import Link from "next/link";
import { StatBand } from "./SiteSection";

export interface HeroCta { label: string; href: string; variant: "primary" | "secondary" }

export function SiteHero({ logo, cover, headline, subtitle, ctas, stats, trustBadges = [] }: {
  logo: string | null; cover: string | null; headline: string; subtitle: string;
  ctas: HeroCta[]; stats: { label: string; value: string }[]; trustBadges?: string[];
}) {
  return (
    <section className="pt-6">
      <div className="relative overflow-hidden rounded-[var(--radius-xl2)] shadow-[var(--shadow-lift)]">
        {/* Emotional background */}
        {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0" style={{ background: "var(--site-gradient)" }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-black/10" />

        <div className="relative z-10 p-7 text-white sm:p-12">
          {logo && <img src={logo} alt="" className="mb-5 h-11 w-auto drop-shadow" />}
          {trustBadges.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {trustBadges.map((t) => <span key={t} className="zono-glass-dark rounded-full px-3 py-1 text-[11px] font-bold text-white">✓ {t}</span>)}
            </div>
          )}
          <h1 className="max-w-3xl text-3xl font-black leading-[1.1] tracking-tight drop-shadow-sm sm:text-5xl">{headline}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/90 sm:text-lg">{subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {ctas.map((c) => (
              c.href.startsWith("#") || c.href.startsWith("http") || c.href.startsWith("tel:") ? (
                <a key={c.label} href={c.href} className={c.variant === "primary" ? "rounded-xl bg-white px-5 py-3 text-[14px] font-bold text-ink shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5" : "zono-glass-dark rounded-xl border border-white/50 px-5 py-3 text-[14px] font-bold text-white transition hover:bg-white/10"}>{c.label}</a>
              ) : (
                <Link key={c.label} href={c.href} className={c.variant === "primary" ? "rounded-xl bg-white px-5 py-3 text-[14px] font-bold text-ink shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5" : "zono-glass-dark rounded-xl border border-white/50 px-5 py-3 text-[14px] font-bold text-white transition hover:bg-white/10"}>{c.label}</Link>
              )
            ))}
          </div>
        </div>
      </div>

      {stats.length > 0 && <div className="relative z-20 -mt-6 px-4 sm:px-8"><StatBand stats={stats} /></div>}
    </section>
  );
}
