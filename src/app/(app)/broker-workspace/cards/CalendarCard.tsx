// 👤 Calendar — the broker's own meetings + suggested items (Daily OS timeline,
// built from the broker workspace calendar). Inherited timeline; no new events.
import Link from "next/link";
import { loadDailyOS } from "@/lib/broker-home/providers";
import { CardShell, CardUnavailable } from "../CardShell";

const when = (iso: string) => new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export async function CalendarCard() {
  const os = await loadDailyOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="היומן שלי" subtitle="פגישות והצעות · שלך בלבד" source="daily-os.timeline">
        <CardUnavailable note="היומן אינו זמין כעת" />
      </CardShell>
    );
  }
  const items = os.timeline.filter((t) => t.source === "meeting" || t.source === "suggested").slice(0, 6);
  return (
    <CardShell title="היומן שלי" subtitle="פגישות והצעות · שלך בלבד" source="daily-os.timeline">
      {items.length === 0 ? (
        <p className="text-muted text-[12px]">אין פגישות קרובות.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((t, i) => (
            <li key={`${t.at}:${i}`} className="flex items-start gap-2">
              <span className="shrink-0 text-[14px]">{t.icon}</span>
              <div className="min-w-0">
                <div className="text-ink text-[12px] font-bold">
                  {t.href ? <Link href={t.href} className="hover:underline">{t.title}</Link> : t.title}
                </div>
                <div className="text-muted text-[11px]">{when(t.at)}{t.detail ? ` · ${t.detail}` : ""}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
