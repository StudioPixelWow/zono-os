// 🏛️ Quick Actions card — reuses getExecutiveOS().approvalCenter: EXISTING
// approval bundles surfaced as links to their entity. The workspace NEVER
// invents an action and NEVER reorders priorities — bundles are shown in the
// order Executive OS already provided, and every item is a link to the canonical
// approval surface (nothing is executed from here).
import Link from "next/link";
import { loadExecutiveOS } from "@/lib/executive-workspace/providers";
import { CardShell, CardUnavailable } from "../CardShell";

export async function QuickActionsCard() {
  const os = await loadExecutiveOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="פעולות מהירות" subtitle="אישורים קיימים בלבד · ללא ביצוע אוטומטי" source="executive-os.approvalCenter">
        <CardUnavailable note="הפעולות אינן זמינות כעת" />
      </CardShell>
    );
  }
  const bundles = os.approvalCenter.bundles.slice(0, 5);
  return (
    <CardShell title="פעולות מהירות" subtitle={`${os.approvalCenter.count} אישורים ממתינים · ללא ביצוע אוטומטי`} source="executive-os.approvalCenter">
      {bundles.length === 0 ? (
        <p className="text-muted text-[12px]">אין אישורים ממתינים ✓</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bundles.map((b) => (
            <li key={b.bundleId}>
              <Link
                href={b.entityHref ?? "/command"}
                className="flex items-center justify-between rounded-[12px] border border-[var(--line)] px-3 py-2 hover:bg-[var(--surface-2,#f7f7fa)]"
              >
                <span className="text-ink text-[12px] font-bold">{b.title}</span>
                <span className="text-brand shrink-0 text-[11px] font-bold">פתח לאישור →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
