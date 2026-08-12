"use client";
// Premium testimonials slider (spec §14). Real testimonials only — the section
// is not rendered at all when the agent has none (handled by the template).
import { useState } from "react";

export interface Testimonial { name: string; area: string | null; text: string; rating: number | null }

export function Testimonials({ items }: { items: Testimonial[] }) {
  const [i, setI] = useState(0);
  const per = 3;
  const pages = Math.max(1, Math.ceil(items.length / per));
  const go = (d: number) => setI((v) => (v + d + pages) % pages);
  const slice = items.slice(i * per, i * per + per);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {slice.map((t, k) => (
          <figure key={k} className="flex flex-col rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-6">
            {t.rating ? <div className="text-[color:var(--brand-accent)]" aria-label={`דירוג ${t.rating}`}>{"★".repeat(Math.max(1, Math.min(5, Math.round(t.rating))))}</div> : null}
            <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-[var(--brand-text)]">{t.text}</blockquote>
            <figcaption className="mt-4">
              <div className="text-[14px] font-black text-[var(--brand-text)]">{t.name}</div>
              {t.area && <div className="text-[12px] font-semibold text-[var(--brand-muted)]">{t.area}</div>}
            </figcaption>
          </figure>
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" aria-label="הקודם" onClick={() => go(-1)} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--brand-border)] text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)]">›</button>
          <div className="flex gap-1.5">{Array.from({ length: pages }).map((_, p) => <span key={p} className={`h-2 rounded-full transition-all ${p === i ? "w-5 bg-[var(--brand-primary)]" : "w-2 bg-[var(--brand-border)]"}`} />)}</div>
          <button type="button" aria-label="הבא" onClick={() => go(1)} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--brand-border)] text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)]">‹</button>
        </div>
      )}
    </div>
  );
}
