import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";

export interface RecoItemView {
  matchId: string;
  title: string;
  compatibility: number;
  closing: number;
  opportunity: number;
}

const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-danger");

/** Recommended matches list — reused in property/buyer/seller command centers. */
export function RecommendedMatches({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: RecoItemView[];
}) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Sparkles" size={16} /></span>
        <h3 className="text-ink text-sm font-extrabold">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-muted py-4 text-center text-sm">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 6).map((it) => (
            <li key={it.matchId}>
              <Link href={`/matches/${it.matchId}`} className="hover:bg-surface flex items-center justify-between gap-2 rounded-xl px-2 py-2 transition">
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">{it.title}</span>
                <span className="flex shrink-0 items-center gap-3 text-[11px] font-bold">
                  <span className={cn(tone(it.compatibility))}>התאמה {it.compatibility}</span>
                  <span className={cn(tone(it.closing))}>סגירה {it.closing}%</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
