import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getCommunicationOrgSignals } from "@/lib/communication/service";

const hrefFor = (t: string, id: string) =>
  t === "seller" ? `/sellers/${id}` : t === "buyer" ? `/buyers/${id}` : t === "property" ? `/properties/${id}` : t === "match" ? `/matches/${id}` : "#";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");

function Stat({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={`mb-1 inline-flex ${tone}`}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-2xl font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}

/** Communication intelligence dashboard widgets (server component). */
export async function CommunicationDashboardSection() {
  let s;
  try {
    s = await getCommunicationOrgSignals();
  } catch (e) {
    console.error("[communication] dashboard signals failed:", e);
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="MessageCircle" size={16} /></span>
        <h2 className="text-ink text-lg font-black">תקשורת ומערכות יחסים</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat icon="Clock" label="פולואפים להיום" value={s.followupsDueToday.length} tone="text-brand-strong" />
        <Stat icon="Shield" label="התחייבויות באיחור" value={s.overdueCommitments.length} tone="text-danger" />
        <Stat icon="MessageCircle" label="ממתינים לתגובה" value={s.noResponse.length} tone="text-warning" />
        <Stat icon="AlertTriangle" label="סנטימנט שלילי" value={s.negativeSentiment.length} tone="text-danger" />
        <Stat icon="Sparkles" label="פעולות חמות" value={s.followupsDueToday.length + s.overdueCommitments.length} tone="text-success" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">פולואפים להיום</p>
          {s.followupsDueToday.length === 0 ? <p className="text-muted text-xs">אין פולואפים להיום ✓</p> : (
            <ul className="flex flex-col gap-1.5">
              {s.followupsDueToday.slice(0, 5).map((f) => (
                <li key={f.id} className="text-sm"><Link href={hrefFor(f.entityType, f.entityId)} className="text-ink hover:text-brand font-semibold">{f.title}</Link> <span className="text-muted text-[11px]">· {fmt(f.dueAt)}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">התחייבויות באיחור</p>
          {s.overdueCommitments.length === 0 ? <p className="text-muted text-xs">אין התחייבויות באיחור ✓</p> : (
            <ul className="flex flex-col gap-1.5">
              {s.overdueCommitments.slice(0, 5).map((c) => (
                <li key={c.id} className="text-sm"><Link href={hrefFor(c.entityType, c.entityId)} className="text-ink hover:text-brand font-semibold">{c.text}</Link> <span className="text-danger text-[11px]">· {fmt(c.dueDate)}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">תקשורת אחרונה</p>
          {s.recent.length === 0 ? <p className="text-muted text-xs">אין תקשורת מתועדת</p> : (
            <ul className="flex flex-col gap-1.5">
              {s.recent.slice(0, 5).map((r, i) => (
                <li key={i} className="text-sm"><Link href={hrefFor(r.entityType, r.entityId)} className="text-ink hover:text-brand font-semibold">{r.title}</Link> <span className="text-muted text-[11px]">· {fmt(r.at)}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
