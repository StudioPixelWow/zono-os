"use client";
// ZONO Command Center — quick-actions row (create-first pills).
import { Icon } from "@/components/dashboard/Icon";
import { QUICK_ACTIONS, type CommandItem } from "./commandRegistry";

export function QuickActions({ onGo }: { onGo: (item: CommandItem) => void }) {
  return (
    <section aria-label="פעולות מהירות" className="flex flex-col gap-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-white/40">פעולות מהירות</p>
      <div className="flex flex-wrap gap-2.5">
        {QUICK_ACTIONS.map((a) => {
          const disabled = !!a.disabled;
          return (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              title={disabled ? "בקרוב" : a.label}
              onClick={() => !disabled && onGo(a)}
              className={
                disabled
                  ? "inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm font-bold text-white/35"
                  : "group inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(139,92,246,0.35)] transition hover:brightness-110 hover:shadow-[0_12px_30px_rgba(139,92,246,0.5)]"
              }
            >
              <Icon name={disabled ? a.icon : "Plus"} size={15} />
              {a.label}
              {disabled && <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/50">בקרוב</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
