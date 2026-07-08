"use client";
// ============================================================================
// ZONO Command Center — AI command search. Large central input + grouped,
// keyboard-navigable results over the unified command registry AND live org
// entities (properties / buyers / sellers / brokers / listings / agents) via
// the existing RLS-scoped global search. Every result links to a real route.
// ============================================================================
import { forwardRef, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import { useCommandSearch } from "@/hooks/useCommandSearch";
import type { CommandItem } from "./commandRegistry";
import { globalSearchAction } from "@/lib/search/actions";
import type { SearchGroup } from "@/lib/search/service";

interface Props {
  query: string;
  setQuery: (v: string) => void;
  onGo: (item: CommandItem) => void;
  onGoHref: (href: string, label: string, id?: string, icon?: string) => void;
}

export const CommandSearch = forwardRef<HTMLInputElement, Props>(function CommandSearch({ query, setQuery, onGo, onGoHref }, ref) {
  const { flat: cmdFlat, groups: cmdGroups, hasQuery } = useCommandSearch(query);

  // Live entity search (server, RLS-scoped) — debounced, real routes only.
  const [entityGroups, setEntityGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const tid = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the highlight when the query changes (render-time, React-recommended).
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) { setPrevQuery(query); setActive(0); }

  useEffect(() => {
    if (tid.current) clearTimeout(tid.current);
    const term = query.trim();
    if (term.length < 2) {
      // Defer the reset so we never call setState synchronously in the effect body.
      tid.current = setTimeout(() => { setEntityGroups([]); setLoading(false); }, 0);
      return () => { if (tid.current) clearTimeout(tid.current); };
    }
    tid.current = setTimeout(async () => {
      setLoading(true);
      try { setEntityGroups(await globalSearchAction(term)); } catch { setEntityGroups([]); } finally { setLoading(false); }
    }, 220);
    return () => { if (tid.current) clearTimeout(tid.current); };
  }, [query]);

  // Unified activatable list: command items first, then entity hits.
  const entityFlat = entityGroups.flatMap((g) => g.hits.map((h) => ({ hit: h, icon: g.icon })));
  const total = cmdFlat.length + entityFlat.length;
  const activate = (i: number) => {
    if (i < cmdFlat.length) { const item = cmdFlat[i]; if (item && !item.disabled) onGo(item); return; }
    const e = entityFlat[i - cmdFlat.length];
    if (e) onGoHref(e.hit.href, e.hit.title, e.hit.id, e.icon);
  };

  // Keyboard navigation across the combined list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hasQuery || total === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % total); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + total) % total); }
      else if (e.key === "Enter") { e.preventDefault(); activate(active); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasQuery, total, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const nothing = hasQuery && !loading && total === 0;

  return (
    <div className="relative w-full max-w-2xl">
      <div className="relative">
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40"><Icon name="Search" size={20} /></span>
        <input
          ref={ref}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפש נכס, קונה, מוכר, עסקה, משימה או פעולה..."
          aria-label="חיפוש פקודות"
          className="h-14 w-full rounded-2xl border border-violet-400/20 bg-white/[0.06] pr-12 pl-16 text-base font-medium text-white placeholder:text-white/40 outline-none transition focus:border-violet-400/50 focus:bg-white/[0.1] focus:shadow-[0_0_40px_rgba(139,92,246,0.25)]"
        />
        {loading
          ? <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60"><Spinner size={16} /></span>
          : <kbd className="absolute left-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-bold text-white/50 sm:block">⌘K</kbd>}
      </div>

      {hasQuery && (
        <div className="absolute z-10 mt-2 max-h-[52vh] w-full overflow-y-auto rounded-2xl border border-violet-400/20 bg-slate-950/95 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
          {/* Registry commands */}
          {cmdGroups.map((grp) => (
            <div key={grp.category} className="mb-1.5">
              <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white/35">{grp.category}</p>
              {grp.items.map((item) => {
                const idx = cmdFlat.indexOf(item);
                return <ResultRow key={item.id} icon={item.icon} label={item.label} sub={item.description ?? null} disabled={item.disabled} isActive={idx === active} onEnter={() => setActive(idx)} onClick={() => !item.disabled && onGo(item)} />;
              })}
            </div>
          ))}

          {/* Live entities */}
          {entityGroups.map((g) => (
            <div key={g.type} className="mb-1.5">
              <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white/35">{g.label}</p>
              {g.hits.map((h) => {
                const idx = cmdFlat.length + entityFlat.findIndex((e) => e.hit === h);
                return <ResultRow key={`${g.type}-${h.id}`} icon={g.icon} label={h.title} sub={h.subtitle} isActive={idx === active} onEnter={() => setActive(idx)} onClick={() => onGoHref(h.href, h.title, h.id, g.icon)} />;
              })}
            </div>
          ))}

          {loading && total === 0 && <p className="px-3 py-6 text-center text-sm text-white/50">מחפש…</p>}
          {nothing && <p className="px-3 py-6 text-center text-sm text-white/50">לא נמצאו תוצאות עבור &ldquo;{query}&rdquo;.</p>}
        </div>
      )}
    </div>
  );
});

function ResultRow({ icon, label, sub, disabled, isActive, onEnter, onClick }: { icon: string; label: string; sub: string | null; disabled?: boolean; isActive: boolean; onEnter: () => void; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={onEnter}
      onClick={onClick}
      className={
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition " +
        (disabled ? "cursor-not-allowed text-white/30" : isActive ? "bg-violet-500/20 text-white" : "text-white/80 hover:bg-white/[0.06]")
      }
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-200"><Icon name={icon} size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{label}</span>
        {sub && <span className="block truncate text-[11px] text-white/45">{sub}</span>}
      </span>
      {disabled
        ? <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9px] font-bold text-white/40">בקרוב</span>
        : <Icon name="ChevronLeft" size={14} className="text-white/30" />}
    </button>
  );
}
