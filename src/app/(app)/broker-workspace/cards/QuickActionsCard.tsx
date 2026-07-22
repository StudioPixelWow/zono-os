// 👤 Quick Actions — the broker's own approval-gated items (Daily OS approvals,
// built from the broker workspace pending approvals). Existing actions only —
// every item links to its canonical approval surface; nothing is executed here.
import Link from "next/link";
import { loadDailyOS } from "@/lib/broker-home/providers";
import { CardShell, CardUnavailable } from "../CardShell";

export async function QuickActionsCard() {
  const os = await loadDailyOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="פעולות מהירות" subtitle="אישורים קיימים שלך · ללא ביצוע אוטומטי" source="daily-os.approvals">
        <CardUnavailable note="הפעולות אינן זמינות כעת" />
      </CardShell>
    );
  }
  const items = os.approvals.slice(0, 5);
  return (
    <CardShell title="פעולות מהירות" subtitle="אישורים קיימים שלך · ללא ביצוע אוטומטי" source="daily-os.approvals">
      {items.length === 0 ? (
        <p className="text-muted text-[12px]">אין אישורים ממתינים ✓</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex items-center justify-between rounded-[12px] border border-[var(--line)] px-3 py-2 hover:bg-[var(--surface-2,#f7f7fa)]">
                <span className="text-ink text-[12px] font-bold">{a.title}</span>
                <span className="text-brand shrink-0 text-[11px] font-bold">פתח לאישור →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
