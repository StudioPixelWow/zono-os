// 👤 Today's Priorities — the canonical Broker Intelligence queue (Daily OS
// actionFeed) FILTERED to the broker's own entities, verbatim order/priority.
// Never reprioritized; ownership filtering only removes other brokers' items.
import Link from "next/link";
import { loadDailyOS } from "@/lib/broker-home/providers";
import { brokerPriorities } from "@/lib/broker-home/compose";
import { CardShell, CardUnavailable } from "../CardShell";

const URG: Record<string, string> = { critical: "text-danger", high: "text-warning", medium: "text-brand", low: "text-muted" };

export async function TodaysPrioritiesCard() {
  const os = await loadDailyOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="המשימות של היום" subtitle="תור המודיעין הקנוני — שלך בלבד" source="broker-intelligence (broker-scoped)">
        <CardUnavailable note="התור אינו זמין כעת" />
      </CardShell>
    );
  }
  const items = brokerPriorities(os).slice(0, 6);
  return (
    <CardShell title="המשימות של היום" subtitle="תור המודיעין הקנוני — שלך בלבד" source="broker-intelligence (broker-scoped)">
      {items.length === 0 ? (
        <p className="text-muted text-[12px]">אין כרגע משימה מבוססת-ראיות בתור שלך ✓</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.id} className="rounded-[14px] border border-[var(--line)] p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink text-[13px] font-black">{a.title}</span>
                <span className={`shrink-0 text-[11px] font-bold ${URG[a.urgency] ?? "text-muted"}`}>ביטחון {a.confidence}%</span>
              </div>
              <p className="text-muted mt-1 text-[12px]">{a.suggestedAction}</p>
              {a.href ? <Link href={a.href} className="text-brand text-[10px] font-bold">פתח →</Link> : null}
            </li>
          ))}
        </ol>
      )}
    </CardShell>
  );
}
