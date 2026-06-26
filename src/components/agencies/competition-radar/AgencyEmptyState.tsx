import type { ReactNode } from "react";

/** Honest empty state — never shows fabricated numbers. */
export function AgencyEmptyState({ title, text, icon }: { title?: string; text: string; icon?: ReactNode }) {
  return (
    <div className="border-line/70 bg-card/60 flex flex-col items-center gap-2 rounded-card border border-dashed px-6 py-10 text-center">
      {icon && <div className="text-brand/70">{icon}</div>}
      {title && <div className="text-ink text-sm font-bold">{title}</div>}
      <p className="text-muted max-w-md text-sm leading-relaxed">{text}</p>
    </div>
  );
}
