// ZONO Public Sites — strong brand-surface contact climax. Brand-dynamic (no
// hardcoded color); subtle architectural dot-grid for depth (not a random gradient).
import type { ReactNode } from "react";

export function PublicContactCTA({ title, subtitle, actions, children }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  return (
    <section id="contact" className="relative overflow-hidden bg-[var(--brand-primary)] text-[var(--brand-on-primary)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:py-24">
        <div>
          <h2 className="text-3xl font-black leading-tight sm:text-4xl lg:text-[44px]">{title}</h2>
          {subtitle && <p className="mt-4 max-w-md text-[17px] leading-relaxed opacity-90">{subtitle}</p>}
          {actions && <div className="mt-7 flex flex-wrap gap-3">{actions}</div>}
        </div>
        {children && <div className="rounded-[24px] bg-[var(--brand-background)] p-6 text-[var(--brand-text)] shadow-2xl sm:p-8">{children}</div>}
      </div>
    </section>
  );
}
