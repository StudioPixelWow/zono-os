// ============================================================================
// ZONO — "היום שלי" (My Day) — the zero-scroll BROKER COCKPIT (server component).
// Composition only; all data comes from the shared getMyDayCockpit() aggregation.
// Zero page-scroll at ≥1280px (xl height-clamp + panel-local scroll on overflow);
// stacks and scrolls normally below xl. Broker-first: a property-recruitment
// carousel (real private-owner listings) + WhatsApp CTAs anchor the screen in the
// real-estate job. Existing tokens + Icon family. Every CTA deep-links a real route.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type {
  MyDayCockpit as Cockpit, CockpitAction, CockpitTimelineItem, CockpitOpportunity,
  CockpitClient, CockpitInsight, CockpitRecruit,
} from "@/lib/my-day/service";
import { transactionBadge } from "@/lib/property/transaction";
import { DealStagePreview } from "./DealStagePreview";

const CARD = "bg-card border-line rounded-[22px] border shadow-[var(--shadow-card)] flex flex-col min-h-0";
const TONE_SOFT: Record<string, string> = {
  brand: "bg-brand-soft text-brand", success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", neutral: "bg-surface text-muted",
};
const KPI_ACCENT: Record<string, string> = {
  brand: "bg-brand-soft text-brand", success: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", info: "bg-brand-soft text-brand-strong", neutral: "bg-surface text-muted",
};
const WA = "bg-[#25D366] text-white"; // WhatsApp green — the single high-intent recruit/contact CTA.

function PanelHead({ title, count, href, hrefLabel, icon }: { title: string; count?: number; href?: string; hrefLabel?: string; icon?: string }) {
  return (
    <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-2.5">
      <div className="flex items-center gap-2">
        {icon && <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${TONE_SOFT.brand}`}><Icon name={icon} size={13} /></span>}
        <h2 className="text-ink text-[13px] font-black">{title}</h2>
        {typeof count === "number" && count > 0 && <span className="bg-brand-soft text-brand-strong grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-black">{count}</span>}
      </div>
      {href && <Link href={href} className="text-brand-strong flex shrink-0 items-center gap-0.5 text-[11px] font-bold hover:underline">{hrefLabel ?? "הצג הכל"}<Icon name="ArrowLeft" size={12} /></Link>}
    </div>
  );
}

// ── Change #1 — דורש טיפול: compact 3-item panel, collapses to one calm line ──
function ActionRow({ a }: { a: CockpitAction }) {
  return (
    <Link href={a.href} className="border-line hover:bg-surface/70 flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE_SOFT[a.tone]}`}><Icon name={a.icon} size={15} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[12.5px] font-bold">{a.title}</p>
        <p className="text-muted truncate text-[11px]">{a.sub}</p>
      </div>
      <span className="text-brand-strong flex shrink-0 items-center gap-0.5 text-[11px] font-bold">{a.actionLabel}<Icon name="ArrowLeft" size={12} /></span>
    </Link>
  );
}

// One contextual action per event, inferred from its icon — a single most-useful
// verb, never a row of buttons.
function eventCta(icon: string): string {
  if (/^(Phone|PhoneCall)$/.test(icon)) return "חייג";
  if (/^(Building|Building2|Home|MapPin|Map|Navigation)$/.test(icon)) return "פתח נכס";
  if (/^(Users?|UserCheck|UserPlus|UserCircle)$/.test(icon)) return "פתח לקוח";
  if (/^(Calendar|CalendarClock|Clock)$/.test(icon)) return "פתח פגישה";
  return "פתח";
}

// ── Change #6 — adaptive timeline: hero next-event when the day is light ──────
function NextEventHero({ t, untilLabel }: { t: CockpitTimelineItem; untilLabel?: string | null }) {
  return (
    <div className="bg-brand-soft border-brand-light flex items-center gap-3 rounded-2xl border p-3">
      <span className="bg-brand grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"><Icon name={t.icon} size={22} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-brand-strong text-[11px] font-black">האירוע הבא</span>
          <span className="text-brand-strong text-[13px] font-black tabular-nums">{t.time}</span>
          {untilLabel && <span className="text-muted text-[11px] font-semibold">· {untilLabel}</span>}
        </div>
        <p className="text-ink truncate text-[14px] font-black">{t.title}</p>
        {t.detail && <p className="text-muted truncate text-[11px]">{t.detail}</p>}
      </div>
      {t.href && (
        <Link href={t.href} className="bg-brand shrink-0 rounded-xl px-3 py-2 text-[12px] font-black text-white">{eventCta(t.icon)}</Link>
      )}
    </div>
  );
}
function TimelineRow({ t }: { t: CockpitTimelineItem }) {
  return (
    <div className={`flex items-stretch gap-3 ${t.isNext ? "" : "opacity-90"}`}>
      <div className="text-ink w-11 shrink-0 pt-0.5 text-end text-[12px] font-black tabular-nums">{t.time}</div>
      <div className="flex flex-col items-center">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${t.isNext ? "bg-brand text-white" : TONE_SOFT.brand}`}><Icon name={t.icon} size={12} /></span>
        <span className="bg-line w-px flex-1" />
      </div>
      <div className="min-w-0 flex-1 pb-2.5">
        {t.href ? <Link href={t.href} className="text-ink block truncate text-[12.5px] font-bold hover:underline">{t.title}</Link> : <p className="text-ink truncate text-[12.5px] font-bold">{t.title}</p>}
        {t.detail && <p className="text-muted truncate text-[11px]">{t.detail}</p>}
      </div>
    </div>
  );
}

// ── Change #3 — ZI מצא עבורך: 2-3 tight insight cards (badge + title + one action) ─
function OppCard({ o }: { o: CockpitOpportunity }) {
  const KIND_HE: Record<string, string> = { buyer: "התאמה ללקוח", seller: "מוכר", deal: "עסקה", acquisition: "הזדמנות גיוס", daily: "פעולה", office: "משרד", journey: "מסע לקוח" };
  return (
    <div className="border-line rounded-xl border p-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="bg-brand-soft text-brand-strong inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black"><Icon name="Sparkles" size={10} />{KIND_HE[o.kind] ?? "הזדמנות"}</span>
        {o.score != null && <span className="text-brand text-[11px] font-black">{o.score}</span>}
      </div>
      <p className="text-ink line-clamp-1 text-[12.5px] font-bold">{o.title}</p>
      <p className="text-muted line-clamp-1 text-[11px]">{o.detail}</p>
      {o.href && <Link href={o.href} className="text-brand-strong mt-1 inline-flex items-center gap-0.5 text-[11px] font-bold">{o.actionLabel}<Icon name="ArrowLeft" size={11} /></Link>}
    </div>
  );
}

// ── clients: compact row + inline WhatsApp (reduce contact friction) ──────────
function ClientRow({ c }: { c: CockpitClient }) {
  return (
    <div className="border-line hover:bg-surface/70 flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 transition">
      <Link href={c.href} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="bg-brand-soft text-brand-strong grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black">{(c.name[0] ?? "ל")}</span>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-[12px] font-bold">{c.name}</p>
          <p className="text-muted truncate text-[11px]">{c.sub}</p>
        </div>
        {c.tag && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TONE_SOFT[c.tagTone]}`}>{c.tag}</span>}
      </Link>
      {c.whatsappUrl && (
        <a href={c.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={`שליחת WhatsApp ל${c.name}`} className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${WA}`}><Icon name="MessageCircle" size={14} /></a>
      )}
    </div>
  );
}

function Insight({ i }: { i: CockpitInsight }) {
  return (
    <Link href={i.href} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:underline">
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${TONE_SOFT[i.tone]}`}><Icon name={i.icon} size={12} /></span>
      <span className="text-ink truncate text-[11px] font-semibold">{i.text}</span>
    </Link>
  );
}

// ── Change #5 — pipeline: a STEPPED funnel (count chip + full label + spine).

// Transaction pill over an image — solid semantic fill + white text so it stays
// legible over any photo (never color-only; the word מכירה/השכרה is always shown).
const TXN_OVER_IMG: Record<"brand" | "success", string> = { brand: "bg-brand text-white", success: "bg-success text-white" };

// ── Change #2 — property recruitment card: image-first, צפה בנכס + גיוס מהיר ──
function RecruitCard({ r }: { r: CockpitRecruit }) {
  const txn = transactionBadge(r.kind);
  return (
    <div className="border-line bg-card flex w-[248px] shrink-0 flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-soft)]">
      <div className="relative h-24 w-full overflow-hidden bg-surface">
        {r.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external CDN listing photos: next/image remote loader is not configured for arbitrary portal hosts
          <img src={r.imageUrl} alt={r.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="text-muted grid h-full w-full place-items-center"><Icon name="Building" size={28} /></div>
        )}
        {/* top-right: transaction type (מכירה/השכרה) · top-left: exclusivity — never stacked */}
        {txn && <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black shadow-sm ${TXN_OVER_IMG[txn.tone]}`}>{txn.label}</span>}
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black text-white">{r.badge}</span>
        {r.price && r.price !== "—" && <span className="absolute bottom-2 right-2 rounded-lg bg-white/95 px-2 py-0.5 text-[12px] font-black text-ink shadow-sm">{r.price}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2.5">
        <p className="text-ink truncate text-[12.5px] font-black">{r.title}</p>
        {r.sub && <p className="text-muted truncate text-[11px]">{r.sub}</p>}
        {r.details && <p className="text-muted truncate text-[10.5px]">{r.details}</p>}
        <div className="mt-1.5 flex items-center gap-1.5">
          <Link href={r.href} className="border-line text-ink hover:bg-surface flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition"><Icon name="Building" size={12} />צפה בנכס</Link>
          {r.whatsappUrl && (
            <a href={r.whatsappUrl} target="_blank" rel="noopener noreferrer" className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-black ${WA}`}><Icon name="MessageCircle" size={13} />גיוס מהיר</a>
          )}
        </div>
      </div>
    </div>
  );
}

export function MyDayCockpit({ data }: { data: Cockpit }) {
  const ilsK = (n: number) => (n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : `₪${Math.round(n / 1000)}K`);
  const stages = data.pipeline.stages.slice(0, 5);
  const fewEvents = data.timeline.length > 0 && data.timeline.length <= 2;
  const next = data.timeline.find((t) => t.isNext) ?? data.timeline[0];
  const restTimeline = fewEvents ? [] : data.timeline;

  return (
    <div dir="rtl" className="flex flex-col gap-3 xl:h-[calc(100vh-108px)] xl:overflow-hidden">
      {/* ── Greeting ────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-black leading-tight">{data.greeting}, {data.agentName} 👋</h1>
          <p className="text-muted text-[13px] font-medium">{data.dateLabel}</p>
        </div>
        {data.nextEventLabel && <span className="bg-brand-soft text-brand-strong hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold sm:inline-flex"><Icon name="Clock" size={14} />{data.nextEventLabel}</span>}
      </div>

      {/* ── ZI Daily Brief + KPIs ───────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-stretch">
        {data.ziBrief ? (
          <div className="zono-ai-gradient flex flex-1 items-center justify-between gap-4 rounded-[22px] p-3.5 text-white">
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
          <div className="bg-card border-line flex flex-1 items-center gap-3 rounded-[22px] border p-3.5 shadow-[var(--shadow-card)]">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${TONE_SOFT.success}`}><Icon name="CheckCircle" size={20} /></span>
            <div><p className="text-ink text-sm font-black">הכול מסודר כרגע 🎉</p><p className="text-muted text-[12px]">ZI ממשיך לחפש הזדמנויות עבורך</p></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[46%]">
          {data.kpis.map((k) => {
            // Quiet zeros: a 0 stays legible but recedes so active numbers lead the eye.
            const zero = k.value === "0";
            return (
              <Link key={k.id} href={k.href} className={`bg-card border-line flex flex-col justify-between rounded-[18px] border p-2.5 shadow-[var(--shadow-soft)] transition hover:border-brand-light ${zero ? "opacity-70" : ""}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-xl ${zero ? "bg-surface text-muted" : KPI_ACCENT[k.accent]}`}><Icon name={k.icon} size={15} /></span>
                <div className="mt-1.5"><div className={`text-xl font-black leading-none ${zero ? "text-muted" : "text-ink"}`}>{k.value}</div><div className="text-muted mt-1 text-[11px] font-semibold leading-tight">{k.label}</div></div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Col 1 — דורש טיפול (compact) + לקוחות */}
        <div className="flex min-h-0 flex-col gap-3">
          <section className={`${CARD} flex-1`}>
            <PanelHead title="דורש טיפול" count={data.urgentTotal} icon="Flame" href="/action-center" hrefLabel={`כל המשימות (${data.actionsTotal})`} />
            <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
              {data.actions.length === 0 ? (
                <div className="text-muted flex h-full items-center justify-center gap-2 py-3 text-center text-[12px]"><Icon name="CheckCircle" size={15} />הכול מטופל — אין משימות דחופות</div>
              ) : (
                <div className="flex flex-col gap-2">{data.actions.map((a) => <ActionRow key={a.id} a={a} />)}</div>
              )}
            </div>
          </section>
          <section className={CARD}>
            <PanelHead title="לקוחות שדורשים תשומת לב" count={data.clientsTotal} icon="Users" href="/buyers" hrefLabel="כל הלקוחות" />
            <div className="flex flex-col gap-1.5 p-2.5">
              {data.clients.length === 0 ? <div className="text-muted px-1 py-2 text-center text-[12px]">אין כרגע לקוחות שדורשים מעקב</div> : data.clients.map((c) => <ClientRow key={c.id} c={c} />)}
            </div>
          </section>
        </div>

        {/* Col 2 — timeline (adaptive) + ZI מצא עבורך */}
        <div className="flex min-h-0 flex-col gap-3">
          <section className={`${CARD} flex-1`}>
            <PanelHead title="היום שלי" count={data.timelineTotal} icon="Calendar" href="/calendar" hrefLabel="יומן מלא" />
            <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-3">
              {data.timeline.length === 0 ? (
                <div className="text-muted flex h-full flex-col items-center justify-center gap-1.5 py-3 text-center text-[12px]"><Icon name="Calendar" size={18} />אין לך פגישות נוספות היום<Link href="/calendar" className="text-brand-strong font-bold">קבע פגישה →</Link></div>
              ) : fewEvents && next ? (
                <div className="flex flex-col gap-2">
                  <NextEventHero t={next} untilLabel={data.nextEventLabel} />
                  {data.timeline.filter((t) => t.id !== next.id).map((t) => <TimelineRow key={t.id} t={t} />)}
                </div>
              ) : (
                <div className="flex flex-col">{restTimeline.map((t) => <TimelineRow key={t.id} t={t} />)}</div>
              )}
            </div>
          </section>
          <section className={`${CARD} flex-1`}>
            <PanelHead title="✨ ZI מצא עבורך" count={data.opportunitiesTotal} href="/recommendations" hrefLabel="עוד הזדמנויות" />
            <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
              {data.opportunities.length === 0 ? <div className="text-muted flex h-full items-center justify-center py-3 text-center text-[12px]">ZI ממשיך לחפש הזדמנויות עבורך</div> : (
                <div className="flex flex-col gap-2">{data.opportunities.map((o) => <OppCard key={o.id} o={o} />)}</div>
              )}
            </div>
          </section>
        </div>

        {/* Col 3 — העסקאות שלי (funnel + potential + stuck) */}
        <div className="flex min-h-0 flex-col gap-3">
          <section className={`${CARD} flex-1`}>
            <PanelHead title="העסקאות שלי" icon="Handshake" href="/deals" hrefLabel="צנרת מלאה" />
            <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-3">
              {stages.length === 0 ? <div className="text-muted flex h-full items-center justify-center py-3 text-center text-[12px]">עדיין אין עסקאות פעילות</div> : (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-brand-soft rounded-xl px-3 py-2">
                      <div className="text-brand-strong text-[10px] font-bold">פוטנציאל צנרת</div>
                      <div className="text-brand-strong text-base font-black leading-tight">{ilsK(data.pipeline.pipelineValue)}</div>
                    </div>
                    <div className="bg-success-soft rounded-xl px-3 py-2">
                      <div className="text-success text-[10px] font-bold">צפי משוקלל</div>
                      <div className="text-success text-base font-black leading-tight">{ilsK(data.pipeline.weightedRevenue)}</div>
                    </div>
                  </div>
                  <div className="flex flex-col">{stages.map((s, i) => <DealStagePreview key={s.stage} stage={s.stage} label={s.label} count={s.count} value={s.value} last={i === stages.length - 1} />)}</div>
                  {data.insights.length > 0 && <div className="border-line flex flex-col border-t pt-1.5">{data.insights.map((i) => <Insight key={i.id} i={i} />)}</div>}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── Change #2 — נכסים שכדאי לגייס (real private-owner recruitment carousel) ─ */}
      {data.recruitment.length > 0 && (
        <section className={`${CARD} shrink-0`}>
          <PanelHead title="הזדמנויות גיוס באזור שלך" count={data.recruitmentTotal} icon="Target" href="/external-listings" hrefLabel="הצג הכל" />
          <div className="zono-scroll flex gap-3 overflow-x-auto p-3">
            {data.recruitment.map((r) => <RecruitCard key={r.id} r={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}
