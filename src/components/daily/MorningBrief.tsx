// ============================================================================
// ZONO — "על הבוקר" Morning Brief. The first-5-seconds action center: what
// happened, what needs attention, what to do next. Hierarchy, NOT a wall of
// equal cards — hero → next action → prioritized list → contextual modules.
// Every number reconciles with DB truth (getDailyCommandCenter). Dynamic:
// empty sections are omitted. RTL, desktop-wide, mobile-first, ZONO depth.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getDailyCommandCenter } from "@/lib/daily/command-center";
import { TEMP_LABEL } from "@/lib/daily/priority";

const DATE_FMT = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
const TIME_FMT = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const timeHe = (iso: string | null) => (iso ? TIME_FMT.format(new Date(iso)) : "");

const PRI_TONE: Record<string, string> = {
  P0: "bg-rose-500/15 text-rose-400 ring-rose-500/20",
  P1: "bg-amber-500/15 text-amber-400 ring-amber-500/20",
  P2: "bg-surface text-muted ring-transparent",
};
const TEMP_TONE: Record<string, string> = {
  hot: "bg-rose-500/15 text-rose-400", warm: "bg-amber-500/15 text-amber-400", cold: "bg-surface text-muted",
};

function SectionTitle({ icon, children, extra }: { icon: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-ink flex items-center gap-2 text-sm font-black">
        <span className="bg-surface text-brand-strong grid h-7 w-7 place-items-center rounded-lg"><Icon name={icon} size={15} /></span>
        {children}
      </h2>
      {extra}
    </div>
  );
}

export async function MorningBrief() {
  let b;
  try { b = await getDailyCommandCenter(); } catch { return null; }
  if (!b) return null;

  const hasContent =
    b.priorityActions.length > 0 || b.leads.length > 0 || b.properties.length > 0 ||
    b.calendar.length > 0 || b.overnight.length > 0 || b.completedToday.length > 0 ||
    b.marketing.waiting > 0 || b.marketing.publishedToday > 0;
  if (!hasContent) return null;

  const now = new Date(b.generatedAt);
  const primary = b.primaryAction;
  const chips: { label: string; value: number; icon: string }[] = [
    { label: "לידים לחזרה", value: b.hero.leadsWaiting, icon: "PhoneCall" },
    { label: "נכסים לא משווקים", value: b.hero.propertiesUnmarketed, icon: "Home" },
    { label: "מוכן לפרסום היום", value: b.hero.campaignsReadyToday, icon: "Send" },
    { label: "משימות באיחור", value: b.hero.overdueTasks, icon: "Clock" },
  ].filter((c) => c.value > 0);

  return (
    <div dir="rtl" className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
      {/* ── HERO ── */}
      <div className="relative overflow-hidden rounded-[26px] border border-line p-6 sm:p-8"
        style={{ background: "linear-gradient(135deg, var(--brand-soft,rgba(124,58,237,0.12)) 0%, var(--card,#0d0f14) 55%)" }}>
        <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--brand-strong,#7c3aed) 0%, transparent 70%)" }} />
        <div className="relative">
          <p className="text-muted text-xs font-bold">על הבוקר · {DATE_FMT.format(now)}</p>
          <h1 className="text-ink mt-1 text-2xl font-black sm:text-[28px]">{b.heroLine}</h1>

          {chips.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <span key={c.label} className="bg-card/70 border-line text-ink inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-bold backdrop-blur">
                  <Icon name={c.icon} size={14} className="text-brand-strong" />
                  <b>{c.value}</b> {c.label}
                </span>
              ))}
            </div>
          )}

          {primary && (
            <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-card/60 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${PRI_TONE[primary.priority]}`}><Icon name={primary.icon} size={20} /></span>
                <div className="min-w-0">
                  <p className="text-muted text-[11px] font-bold">הדבר הבא שכדאי לעשות</p>
                  <p className="text-ink truncate text-sm font-extrabold">{primary.title} · <span className="text-muted font-semibold">{primary.reason}</span></p>
                </div>
              </div>
              <Link href={primary.href} className="bg-brand-strong shrink-0 rounded-xl px-5 py-2.5 text-center text-sm font-black text-white">{primary.cta}</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── דורש טיפול (prioritized) ── */}
      {b.priorityActions.length > 1 && (
        <section className="mt-5 rounded-[22px] border border-line bg-card p-4 sm:p-5">
          <SectionTitle icon="AlertTriangle">דורש טיפול</SectionTitle>
          <ul className="flex flex-col gap-2">
            {b.priorityActions.slice(0, 6).map((a) => (
              <li key={a.id} className="border-line flex items-center gap-3 rounded-xl border bg-surface/40 p-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ${PRI_TONE[a.priority]}`}><Icon name={a.icon} size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-extrabold">{a.title}</p>
                  <p className="text-muted truncate text-xs">{a.reason}</p>
                </div>
                <Link href={a.href} className="border-line text-ink shrink-0 rounded-lg border bg-card px-3 py-1.5 text-xs font-bold">{a.cta}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── three-column operational modules on desktop ── */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Leads to call back */}
        {b.leads.length > 0 && (
          <section className="rounded-[22px] border border-line bg-card p-4 sm:p-5 lg:col-span-2">
            <SectionTitle icon="PhoneCall" extra={<Link href="/leads" className="text-brand-strong text-xs font-bold">לכל הלידים ←</Link>}>חייבים לחזור אליהם</SectionTitle>
            <ul className="flex flex-col gap-2">
              {b.leads.map((l) => (
                <li key={l.id} className="border-line flex items-center gap-3 rounded-xl border bg-surface/40 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-ink truncate text-sm font-extrabold">{l.name}</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TEMP_TONE[l.temperature]}`}>{TEMP_LABEL[l.temperature]}</span>
                      {l.unassigned && <span className="text-muted rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-bold">ללא שיוך</span>}
                    </div>
                    <p className="text-muted truncate text-xs">{l.reason}{l.source ? ` · ${l.source}` : ""}</p>
                  </div>
                  <Link href={l.href} className="bg-brand-strong shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white">חזרה לליד</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Today's marketing */}
        <section className="rounded-[22px] border border-line bg-card p-4 sm:p-5">
          <SectionTitle icon="Send" extra={<Link href="/distribution/daily" className="text-brand-strong text-xs font-bold">היום ←</Link>}>השיווק של היום</SectionTitle>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface/50 p-2.5"><p className="text-ink text-lg font-black">{b.marketing.plannedToday}</p><p className="text-muted text-[11px]">מתוכננים</p></div>
            <div className="rounded-xl bg-emerald-500/10 p-2.5"><p className="text-lg font-black text-emerald-400">{b.marketing.publishedToday}</p><p className="text-muted text-[11px]">פורסמו</p></div>
            <div className={`rounded-xl p-2.5 ${b.marketing.attention > 0 ? "bg-rose-500/10" : "bg-surface/50"}`}><p className={`text-lg font-black ${b.marketing.attention > 0 ? "text-rose-400" : "text-ink"}`}>{b.marketing.attention}</p><p className="text-muted text-[11px]">דורשים טיפול</p></div>
          </div>
          {b.marketing.nextPublishAt && <p className="text-muted mt-3 text-xs">הפרסום הבא: {timeHe(b.marketing.nextPublishAt)}</p>}
          {b.marketing.plannedToday === 0 && b.marketing.attention === 0 && b.marketing.waiting === 0 && (
            <Link href="/distribution" className="text-brand-strong mt-3 inline-block text-xs font-bold">אין מה לפרסם היום — צור קמפיין ←</Link>
          )}
        </section>
      </div>

      {/* ── property marketing health + calendar row ── */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {b.properties.length > 0 && (
          <section className="rounded-[22px] border border-line bg-card p-4 sm:p-5">
            <SectionTitle icon="Home" extra={<Link href="/distribution" className="text-brand-strong text-xs font-bold">כל הנכסים ←</Link>}>נכסים שדורשים תשומת לב</SectionTitle>
            <ul className="flex flex-col gap-2">
              {b.properties.map((p) => (
                <li key={p.propertyId} className="border-line flex items-center gap-3 rounded-xl border bg-surface/40 p-2.5">
                  <span className="bg-surface text-muted grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-cover bg-center"
                    style={p.thumbnailUrl ? { backgroundImage: `url(${p.thumbnailUrl})` } : undefined}>
                    {!p.thumbnailUrl && <Icon name="Home" size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-extrabold">{p.title}</p>
                    <p className="text-muted truncate text-xs">{p.statusLabel}{p.city ? ` · ${p.city}` : ""}</p>
                  </div>
                  <Link href={p.href} className="bg-brand-strong shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white">{p.cta}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {b.calendar.length > 0 && (
          <section className="rounded-[22px] border border-line bg-card p-4 sm:p-5">
            <SectionTitle icon="Calendar" extra={<Link href="/today" className="text-brand-strong text-xs font-bold">ליומן ←</Link>}>היום ביומן</SectionTitle>
            <ul className="flex flex-col gap-1.5">
              {b.calendar.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                  <span className="text-brand-strong w-12 shrink-0 text-xs font-bold">{c.at ? timeHe(c.at) : "—"}</span>
                  <Link href={c.href} className="text-ink truncate text-sm font-semibold hover:underline">{c.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ── manager: pipeline + team exceptions ── */}
      {b.isManager && (b.pipeline || b.team.length > 0) && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {b.pipeline && (b.pipeline.advanced > 0 || b.pipeline.newDeals > 0 || b.pipeline.stuck > 0) && (
            <section className="rounded-[22px] border border-line bg-card p-4 sm:p-5">
              <SectionTitle icon="TrendingUp">תנועת פייפליין</SectionTitle>
              <ul className="text-ink flex flex-col gap-1.5 text-sm font-semibold">
                {b.pipeline.advanced > 0 && <li>· {b.pipeline.advanced} עסקאות התקדמו מאז אתמול</li>}
                {b.pipeline.newDeals > 0 && <li>· {b.pipeline.newDeals} עסקאות חדשות נפתחו</li>}
                {b.pipeline.stuck > 0 && <li className="text-amber-400">· {b.pipeline.stuck} עסקאות תקועות{b.pipeline.stuckExample ? ` (עד ${b.pipeline.stuckExample.days} ימים)` : ""}</li>}
              </ul>
            </section>
          )}
          {b.team.length > 0 && (
            <section className="rounded-[22px] border border-line bg-card p-4 sm:p-5">
              <SectionTitle icon="Users">תמונת משרד</SectionTitle>
              <ul className="flex flex-col gap-2">
                {b.team.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink text-sm font-semibold">{t.label}</span>
                    {t.href && <Link href={t.href} className="text-brand-strong text-xs font-bold">לטיפול ←</Link>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* ── overnight changes + completed today (slim footer strip) ── */}
      {(b.overnight.length > 0 || b.completedToday.length > 0) && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {b.overnight.length > 0 && (
            <section className="rounded-[22px] border border-line bg-card/60 p-4 sm:p-5">
              <SectionTitle icon="Sparkles">מה השתנה מאז אתמול</SectionTitle>
              <ul className="flex flex-col gap-1.5">
                {b.overnight.map((o) => (
                  <li key={o.id} className="text-ink flex items-center gap-2 text-sm">
                    <Icon name={o.icon} size={14} className="text-brand-strong" />
                    {o.href ? <Link href={o.href} className="hover:underline">{o.label}</Link> : <span>{o.label}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {b.completedToday.length > 0 && (
            <section className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/[0.06] p-4 sm:p-5">
              <SectionTitle icon="CheckCircle">היום כבר הספקתם</SectionTitle>
              <ul className="flex flex-col gap-1.5">
                {b.completedToday.map((c) => (
                  <li key={c.id} className="text-ink flex items-center gap-2 text-sm font-semibold">
                    <Icon name="Check" size={14} className="text-emerald-400" /> {c.label}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
