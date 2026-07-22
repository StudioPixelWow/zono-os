"use client";
// ============================================================================
// ⌘ ZONO — Command Center palette. The ONE universal command surface: ⌘K/Ctrl+K
// everywhere (overlay mode) + an inline full-page mode (/command-center).
// COMPOSITION ONLY — entity results come from the canonical omnisearch
// (commandSearchAction), navigation/quick-actions/pinned from the existing
// registry, recents from the existing store. No business logic, no AI, no
// invented actions. Debounced realtime search; keyboard-navigable; honest
// unavailable+retry; never fabricates results.
// ============================================================================
import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { useRecentItems, pushRecentItem } from "@/hooks/useRecentItems";
import { commandSearchAction } from "@/lib/command-center/providers";
import {
  navigationCommands, quickActionCommands, pinnedCommands, suggestedCommands, recentCommands, flattenGroups, nonEmpty,
} from "@/lib/command-center/search";
import { commandRun, type CanonicalCommand, type CommandGroup } from "@/lib/command-center/types";

export function CommandPalette({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  const { items: recents } = useRecentItems();
  const [open, setOpen] = useState(inline);
  const [query, setQuery] = useState("");
  const [entityGroups, setEntityGroups] = useState<CommandGroup[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K toggle (overlay mode). Also opens on the zono:command-open event.
  useEffect(() => {
    if (inline) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    // The single palette answers every existing open-command event so no second
    // overlay is needed anywhere in the app.
    window.addEventListener("zono:command-open", onOpen);
    window.addEventListener("zono:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("zono:command-open", onOpen);
      window.removeEventListener("zono:open-search", onOpen);
    };
  }, [inline]);

  useEffect(() => {
    if (inline || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => { document.body.style.overflow = prev; window.clearTimeout(t); setQuery(""); };
  }, [open, inline]);

  // Debounced entity search via the canonical omnisearch (provider search only).
  // No synchronous setState in the effect body — results/active/error are set
  // inside the async transition; a stale error is ignored while the query is empty.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const h = window.setTimeout(() => {
      startTransition(async () => {
        try { const g = await commandSearchAction(q); setEntityGroups(g); setError(false); setActive(0); }
        catch { setEntityGroups([]); setError(true); }
      });
    }, 180);
    return () => window.clearTimeout(h);
  }, [query]);

  const groups = useMemo<CommandGroup[]>(() => {
    const q = query.trim();
    if (!q) return nonEmpty([recentCommands(recents), pinnedCommands(), suggestedCommands(), quickActionCommands("")]);
    return nonEmpty([...entityGroups, navigationCommands(q), quickActionCommands(q)]);
  }, [query, entityGroups, recents]);

  const flat = useMemo(() => flattenGroups(groups), [groups]);

  const run = useCallback((cmd: CanonicalCommand) => {
    if (commandRun(cmd) === "event" && cmd.target.event) {
      window.dispatchEvent(new Event(cmd.target.event));
      if (!inline) setOpen(false);
      return;
    }
    if (cmd.target.href) {
      pushRecentItem({ id: cmd.target.id ?? cmd.id, label: cmd.label, href: cmd.target.href, icon: cmd.icon, category: cmd.subtitle ?? undefined });
      if (!inline) setOpen(false);
      router.push(cmd.target.href);
    }
  }, [router, inline]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = flat[active]; if (c) run(c); }
  };

  if (!inline && !open) return null;

  let idx = -1;
  const list = (
    <div className="flex flex-col gap-3">
      {error && query.trim() ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-amber-200 bg-amber-50/60 p-5 text-center">
          <p className="text-[12px] font-black text-amber-800">החיפוש אינו זמין כעת</p>
          <button type="button" onClick={() => setQuery((q) => `${q} `)} className="rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-[11px] font-bold text-amber-800">נסה שוב</button>
        </div>
      ) : groups.length === 0 ? (
        <p className="text-muted p-6 text-center text-[12px]">{query.trim() ? "לא נמצאו תוצאות." : "התחל להקליד כדי לחפש בכל ZONO."}</p>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-1">
            <div className="text-muted flex items-center gap-1.5 px-1 text-[10px] font-black"><Icon name={g.icon} size={12} />{g.label}</div>
            {g.commands.map((c) => {
              idx += 1; const isActive = idx === active;
              return (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setActive(flat.findIndex((x) => x.id === c.id))}
                  onClick={() => run(c)}
                  className={`flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-right ${isActive ? "bg-[var(--brand-soft,#f0eefe)]" : "hover:bg-[var(--surface-2,#f7f7fa)]"}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon name={c.icon} size={15} className="text-muted shrink-0" />
                    <span className="min-w-0">
                      <span className="text-ink block truncate text-[13px] font-bold">{c.label}</span>
                      {c.subtitle ? <span className="text-muted block truncate text-[11px]">{c.subtitle}</span> : null}
                    </span>
                  </span>
                  <span className="text-muted/70 shrink-0 text-[9px] font-bold">{KIND_HE[c.kind]}</span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );

  const panel = (
    <div className="bg-card border-line flex max-h-[70vh] flex-col overflow-hidden rounded-[20px] border shadow-[var(--shadow-card)]">
      <div className="border-line flex items-center gap-2 border-b px-4 py-3">
        <Icon name="Search" size={16} className="text-muted shrink-0" />
        <input
          ref={inputRef}
          dir="rtl"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder="חיפוש, ניווט או פעולה… (⌘K)"
          className="text-ink w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--muted)]"
        />
        {!inline ? <kbd className="text-muted rounded border border-[var(--line)] px-1.5 text-[10px] font-bold">ESC</kbd> : null}
      </div>
      <div className="overflow-y-auto p-3">{list}</div>
    </div>
  );

  if (inline) return <div dir="rtl">{panel}</div>;

  return (
    <div dir="rtl" className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-[640px]" onClick={(e) => e.stopPropagation()}>{panel}</div>
    </div>
  );
}

const KIND_HE: Record<string, string> = { search: "חיפוש", navigate: "ניווט", open: "פתיחה", jump: "מעבר", recent: "אחרון", quick_action: "פעולה" };
