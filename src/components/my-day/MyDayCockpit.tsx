// ============================================================================
// ZONO — "היום שלי" (My Day) — the zero-scroll DAILY COCKPIT (server component).
// Composition only; all data comes from the shared getMyDayCockpit() aggregation.
// Zero page-scroll at ≥1280px (xl height-clamp + panel-local scroll on overflow);
// stacks and scrolls normally below xl. Bright/white cards on lavender, purple ZI
// accents, existing tokens + Icon family. Every CTA deep-links a real route.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type {
  MyDayCockpit as Cockpit, CockpitAction, CockpitTimelineItem, CockpitOpportunity, CockpitClient, CockpitInsight,
} from "@/lib/my-day/service";

const CARD = "bg-card border-line rounded-[22px] border shadow-[var(--shadow-card)] flex flex-col min-h-0";
const TONE_SOFT: Record<string, string> = {
  brand: "bg-brand-soft text-brand", success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", neutral: "bg-surface text-muted",
};
const KPI_ACCENT: Record<string, string> = {
  brand: "bg-brand-soft text-brand", success: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", info: "bg-brand-soft text-brand-strong", neutral: "bg-surface text-muted",
};

function PanelHead({ title, count, href, hrefLabel, icon }: { title: string; count?: number; href?: string; hrefLabel?: string; icon?: string }) {
  return (
    <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-3">
      <div className="flex items-center gap-2">
        {icon && <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${TONE_SOFT.brand}`}><Icon name={icon} size={15} /></span>}
        <h2 className="text-ink text-sm font-black">{title}</h2>
        {typeof count === "number" && count > 0 && <span className="bg-brand-soft text-brand-strong grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-black">{count}</span>}
      </div>
      {href && <Link href={href} className="text-brand-strong shrink-0 text-[11px] font-bold hover:underline">{hrefLabel ?? "הצג הכל"}</Link>}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="text-muted flex flex-1 items-center justify-center px-4 py-6 text-center text-[12px]">{text}</div>;
}

function ActionRow({ a }: { a: CockpitAction }) {
  return (
    <Link href={a.href} className="border-line hover:bg-surface/70 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_SOFT[a.tone]}`}><Icon name={a.icon} size={17} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[13px] font-bold">{a.title}</p>
        <p className="text-muted truncate text-[11px]">{a.sub}</p>
      </div>
      <span className="text-brand-strong flex shrink-0 items-center gap-1 text-[11px] font-bold">{a.actionLabel}<Icon name="ArrowLeft" size={13} /></span>
    </Link>
  );
}

function TimelineRow({ t }: { t: CockpitTimelineItem }) {
  return (
    <div className={`flex items-stretch gap-3 ${t.isNext ? "" : "opacity-90"}`}>
      <div className="text-ink w-12 shrink-0 pt-0.5 text-end text-[12px] font-black tabular-nums">{t.time}</div>
      <div className="flex flex-col items-center">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${t.isNext ? "bg-brand text-white" : TONE_SOFT.brand}`}><Icon name={t.icon} size={14} /></span>
        <span className="bg-line w-px flex-1" />
      </div>
      <div className="min-w-0 flex-1 pb-3">
        {t.href ? <Link href={t.href} className="text-ink block truncate text-[13px] font-bold hover:underline">{t.title}</Link> : <p className="text-ink truncate text-[13px] font-bold">{t.title}</p>}
        {t.detail && <p className="text-muted truncate text-[11px]">{t.detail}</p>}
        {t.isNext && <span className="text-brand-strong text-[11px] font-black">הבא</span>}
      </div>
    </div>
  );
}

function OppCard({ o }: { o: CockpitOpportunity }) {
  const KIND_HE: Record<string, string> = { buyer: "התאמה ללקוח", seller: "מוכר", deal: "עסקה", acquisition: "הזדמנות גיוס", daily: "פעולה", office: "משרד", journey: "מסע לקוח" };
  return (
    <div className="border-line rounded-xl border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="bg-brand-soft text-brand-strong inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black"><Icon name="Sparkles" size={11} />{KIND_HE[o.kind] ?? "הזדמנות"}</span>
        {o.score != null && <span className="text-brand text-[11px] font-black">{o.score}</span>}
      </div>
      <p className="text-ink line-clamp-1 text-[13px] font-bold">{o.title}</p>
      <p className="text-muted line-clamp-2 text-[11px]">{o.detail}</p>
      {o.href && <Link href={o.href} className="text-brand-strong mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold">{o.actionLabel}<Icon name="ArrowLeft" size={12} /></Link>}
    </div>
  );
}

function ClientRow({ c }: { c: CockpitClient }) {
  return (
    <Link href={c.href} className="border-line hover:bg-surface/70 flex items-center gap-2.5 rounded-xl border px-3 py-2 transition">
      <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-black">{(c.name[0] ?? "ל")}</span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[12px] font-bold">{c.name}</p>
        <p className="text-muted truncate text-[11px]">{c.sub}</p>
      </div>
      {c.tag && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_SOFT[c.tagTone]}`}>{c.tag}</span>}
      <span className="text-brand-strong shrink-0"><Icon name="ArrowLeft" size={13} /></span>
    </Link>
  );
}

function Insight({ i }: { i: CockpitInsight }) {
  return (
    <Link href={i.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:underline">
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${TONE_SOFT[i.tone]}`}><Icon name={i.icon} size={12} /></span>
      <span className="text-ink truncate text-[11px] font-semibold">{i.text}</span>
    </Link>
  );
}

export function MyDayCockpit({ data }: { data: Cockpit }) {
  const ilsK = (n: number) => (n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : `₪${Math.round(n / 1000)}K`);
  const stages = data.pipeline.stages.slice(0, 5);

  return (
    <div dir="rtl" className="flex flex-col gap-4 xl:h-[calc(100vh-108px)] xl:overflow-hidden">
      {/* ── Greeting ────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-black">{data.greeting}, {data.agentName} 👋</h1>
          <p className="text-muted text-sm font-medium">{data.dateLabel}</p>
        </div>
        {data.nextEventLabel && <span className="bg-brand-soft text-brand-strong hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold sm:inline-flex"><Icon name="Clock" size={14} />{data.nextEventLabel}</span>}
      </div>

      {/* ── ZI Daily Brief + KPIs ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {data.ziBrief ? (
          <div className="zono-ai-gradient flex flex-1 items-center justify-between gap-4 rounded-[22px] p-4 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/15"><Icon name="Sparkles" size={20} /></span>
              <div className="min-w-0">
                <p className="text-[12px] font-black opacity-90">✨ ZI סידר לך את היום</p>
                <p className="line-clamp-2 text-[13px] font-medium opacity-95">{data.ziBrief.text}</p>
              </div>
            </div>
            <Link href={data.ziBrief.ctaHref} className="text-brand-strong shrink-0 rounded-xl bg-white px-4 py-2 text-[13px] font-black">{data.ziBrief.ctaLabel}</Link>
          </div>
        ) : (
          <div className="bg-card border-line flex flex-1 items-center gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${TONE_SOFT.success}`}><Icon name="CheckCircle" size={20} /></span>
            <div><p className="text-ink text-sm font-black">הכול מסודר כרגע 🎉</p><p className="text-muted text-[12px]">ZI ממשיך לחפש הזדמנויות עבורך</p></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[46%]">
          {data.kpis.map((k) => (
            <Link key={k.id} href={k.href} className="bg-card border-line flex flex-col justify-between rounded-[18px] border p-3 shadow-[var(--shadow-soft)] transition hover:border-brand-light">
              <span className={`grid h-8 w-8 place-items-center rounded-xl ${KPI_ACCENT[k.accent]}`}><Icon name={k.icon} size={16} /></span>
              <div className="mt-2"><div className="text-ink text-2xl font-black leading-none">{k.value}</div><div className="text-muted mt-1 text-[11px] font-semibold leading-tight">{k.label}</div></div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Col 1 — דורש טיפול */}
        <section className={CARD}>
          <PanelHead title="דורש טיפול" count={data.actionsTotal} icon="Flame" href="/action-center" hrefLabel="כל המשימות" />
          <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-3">
            {data.actions.length === 0 ? <Empty text="אין כרגע לידים או משימות שמחכים לטיפול" /> : (
              <div className="flex flex-col gap-2">{data.actions.map((a) => <ActionRow key={a.id} a={a} />)}</div>
            )}
          </div>
        </section>

        {/* Col 2 — timeline + clients */}
        <div className="flex min-h-0 flex-col gap-4">
          <section className={`${CARD} flex-1`}>
            <PanelHead title="היום שלי" icon="Calendar" href="/calendar" hrefLabel="יומן מלא" />
            <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {data.timeline.length === 0 ? <Empty text="אין לך פגישות נוספות היום" /> : (
                <div className="flex flex-col">{data.timeline.map((t) => <TimelineRow key={t.id} t={t} />)}</div>
              )}
            </div>
          </section>
          <section className={CARD}>
            <PanelHead title="לקוחות שדורשים תשומת לב" count={data.clientsTotal} icon="Users" href="/buyers" hrefLabel="כל הלקוחות" />
            <div className="flex flex-col gap-2 p-3">
              {data.clients.length === 0 ? <Empty text="אין כרגע לקוחות שדורשים מעקב" /> : data.clients.map((c) => <ClientRow key={c.id} c={c} />)}
            </div>
          </section>
        </div>

        {/* Col 3 — pipeline + opportunities */}
        <div className="flex min-h-0 flex-col gap-4">
          <section className={CARD}>
            <PanelHead title="העסקאות שלי" icon="Handshake" href="/deals" hrefLabel="צנרת מלאה" />
            <div className="flex flex-col gap-3 p-4">
              {stages.length === 0 ? <Empty text="עדיין אין עסקאות פעילות" /> : (
                <>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {stages.map((s, i) => (
                      <div key={s.stage} className="flex items-center gap-1.5">
                        <div className="bg-surface border-line min-w-[74px] rounded-xl border px-2.5 py-2 text-center">
                          <div className="text-ink text-lg font-black leading-none">{s.count}</div>
                          <div className="text-muted mt-0.5 line-clamp-1 text-[10px] font-semibold">{s.label}</div>
                        </div>
                        {i < stages.length - 1 && <Icon name="ChevronLeft" size={14} className="text-muted shrink-0" />}
                      </div>
                    ))}
                  </div>
                  {data.pipeline.pipelineValue > 0 && (
                    <div className="bg-brand-soft flex items-center justify-between rounded-xl px-3 py-2">
                      <span className="text-brand-strong text-[11px] font-bold">פוטנציאל בעסקאות פעילות</span>
                      <span className="text-brand-strong text-sm font-black">{ilsK(data.pipeline.pipelineValue)}</span>
                    </div>
                  )}
                  {data.insights.length > 0 && <div className="border-line flex flex-col border-t pt-1">{data.insights.map((i) => <Insight key={i.id} i={i} />)}</div>}
                </>
              )}
            </div>
          </section>
          <section className={`${CARD} flex-1`}>
            <PanelHead title="✨ ZI מצא עבורך" count={data.opportunitiesTotal} href="/recommendations" hrefLabel="עוד הזדמנויות" />
            <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-3">
              {data.opportunities.length === 0 ? <Empty text="ZI ממשיך לחפש הזדמנויות עבורך" /> : (
                <div className="flex flex-col gap-2">{data.opportunities.map((o) => <OppCard key={o.id} o={o} />)}</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
