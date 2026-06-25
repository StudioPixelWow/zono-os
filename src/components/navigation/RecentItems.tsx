"use client";
// ZONO Command Center — "נפתחו לאחרונה" (localStorage `zono_recent_items`).
import { Icon } from "@/components/dashboard/Icon";
import { useRecentItems } from "@/hooks/useRecentItems";

export function RecentItems({ onGoHref }: { onGoHref: (href: string, label: string, id: string, icon?: string) => void }) {
  const { items, clear } = useRecentItems();

  return (
    <section aria-label="נפתחו לאחרונה" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10 text-white/70"><Icon name="Activity" size={14} /></span>
          <p className="text-sm font-black text-white">נפתחו לאחרונה</p>
        </div>
        {items.length > 0 && (
          <button type="button" onClick={clear} className="text-[11px] font-bold text-white/40 transition hover:text-white/70">ניקוי</button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-xs text-white/40">עדיין אין פריטים אחרונים — הם יופיעו כאן ככל שתנווט במערכת.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <button key={it.id} type="button" onClick={() => onGoHref(it.href, it.label, it.id, it.icon)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white/80 transition hover:border-violet-400/30 hover:bg-white/[0.08] hover:text-white">
              <Icon name={it.icon ?? "ChevronLeft"} size={14} className="text-violet-200" />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
