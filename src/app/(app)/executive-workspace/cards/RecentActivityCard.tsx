// 🏛️ Recent Executive Activity card — reuses getExecutiveOS().timeline
// (ExecTimelineItem[]). Inherited events only; the workspace records nothing.
import Link from "next/link";
import { loadExecutiveOS } from "@/lib/executive-workspace/providers";
import { CardShell, CardUnavailable } from "../CardShell";

const time = (iso: string) => new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export async function RecentActivityCard() {
  const os = await loadExecutiveOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="פעילות ניהולית אחרונה" subtitle="ציר הזמן מ-Executive OS" source="executive-os.timeline">
        <CardUnavailable note="ציר הפעילות אינו זמין כעת" />
      </CardShell>
    );
  }
  const items = os.timeline.slice(0, 6);
  return (
    <CardShell title="פעילות ניהולית אחרונה" subtitle="ציר הזמן מ-Executive OS" source="executive-os.timeline">
      {items.length === 0 ? (
        <p className="text-muted text-[12px]">אין פעילות מתועדת כרגע.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((t, i) => (
            <li key={`${t.at}:${i}`} className="flex items-start gap-2">
              <span className="text-muted mt-0.5 shrink-0 text-[10px] font-bold">{time(t.at)}</span>
              <div>
                <div className="text-ink text-[12px] font-bold">
                  {t.href ? <Link href={t.href} className="hover:underline">{t.title}</Link> : t.title}
                </div>
                {t.detail ? <div className="text-muted text-[11px]">{t.detail}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
