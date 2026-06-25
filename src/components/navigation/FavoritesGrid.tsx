"use client";
// ZONO Command Center — "המועדפים שלי". Static defaults today; structured for
// future per-user persistence (favorite / favoriteOrder / canFavorite).
import { Icon } from "@/components/dashboard/Icon";
import { DEFAULT_FAVORITE_IDS, favoriteItems, type CommandItem } from "./commandRegistry";

export function FavoritesGrid({ onGo }: { onGo: (item: CommandItem) => void }) {
  const items = favoriteItems(DEFAULT_FAVORITE_IDS);
  if (items.length === 0) return null;
  return (
    <section aria-label="המועדפים שלי" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-500/20 text-amber-300"><Icon name="Star" size={14} /></span>
        <p className="text-sm font-black text-white">המועדפים שלי</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            disabled={it.disabled}
            onClick={() => !it.disabled && onGo(it)}
            className="group flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-right transition hover:border-violet-400/35 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200 transition group-hover:bg-violet-500/25"><Icon name={it.icon} size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-white">{it.label}</span>
              {it.description && <span className="block truncate text-[11px] text-white/45">{it.description}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
