"use client";
// ZONO Command Center — AI command search. Large central input + grouped,
// keyboard-navigable results over the unified command registry.
import { forwardRef, useEffect } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { useCommandSearch } from "@/hooks/useCommandSearch";
import type { CommandItem } from "./commandRegistry";

interface Props {
  query: string;
  setQuery: (v: string) => void;
  onGo: (item: CommandItem) => void;
}

export const CommandSearch = forwardRef<HTMLInputElement, Props>(function CommandSearch({ query, setQuery, onGo }, ref) {
  const { flat, groups, active, setActive, hasQuery } = useCommandSearch(query);

  // Keyboard navigation over the flat result list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hasQuery || flat.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % flat.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + flat.length) % flat.length); }
      else if (e.key === "Enter") {
        const item = flat[active];
        if (item && !item.disabled) { e.preventDefault(); onGo(item); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasQuery, flat, active, setActive, onGo]);

  return (
    <div className="relative w-full max-w-2xl">
      <div className="relative">
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40"><Icon name="Search" size={20} /></span>
        <input
          ref={ref}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפש נכס, לקוח, עסקה, משימה או פעולה..."
          aria-label="חיפוש פקודות"
          className="h-14 w-full rounded-2xl border border-violet-400/20 bg-white/[0.06] pr-12 pl-16 text-base font-medium text-white placeholder:text-white/40 outline-none transition focus:border-violet-400/50 focus:bg-white/[0.1] focus:shadow-[0_0_40px_rgba(139,92,246,0.25)]"
        />
        <kbd className="absolute left-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-bold text-white/50 sm:block">⌘K</kbd>
      </div>

      {hasQuery && (
        <div className="absolute z-10 mt-2 max-h-[50vh] w-full overflow-y-auto rounded-2xl border border-violet-400/20 bg-slate-950/95 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
          {flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-white/50">לא נמצאו תוצאות עבור &ldquo;{query}&rdquo;.</p>
          ) : (
            groups.map((grp) => (
              <div key={grp.category} className="mb-1.5 last:mb-0">
                <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white/35">{grp.category}</p>
                {grp.items.map((item) => {
                  const idx = flat.indexOf(item);
                  const isActive = idx === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.disabled}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => !item.disabled && onGo(item)}
                      className={
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition " +
                        (item.disabled
                          ? "cursor-not-allowed text-white/30"
                          : isActive
                            ? "bg-violet-500/20 text-white"
                            : "text-white/80 hover:bg-white/[0.06]")
                      }
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-200"><Icon name={item.icon} size={15} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{item.label}</span>
                        {item.description && <span className="block truncate text-[11px] text-white/45">{item.description}</span>}
                      </span>
                      {item.disabled ? (
                        <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9px] font-bold text-white/40">בקרוב</span>
                      ) : (
                        <Icon name="ChevronLeft" size={14} className="text-white/30" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
});
