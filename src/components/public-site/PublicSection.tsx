// ZONO Public Sites — shared section wrapper. Drives brand-dynamic surface RHYTHM
// (base/soft/surface/accent) so pages alternate instead of one endless white sheet.
import type { ReactNode } from "react";

export type PublicTone = "base" | "soft" | "surface" | "accent";
const TONE: Record<PublicTone, string> = {
  base: "bg-[var(--brand-background)] text-[var(--brand-text)]",
  soft: "bg-[var(--brand-soft)] text-[var(--brand-text)]",
  surface: "bg-[var(--brand-surface)] text-[var(--brand-text)]",
  accent: "bg-[var(--brand-primary)] text-[var(--brand-on-primary)]",
};

export function PublicSection({
  id, tone = "base", eyebrow, title, action, children, className, containerClassName, center,
}: {
  id?: string; tone?: PublicTone; eyebrow?: ReactNode; title?: ReactNode; action?: ReactNode;
  children: ReactNode; className?: string; containerClassName?: string; center?: boolean;
}) {
  const hasHeading = !!(eyebrow || title || action);
  return (
    <section id={id} className={`relative ${TONE[tone]} ${className ?? ""}`}>
      <div className={`mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:py-24 ${containerClassName ?? ""}`}>
        {hasHeading && (
          <div className={`mb-9 flex flex-wrap items-end gap-3 ${center ? "flex-col items-center text-center" : "justify-between"}`}>
            <div>
              {eyebrow && <div className="mb-1.5 text-[13px] font-black uppercase tracking-[0.12em] opacity-70">{eyebrow}</div>}
              {title && <h2 className="text-3xl font-black leading-tight sm:text-4xl">{title}</h2>}
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
