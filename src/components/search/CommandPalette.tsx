"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import { searchModules, type ModuleEntry } from "@/lib/navigation/registry";
import { globalSearchAction } from "@/lib/search/actions";
import type { SearchGroup } from "@/lib/search/service";

/**
 * Universal search command palette (CMD/CTRL+K). Searches modules (instant, from
 * the navigation registry) + org entities (server, RLS-scoped). RTL, grouped.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [modules, setModules] = useState<ModuleEntry[]>([]);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tid = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const onChange = (value: string) => {
    setQ(value);
    setModules(searchModules(value));
    if (tid.current) clearTimeout(tid.current);
    const term = value.trim();
    if (term.length < 2) { setGroups([]); setLoading(false); return; }
    setLoading(true);
    tid.current = setTimeout(async () => {
      try { setGroups(await globalSearchAction(term)); } catch { setGroups([]); } finally { setLoading(false); }
    }, 220);
  };

  const go = (href: string) => { setOpen(false); setQ(""); setModules([]); setGroups([]); router.push(href); };

  if (!open) return null;

  const hasResults = modules.length > 0 || groups.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div dir="rtl" className="bg-card border-line w-full max-w-2xl overflow-hidden rounded-[20px] border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-line flex items-center gap-2 border-b px-4">
          <Icon name="Search" size={18} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => onChange(e.target.value)}
            placeholder="חיפוש מודולים, נכסים, קונים, מוכרים, מתווכים…"
            className="text-ink flex-1 bg-transparent py-3.5 text-sm outline-none"
          />
          {loading && <Spinner size={16} />}
          <kbd className="text-muted bg-surface rounded px-1.5 py-0.5 text-[10px] font-bold">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {modules.length > 0 && (
            <Group label="מודולים" icon="Menu">
              {modules.slice(0, 8).map((m) => (
                <Row key={m.id} icon={m.icon} title={m.label} subtitle={m.description ?? m.route} onClick={() => go(m.route)} />
              ))}
            </Group>
          )}
          {groups.map((g) => (
            <Group key={g.type} label={g.label} icon={g.icon}>
              {g.hits.map((h) => <Row key={h.id} icon={g.icon} title={h.title} subtitle={h.subtitle} onClick={() => go(h.href)} />)}
            </Group>
          ))}
          {q.trim().length >= 2 && !loading && !hasResults && (
            <p className="text-muted py-8 text-center text-sm">לא נמצאו תוצאות עבור ״{q}״</p>
          )}
          {q.trim().length < 2 && (
            <p className="text-muted py-8 text-center text-sm">הקלד לפחות 2 תווים. טיפ: CMD/CTRL + K לפתיחה מהירה.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="text-muted flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold"><Icon name={icon} size={12} />{label}</p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle: string | null; onClick: () => void }) {
  return (
    <button onClick={onClick} className="hover:bg-brand-soft flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-right">
      <span className="bg-surface text-muted grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name={icon} size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-sm font-semibold">{title}</span>
        {subtitle && <span className="text-muted block truncate text-[11px]">{subtitle}</span>}
      </span>
      <Icon name="ChevronLeft" size={14} className="text-muted" />
    </button>
  );
}
