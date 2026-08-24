// ============================================================================
// ZONO — "היום שלי" (My Day) — the calm, action-first BROKER COCKPIT (server component).
// Composition only; ALL data comes from the shared getMyDayCockpit() aggregation
// (real, org-scoped, best-effort — nothing mocked). Layout: a compact status
// strip, ONE high-weight "ZI הכין לך את היום" action center (up to 3 prioritized
// real actions + "התחל את היום"), a 3-column work grid (deals · today · clients),
// and a matched-properties row. Existing tokens + Icon family + the shared ZI
// character (one subtle peek, not decoration). Every CTA deep-links a real route.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { ZICharacter } from "@/components/characters/ZICharacter";
import type {
  MyDayCockpit as Cockpit, CockpitAction, CockpitTimelineItem, CockpitDeal,
  CockpitClient, CockpitRecruit, CockpitOpportunity,
} from "@/lib/my-day/service";
import { transactionBadge } from "@/lib/property/transaction";

const CARD = "bg-card border-line rounded-[22px] border shadow-[var(--shadow-card)] flex flex-col min-h-0";
const TONE_SOFT: Record<string, string> = {
  brand: "bg-brand-soft text-brand", success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", neutral: "bg-surface text-muted",
};
const WA = "bg-[#25D366] text-white"; // WhatsApp green — the single high-intent contact CTA.
const ilsK = (n: number) => (n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${Math.round(n).toLocaleString("he-IL")}`);

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

// ── ZI action center: a numbered, prioritized action (real action OR opportunity). ─
interface ZiRow { id: string; icon: string; tone: string; title: string; sub: string; actionLabel: string; href: string }
function toZiRows(actions: CockpitAction[], opps: CockpitOpportunity[]): ZiRow[] {
  const rows: ZiRow[] = actions.map((a) => ({ id: a.id, icon: a.icon, tone: a.tone, title: a.title, sub: a.sub, actionLabel: a.actionLabel, href: a.href }));
  for (const o of opps) {
    if (rows.length >= 3) break;
    rows.push({ id: o.id, icon: "Sparkles", tone: "brand", title: o.title, sub: o.detail, actionLabel: o.actionLabel, href: o.href ?? "/recommendations" });
  }
  return rows.slice(0, 3);
}
function ZiActionRow({ r, n }: { r: ZiRow; n: number }) {
  return (
    <Link href={r.href} className="border-line hover:border-brand-light hover:bg-brand-soft/40 flex items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 transition">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_SOFT[r.tone] ?? TONE_SOFT.brand}`}><Icon name={r.icon} size={17} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[13px] font-black">{r.title}</p>
        {r.sub && <p className="text-muted truncate text-[11.5px]">{r.sub}</p>}
      </div>
      <span className="bg-brand-soft text-brand-strong grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-black tabular-nums">{n}</span>
    </Link>
  );
}

function eventCta(icon: string): string {
  if (/^(Phone|PhoneCall)$/.test(icon)) return "חייג";
  if (/^(Building|Building2|Home|MapPin|Map|Navigation)$/.test(icon)) return "פתח נכס";
  if (/^(Users?|UserCheck|UserPlus|UserCircle)$/.test(icon)) return "פתח לקוח";
  if (/^(Calendar|CalendarClock|Clock)$/.test(icon)) return "פתח פגישה";
  return "פתח";
}
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
      {t.href && <Link href={t.href} className="bg-brand shrink-0 rounded-xl px-3 py-2 text-[12px] font-black text-white">{eventCta(t.icon)}</Link>}
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

// ── individual deal needing attention (at-risk / closing / high-value) ────────
function DealRow({ d }: { d: CockpitDeal }) {
  return (
    <Link href={d.href} className="border-line hover:bg-surface/70 flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition">
      <span className={`h-8 w-1 shrink-0 rounded-full ${d.tone === "danger" ? "bg-danger" : d.tone === "success" ? "bg-success" : "bg-brand"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[12.5px] font-bold">{d.title}</p>
        <p className="text-muted truncate text-[11px]">{d.stageLabel}{d.stageLabel && d.reason ? " · " : ""}<span className={d.tone === "danger" ? "text-danger font-bold" : ""}>{d.reason}</span></p>
      </div>
      <span className="text-ink shrink-0 text-[12.5px] font-black tabular-nums">{d.value}</span>
    </Link>
  );
}

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
      {c.whatsappUrl && <a href={c.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={`שליחת WhatsApp ל${c.name}`} className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${WA}`}><Icon name="MessageCircle" size={14} /></a>}
    </div>
  );
}

const TXN_OVER_IMG: Record<"brand" | "success", string> = { brand: "bg-brand text-white", success: "bg-success text-white" };

// Compact property card — used for BOTH client-matched properties and the area
// recruitment fallback (same shape, different relevance line).
function PropertyCard({ imageUrl, title, sub, details, price, kind, badge, badgeTone, href, ctaLabel, ctaIcon, whatsappUrl, whatsappLabel }: {
  imageUrl: string | null; title: string; sub: string; details: string | null; price: string; kind: CockpitRecruit["kind"];
  badge: string; badgeTone: "brand" | "black"; href: string; ctaLabel: string; ctaIcon: string; whatsappUrl?: string | null; whatsappLabel?: string;
}) {
  const txn = transactionBadge(kind);
  return (
    <div className="border-line bg-card flex w-[248px] shrink-0 flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-soft)]">
      <div className="relative h-24 w-full overflow-hidden bg-surface">
        {imageUrl
          // eslint-disable-next-line @next/next/no-img-element -- listing photos from arbitrary CDN hosts; next/image remote loader not configured for them
          ? <img src={imageUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
          : <div className="text-muted grid h-full w-full place-items-center"><Icon name="Building" size={28} /></div>}
        {txn && <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black shadow-sm ${TXN_OVER_IMG[txn.tone]}`}>{txn.label}</span>}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black ${badgeTone === "brand" ? "bg-brand text-white" : "bg-black/70 text-white"}`}>{badge}</span>
        {price && price !== "—" && <span className="text-ink absolute bottom-2 right-2 rounded-lg bg-white/95 px-2 py-0.5 text-[12px] font-black shadow-sm">{price}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2.5">
        <p className="text-ink truncate text-[12.5px] font-black">{title}</p>
        {sub && <p className="text-muted truncate text-[11px]">{sub}</p>}
        {details && <p className="text-muted truncate text-[10.5px]">{details}</p>}
        <div className="mt-1.5 flex items-center gap-1.5">
          <Link href={href} className="border-line text-ink hover:bg-surface flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition"><Icon name={ctaIcon} size={12} />{ctaLabel}</Link>
          {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-black ${WA}`}><Icon name="MessageCircle" size={13} />{whatsappLabel ?? "WhatsApp"}</a>}
        </div>
      </div>
    </div>
  );
}
function RecruitCard({ r }: { r: CockpitRecruit }) {
  return <PropertyCard imageUrl={r.imageUrl} title={r.title} sub={r.sub} details={r.details} price={r.price} kind={r.kind}
    badge={r.badge} badgeTone="black" href={r.href} ctaLabel="צפה בנכס" ctaIcon="Building" whatsappUrl={r.whatsappUrl} whatsappLabel="גיוס מהיר" />;
}

export function MyDayCockpit({ data }: { data: Cockpit }) {
  const fewEvents = data.timeline.length > 0 && data.timeline.length <= 2;
  const next = data.timeline.find((t) => t.isNext) ?? data.timeline[0];
  const ziRows = toZiRows(data.actions, data.opportunities);
  const actionCount = data.urgentTotal || ziRows.length;
  const startHref = data.ziBrief?.ctaHref ?? ziRows[0]?.href ?? "/action-center";

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

      {/* ── Compact status strip (replaces the four big KPI cards) ───────────── */}
      <div className="border-line bg-card shadow-[var(--shadow-soft)] flex shrink-0 flex-wrap items-stretch divide-x divide-x-reverse divide-[var(--line)] overflow-hidden rounded-2xl max-md:overflow-x-auto md:flex-nowrap">
        {data.kpis.map((k) => {
          const zero = k.value === "0";
          return (
            <Link key={k.id} href={k.href} className={`hover:bg-brand-soft/40 flex min-w-[150px] flex-1 items-center gap-2.5 px-4 py-2.5 transition ${zero ? "opacity-60" : ""}`}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${zero ? "bg-surface text-muted" : TONE_SOFT.brand}`}><Icon name={k.icon} size={16} /></span>
              <div className="min-w-0">
                <div className="text-ink text-[17px] font-black leading-none tabular-nums">{k.value}</div>
                <div className="text-muted mt-0.5 truncate text-[11.5px] font-semibold leading-tight">{k.label}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── ZI action center — the single highest-weight area ────────────────── */}
      <div className="border-brand-light relative shrink-0 overflow-hidden rounded-[24px] border bg-gradient-to-l from-[var(--color-brand-soft)] via-card to-card p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(200px,auto)_1fr_minmax(0,1.35fr)] lg:items-center">
          {/* right: heading + subtitle + start button */}
          <div className="flex min-w-0 flex-col justify-center">
            <div className="mb-1 flex items-center gap-2">
              <span className="zono-ai-gradient grid h-8 w-8 place-items-center rounded-xl text-white"><Icon name="Sparkles" size={17} /></span>
              <h2 className="text-ink text-lg font-black leading-tight">ZI הכין לך את היום</h2>
            </div>
            <p className="text-muted text-[13px] font-medium">
              {ziRows.length > 0 ? `יש לך ${actionCount} ${actionCount === 1 ? "פעולה שיכולה" : "פעולות שיכולות"} לקדם עסקאות היום` : "הכול מסודר כרגע — הנה מה שיכול לקדם אותך"}
            </p>
            {ziRows.length > 0 && (
              <Link href={startHref} className="zono-ai-gradient mt-3 inline-flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-black text-white shadow-[var(--shadow-soft)] transition hover:opacity-95">
                <Icon name="Sparkles" size={16} />התחל את היום
              </Link>
            )}
          </div>
          {/* center: ZI fills the gap BETWEEN the heading and the action rows — its
              own column, so it never overlaps or hides content, and no extra height */}
          <div className="hidden items-center justify-center lg:flex">
            <ZICharacter state={ziRows.length > 0 ? "pointing" : "celebrate"} size="lg" decorative animate={false} />
          </div>
          {/* left: prioritized action rows */}
          <div className="flex min-w-0 flex-col gap-2">
            {ziRows.length > 0 ? ziRows.map((r, i) => <ZiActionRow key={r.id} r={r} n={i + 1} />) : (
              <Link href="/recommendations" className="border-line hover:border-brand-light flex items-center gap-3 rounded-2xl border bg-card px-3 py-3 transition">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_SOFT.success}`}><Icon name="CheckCircle" size={18} /></span>
                <div className="min-w-0"><p className="text-ink text-[13px] font-black">אין משימות דחופות כרגע 🎉</p><p className="text-muted text-[11.5px]">בקש מ-ZI למצוא הזדמנות נוספת לקידום</p></div>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Main work grid: deals · today · clients ──────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        {/* deals */}
        <section className={`${CARD}`}>
          <PanelHead title="עסקאות שדורשות תשומת לב" count={data.dealsTotal} icon="Handshake" href="/deals" hrefLabel="צפייה בכל העסקאות" />
          <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-3">
            {data.pipeline.pipelineValue > 0 || data.pipeline.weightedRevenue > 0 ? (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="bg-success-soft rounded-xl px-3 py-2"><div className="text-success text-[10px] font-bold">צפי הכנסות</div><div className="text-success text-base font-black leading-tight">{ilsK(data.pipeline.weightedRevenue)}</div></div>
                <div className="bg-brand-soft rounded-xl px-3 py-2"><div className="text-brand-strong text-[10px] font-bold">פוטנציאל צנרת</div><div className="text-brand-strong text-base font-black leading-tight">{ilsK(data.pipeline.pipelineValue)}</div></div>
              </div>
            ) : null}
            {data.dealsAttention.length === 0
              ? <div className="text-muted flex h-full items-center justify-center py-3 text-center text-[12px]">עדיין אין עסקאות פעילות</div>
              : <div className="flex flex-col gap-2">{data.dealsAttention.map((d) => <DealRow key={d.id} d={d} />)}</div>}
          </div>
        </section>

        {/* today */}
        <section className={`${CARD}`}>
          <PanelHead title="היום שלי" count={data.timelineTotal} icon="Calendar" href="/calendar" hrefLabel="לוח הזמנים המלא" />
          <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-3">
            {data.timeline.length === 0 ? (
              <div className="text-muted flex h-full flex-col items-center justify-center gap-1.5 py-3 text-center text-[12px]"><Icon name="Calendar" size={18} />אין לך פגישות נוספות היום<Link href="/calendar" className="text-brand-strong font-bold">קבע פגישה →</Link></div>
            ) : fewEvents && next ? (
              <div className="flex flex-col gap-2">
                <NextEventHero t={next} untilLabel={data.nextEventLabel} />
                {data.timeline.filter((t) => t.id !== next.id).map((t) => <TimelineRow key={t.id} t={t} />)}
              </div>
            ) : (
              <div className="flex flex-col">{data.timeline.map((t) => <TimelineRow key={t.id} t={t} />)}</div>
            )}
          </div>
        </section>

        {/* clients */}
        <section className={`${CARD}`}>
          <PanelHead title="לקוחות שדורשים תשומת לב" count={data.clientsTotal} icon="Users" href="/buyers" hrefLabel="לכל הלקוחות" />
          <div className="zono-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
            {data.clients.length === 0
              ? <div className="text-muted flex h-full items-center justify-center px-1 py-2 text-center text-[12px]">אין כרגע לקוחות שדורשים מעקב</div>
              : <div className="flex flex-col gap-1.5">{data.clients.map((c) => <ClientRow key={c.id} c={c} />)}</div>}
          </div>
        </section>
      </div>

      {/* ── נכסים חמים לגיוס בלעדיות — private-owner, no-broker, SALE-only listings the
          agent can recruit for an exclusivity mandate (never rentals; source =
          listPrivateOwnerListings, which enforces has_agent≠true + deal_type≠rent). ─ */}
      {data.recruitment.length > 0 && (
        <section className={`${CARD} shrink-0`}>
          <PanelHead title="נכסים חמים לגיוס בלעדיות" count={data.recruitmentTotal} icon="Target" href="/external-listings" hrefLabel="לכל הנכסים" />
          <div className="zono-scroll flex gap-3 overflow-x-auto p-3">
            {data.recruitment.map((r) => <RecruitCard key={r.id} r={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}
