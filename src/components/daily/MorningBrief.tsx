// ============================================================================
// ZONO — "על הבוקר" Morning Brief. An ACTION CENTER, not a business report.
// First viewport answers: what needs me now · who to call back · what to publish
// · what's on today · what's next. One compact hero, ONE primary action, a slim
// status strip, three tight operational columns (≤5 rows each), a one-line
// manager exception, and everything secondary collapsed behind "עוד דברים
// שכדאי לדעת". Data comes unchanged from getDailyCommandCenter(); this file is
// presentation only. RTL, real desktop width, low card-nesting, restrained purple.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getDailyCommandCenter } from "@/lib/daily/command-center";

const DATE_FMT = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
const TIME_FMT = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const timeHe = (iso: string | null) => (iso ? TIME_FMT.format(new Date(iso)) : "—");
const PRI_DOT: Record<string, string> = { P0: "bg-rose-500", P1: "bg-amber-500", P2: "bg-slate-400" };

function Head({ icon, title, href, more }: { icon: string; title: string; href: string; more?: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-ink flex items-center gap-1.5 text-sm font-black"><Icon name={icon} size={15} className="text-muted" />{title}</h2>
      {more && <Link href={href} className="text-brand-strong text-xs font-bold">הצג הכל</Link>}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="border-line text-muted rounded-2xl border bg-card p-4 text-center text-xs">{text}</div>;
}

export async function MorningBrief() {
  let b;
  try { b = await getDailyCommandCenter(); } catch { return null; }
  if (!b) return null;

  const hasContent =
    b.priorityActions.length > 0 || b.leads.length > 0 || b.calendar.length > 0 ||
    b.marketing.waiting > 0 || b.marketing.publishedToday > 0 || b.overnight.length > 0;
  if (!hasContent) return null;

  const primary = b.primaryAction;
  const chips = [
    { v: b.hero.leadsWaiting, label: "לידים לחזרה" },
    { v: b.hero.overdueTasks, label: "באיחור" },
    { v: b.calendar.length, label: "משימות היום" },
    { v: b.hero.campaignsReadyToday, label: "פרסומים" },
  ].filter((c) => c.v > 0);
  const unmarketed = b.hero.propertiesUnmarketed;
  const managerLine = b.isManager && ((b.pipeline?.stuck ?? 0) > 0 || b.team.length > 0);

  return (
    <div dir="rtl" className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      {/* ── Compact hero ── */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-ink text-xl font-black sm:text-2xl">{b.heroLine}</h1>
          <p className="text-muted text-xs">{DATE_FMT.format(new Date(b.generatedAt))}</p>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {chips.map((c) => (<span key={c.label} className="text-muted"><b className="text-ink">{c.v}</b> {c.label}</span>))}
          </div>
        )}
      </div>

      {/* ── ONE primary action ── */}
      {primary && (
        <div className="border-line mb-4 flex items-center gap-3 rounded-2xl border bg-card p-3.5">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRI_DOT[primary.priority] ?? "bg-slate-400"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-muted text-[11px] font-bold">הדבר הבא שכדאי לעשות</p>
            <p className="text-ink truncate text-sm font-extrabold">{primary.title} <span className="text-muted font-normal">· {primary.reason}</span></p>
          </div>
          <Link href={primary.href} className="bg-brand-strong shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white">{primary.cta}</Link>
        </div>
      )}

      {/* ── Three operational columns ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Leads to call back */}
        <section>
          <Head icon="PhoneCall" title="לידים לחזרה" href="/leads" more={b.leads.length > 5} />
          {b.leads.length > 0 ? (
            <ul className="divide-line border-line flex flex-col divide-y rounded-2xl border bg-card">
              {b.leads.slice(0, 5).map((l) => (
                <li key={l.id} className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-bold">{l.name}</p>
                    <p className="text-muted truncate text-xs">{l.reason}</p>
                  </div>
                  <Link href={l.href} className="text-brand-strong shrink-0 text-xs font-bold">פתח ←</Link>
                </li>
              ))}
            </ul>
          ) : <Empty text="הכול טופל ✓" />}
        </section>

        {/* Today — tasks + calendar merged, chronological */}
        <section>
          <Head icon="Calendar" title="היום" href="/today" more={b.calendar.length > 5} />
          {b.calendar.length > 0 ? (
            <ul className="divide-line border-line flex flex-col divide-y rounded-2xl border bg-card">
              {b.calendar.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-3">
                  <span className="text-brand-strong w-12 shrink-0 text-xs font-bold">{timeHe(c.at)}</span>
                  <Link href={c.href} className="text-ink truncate text-sm font-semibold hover:underline">{c.title}</Link>
                </li>
              ))}
            </ul>
          ) : <Empty text="אין משימות מתוזמנות להיום" />}
        </section>

        {/* Today's marketing (+ property exception one-liner) */}
        <section>
          <Head icon="Send" title="השיווק של היום" href="/distribution/daily" />
          <div className="border-line rounded-2xl border bg-card p-3">
            <p className="text-ink text-sm font-bold">
              {b.marketing.plannedToday} מתוכננים · {b.marketing.publishedToday} פורסמו
              {b.marketing.attention > 0 ? <span className="text-rose-500"> · {b.marketing.attention} דורשים טיפול</span> : null}
            </p>
            {b.marketing.nextPublishAt && <p className="text-muted mt-1 text-xs">הפרסום הבא: {timeHe(b.marketing.nextPublishAt)}</p>}
            <Link href="/distribution/daily" className="bg-brand-strong mt-3 inline-block rounded-lg px-3 py-1.5 text-xs font-bold text-white">
              {b.marketing.attention > 0 ? "לטיפול" : "פרסום עכשיו"}
            </Link>
            {unmarketed > 0 && (
              <p className="border-line text-muted mt-3 border-t pt-2 text-xs">
                {unmarketed} נכסים לא משווקים · <Link href="/distribution" className="text-brand-strong font-bold">לכל הנכסים</Link>
              </p>
            )}
          </div>
        </section>
      </div>

      {/* ── Manager exception — one compact line ── */}
      {managerLine && (
        <div className="border-line mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-surface/40 px-3 py-2 text-xs">
          <span className="text-muted font-bold">משרד:</span>
          {(b.pipeline?.stuck ?? 0) > 0 && <Link href="/deals" className="text-ink hover:underline">{b.pipeline?.stuck} עסקאות תקועות</Link>}
          {b.team.map((t) => (<Link key={t.id} href={t.href ?? "/leads"} className="text-ink hover:underline">{t.label}</Link>))}
        </div>
      )}

      {/* ── Everything secondary — collapsed ── */}
      {(b.overnight.length > 0 || b.completedToday.length > 0) && (
        <details className="border-line mt-4 rounded-2xl border bg-card">
          <summary className="text-ink cursor-pointer select-none px-4 py-3 text-sm font-bold">עוד דברים שכדאי לדעת</summary>
          <div className="border-line flex flex-col gap-3 border-t p-4">
            {b.overnight.length > 0 && (
              <div>
                <p className="text-muted mb-1 text-xs font-bold">מה השתנה מאז אתמול</p>
                <ul className="text-ink flex flex-col gap-1 text-sm">
                  {b.overnight.slice(0, 3).map((o) => (<li key={o.id}>• {o.label}</li>))}
                </ul>
              </div>
            )}
            {b.completedToday.length > 0 && (
              <p className="text-muted text-xs">היום כבר הספקתם: {b.completedToday.map((c) => c.label).join(" · ")}</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
