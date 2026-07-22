// 👤 My Opportunities — the broker-scoped territory opportunities (Daily OS
// territory, from the broker workspace). Inherited verbatim; no new scoring.
import Link from "next/link";
import { loadDailyOS } from "@/lib/broker-home/providers";
import { CardShell, CardUnavailable } from "../CardShell";

export async function OpportunitiesCard() {
  const os = await loadDailyOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="ההזדמנויות שלי" subtitle="טריטוריה · שלך בלבד" source="daily-os.territory.opportunities">
        <CardUnavailable note="ההזדמנויות אינן זמינות כעת" />
      </CardShell>
    );
  }
  const opps = os.territory.opportunities.slice(0, 4);
  return (
    <CardShell title="ההזדמנויות שלי" subtitle="טריטוריה · שלך בלבד" source="daily-os.territory.opportunities">
      {opps.length === 0 ? (
        <p className="text-muted text-[12px]">אין הזדמנויות בולטות כרגע.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {opps.map((o, i) => (
            <li key={`${o.href}:${i}`} className="rounded-[14px] border border-[var(--line)] p-3">
              <div className="text-ink text-[12px] font-black">
                <Link href={o.href} className="hover:underline">{o.title}</Link>
              </div>
              <p className="text-muted mt-0.5 text-[11px]">{o.why}</p>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
