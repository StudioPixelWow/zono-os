// 👤 Shared presentational row for broker ScoredEntity lists (buyers / sellers /
// recent activity). Pure display of inherited fields — no scoring, no logic.
import Link from "next/link";
import type { ScoredEntity } from "@/lib/broker-workspace/types";

const tone = (n: number | null) => (n == null ? "text-muted" : n >= 70 ? "text-success" : n >= 45 ? "text-warning" : "text-danger");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short" }) : "");

export function EntityList({ items, show = "health" }: { items: ScoredEntity[]; show?: "health" | "activity" }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-2 rounded-[12px] border border-[var(--line)] px-3 py-2">
          <div className="min-w-0">
            <Link href={e.href} className="text-ink text-[12px] font-bold hover:underline">{e.name}</Link>
            <div className="text-muted truncate text-[11px]">{e.riskLabel ?? e.stage ?? e.reason ?? ""}</div>
          </div>
          {show === "activity"
            ? <span className="text-muted shrink-0 text-[11px] font-bold">{when(e.lastActivityAt)}</span>
            : <span className={`shrink-0 text-[13px] font-black ${tone(e.healthScore)}`}>{e.healthScore ?? "—"}</span>}
        </li>
      ))}
    </ul>
  );
}
