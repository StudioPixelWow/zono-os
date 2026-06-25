"use client";
// ZONO Command Center — "כל מערכת ZONO". Workflow-based groups (A–H), each a
// glass card. Items carry chevron / disabled-beta badge / active indicator.
import { Icon } from "@/components/dashboard/Icon";
import { SYSTEM_MAP, type CommandItem } from "./commandRegistry";

export function SystemMap({ onGo, activeHref }: { onGo: (item: CommandItem) => void; activeHref?: string }) {
  return (
    <section aria-label="כל מערכת ZONO" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-violet-500/20 text-violet-300"><Icon name="Layers" size={14} /></span>
        <p className="text-sm font-black text-white">כל מערכת ZONO</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SYSTEM_MAP.map((g) => (
          <div key={g.key} className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/15 text-violet-200"><Icon name={g.icon} size={15} /></span>
              <p className="text-sm font-black text-white">{g.title}</p>
            </div>
            <div className="flex flex-col gap-0.5">
              {g.items.map((it) => {
                const blocked = !!it.disabled;
                const active = !!activeHref && it.href === activeHref;
                return (
                  <button
                    key={it.id}
                    type="button"
                    disabled={blocked}
                    title={blocked ? "בקרוב" : it.description ?? it.label}
                    onClick={() => !blocked && onGo(it)}
                    className={
                      "group flex items-center gap-2 rounded-xl px-2.5 py-2 text-right transition " +
                      (blocked
                        ? "cursor-not-allowed text-white/30"
                        : active
                          ? "bg-violet-500/15 text-white"
                          : "text-white/75 hover:bg-white/[0.07] hover:text-white")
                    }
                  >
                    {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300" />}
                    <Icon name={it.icon} size={14} className={blocked ? "text-white/25" : "text-violet-200/80"} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{it.label}</span>
                    {it.beta && <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold text-violet-200">בטא</span>}
                    {blocked && <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9px] font-bold text-white/40">בקרוב</span>}
                    {!blocked && !it.beta && <Icon name="ChevronLeft" size={13} className="text-white/25 transition group-hover:text-white/50" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
