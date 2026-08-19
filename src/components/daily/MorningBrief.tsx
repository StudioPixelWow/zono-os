// ============================================================================
// ZONO — "על הבוקר" Morning Brief. An ACTION CENTER, not a business report.
// It renders INSIDE the Home Control Center, in the system's graphic language
// (rounded cards + soft shadow + pill chips + primary button), REPLACING the
// old "מה דורש פעולה" + "משימות להיום" row. The page opener (Hero) already
// greets the agent, so this block carries NO greeting of its own — only the
// operational answer: what needs me now · who to call back · what's on today ·
// what to publish. Data comes unchanged from getDailyCommandCenter(); this file
// is presentation only. RTL, low card-nesting, restrained purple.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getDailyCommandCenter } from "@/lib/daily/command-center";

const DATE_FMT = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
const TIME_FMT = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const timeHe = (iso: string | null) => (iso ? TIME_FMT.format(new Date(iso)) : "—");
const PRI_DOT: Record<string, string> = { P0: "bg-danger", P1: "bg-warning", P2: "bg-muted/50" };

// Greeting-free summary line (the Hero owns the "בוקר טוב"). Keeps the useful
// count the agent saw before, without duplicating the salutation.
function summaryLine(actionCount: number): string {
  if (actionCount <= 0) return "הכול בשליטה להיום — אין פעולות דחופות ✓";
  if (actionCount === 1) return "יש דבר אחד שכדאי לטפל בו היום";
  return `יש ${actionCount} דברים שכדאי לטפל בהם היום`;
}

// Card-scoped column header (icon + title + optional "הצג הכל").
function ColHead({ icon, title, href, more }: { icon: string; title: string; href: string; more?: boolean }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-ink flex items-center gap-1.5 text-sm font-black"><Icon name={icon} size={15} className="text-muted" />{title}</h3>
      {more && <Link href={href} className="text-brand-strong hover:text-brand text-xs font-bold">הצג הכל</Link>}
    </div>
  );
}
function ColEmpty({ text }: { text: string }) {
  return <div className="text-muted flex flex-col items-center justify-center gap-1 py-6 text-center text-xs"><Icon name="CheckCircle" size={20} className="text-success" />{text}</div>;
}

const CARD = "bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]";

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
    <section dir="rtl" className="flex flex-col gap-4">
      {/* ── Section header — NO greeting (the Hero already greeted) ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-ink text-lg font-black sm:text-xl">על הבוקר</h2>
          <p className="text-muted mt-0.5 text-sm">{summaryLine(b.actionCount)} · {DATE_FMT.format(new Date(b.generatedAt))}</p>
          <Link href="/today/plan" className="text-brand-strong hover:text-brand mt-1 inline-flex items-center gap-1 text-sm font-black">
            <Icon name="Sparkles" size={14} /> תכנן לי את היום ←
          </Link>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.label} className="border-line bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-bold">
                <span className="bg-brand-soft text-brand-strong grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12px] font-black">{c.v}</span>
                <span className="text-ink">{c.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── ONE primary action ── */}
      {primary && (
        <div className={`${CARD} flex items-center gap-3 !p-4`}>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRI_DOT[primary.priority] ?? "bg-muted/50"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-muted text-[11px] font-bold">הדבר הבא שכדאי לעשות</p>
            <p className="text-ink truncate text-sm font-extrabold">{primary.title} <span className="text-muted font-normal">· {primary.reason}</span></p>
          </div>
          <Link href={primary.href} className="btn-zono-primary shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold">{primary.cta}</Link>
        </div>
      )}

      {/* ── Three operational columns — each a system card ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Leads to call back */}
        <div className={CARD}>
          <ColHead icon="PhoneCall" title="לידים לחזרה" href="/leads" more={b.leads.length > 5} />
          {b.leads.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {b.leads.slice(0, 5).map((l) => (
                <li key={l.id}>
                  <Link href={l.href} className="border-line hover:bg-surface/60 flex items-center gap-2 rounded-xl border px-3 py-2.5 transition">
                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate text-sm font-bold">{l.name}</p>
                      <p className="text-muted truncate text-xs">{l.reason}</p>
                    </div>
                    <span className="text-brand-strong shrink-0 inline-flex items-center gap-1 text-[13px] font-black">פתח <Icon name="ArrowLeft" size={13} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <ColEmpty text="הכול טופל" />}
        </div>

        {/* Today — tasks + calendar merged, chronological */}
        <div className={CARD}>
          <ColHead icon="Calendar" title="היום" href="/today" more={b.calendar.length > 5} />
          {b.calendar.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {b.calendar.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link href={c.href} className="border-line hover:bg-surface/60 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition">
                    <span className="text-brand-strong w-12 shrink-0 text-xs font-black">{timeHe(c.at)}</span>
                    <span className="text-ink truncate text-sm font-semibold">{c.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <ColEmpty text="אין משימות מתוזמנות להיום" />}
        </div>

        {/* Today's marketing (+ property exception one-liner) */}
        <div className={CARD}>
          <ColHead icon="Send" title="השיווק של היום" href="/distribution/daily" />
          <p className="text-ink text-sm font-bold">
            {b.marketing.plannedToday} מתוכננים · {b.marketing.publishedToday} פורסמו
            {b.marketing.attention > 0 ? <span className="text-danger"> · {b.marketing.attention} דורשים טיפול</span> : null}
          </p>
          {b.marketing.nextPublishAt && <p className="text-muted mt-1 text-xs">הפרסום הבא: {timeHe(b.marketing.nextPublishAt)}</p>}
          <Link href="/distribution/daily" className="btn-zono-primary mt-3 inline-block rounded-lg px-3 py-2 text-xs font-bold">
            {b.marketing.attention > 0 ? "לטיפול" : "פרסום עכשיו"}
          </Link>
          {unmarketed > 0 && (
            <p className="border-line text-muted mt-3 border-t pt-3 text-xs">
              {unmarketed} נכסים לא משווקים · <Link href="/distribution" className="text-brand-strong font-bold">לכל הנכסים</Link>
            </p>
          )}
        </div>
      </div>

      {/* ── Manager exception — one compact line ── */}
      {managerLine && (
        <div className="border-line bg-surface/40 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-xs">
          <span className="text-muted font-bold">משרד:</span>
          {(b.pipeline?.stuck ?? 0) > 0 && <Link href="/deals" className="text-ink hover:underline">{b.pipeline?.stuck} עסקאות תקועות</Link>}
          {b.team.map((t) => (<Link key={t.id} href={t.href ?? "/leads"} className="text-ink hover:underline">{t.label}</Link>))}
        </div>
      )}

      {/* ── Everything secondary — collapsed ── */}
      {(b.overnight.length > 0 || b.completedToday.length > 0) && (
        <details className={`${CARD} !p-0`}>
          <summary className="text-ink cursor-pointer select-none px-5 py-3.5 text-sm font-bold">עוד דברים שכדאי לדעת</summary>
          <div className="border-line flex flex-col gap-3 border-t p-5">
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
    </section>
  );
}
