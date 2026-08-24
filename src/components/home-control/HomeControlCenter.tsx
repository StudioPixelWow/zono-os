"use client";
// ============================================================================
// ZONO — Home Control Center (command-center redesign). A clean, premium, RTL
// operating surface that answers, in 3 seconds, "what should I do right now to
// close the next deal?". Order: Hero → AI Coach (dark) → NOW → Deal Pipeline →
// Client×Property matches → Next Deal → Follow-up radar → Acquisition radar →
// recommended property + quick actions (50/50) → live area map (full-width) →
// new properties → updates + monthly performance. 100% composition over the
// EXISTING services — no new engines, no mock data. Light throughout; dark-purple
// is used ONLY for the AI Coach block and the live territory map.
// ============================================================================
import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { KpiCard, type Accent } from "@/components/ui/action-surfaces";
import { HomeQuickActions } from "./HomeQuickActions";
import { tr, type DashboardDict } from "@/lib/dashboard-home/i18n";
import type { PropertyCard } from "@/lib/dashboard-home/types";
import { RecommendedPropertyCard } from "@/components/dashboard-home/components/DashboardHero";
import { HotPropertiesSection } from "@/components/dashboard-home/components/HotPropertiesSection";
import { PrivateOwnerListings } from "./PrivateOwnerListings";
import { HomeHeatmapSection } from "@/components/dashboard-home/components/HomeHeatmapSection";
import { TodayTasksCard } from "./TodayTasksCard";
import type { HomeTaskItem } from "@/lib/home/home-service";
import type {
  HomeKpi, HomeRec, HomeActivityItem, HomeTerritory, HomePerf,
  HomeHero, HomeNowItem, HomePipeline, HomeFollowUpItem, HomeAcquisition, HomeNextDeal, HomePrivateListing,
  HomeWhatsapp, HomeMarketing, HomeDormantLead, HomeZonoWork,
} from "./types";

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const ilsC = (n: number) => (n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : ils(n));

const URGENCY_DOT: Record<HomeRec["urgency"], string> = {
  critical: "bg-rose-400", high: "bg-amber-400", medium: "bg-violet-300", low: "bg-white/40",
};
const URGENCY_HE: Record<HomeRec["urgency"], string> = { critical: "קריטי", high: "דחוף", medium: "חשוב", low: "רגיל" };
const AREA_ICON: Record<string, string> = {
  acquisition: "Target", buyer: "Users", seller: "Home", deal: "Handshake", journey: "Route", daily: "Sunrise", office: "Building2",
};
const ACTIVITY_TONE: Record<HomeActivityItem["tone"], string> = {
  brand: "bg-brand-soft text-brand-strong", success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", neutral: "bg-surface text-muted",
};
const TONE_SOFT: Record<"brand" | "success" | "warning" | "danger", string> = {
  brand: "bg-brand-soft text-brand-strong", success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return "עכשיו";
  const m = Math.floor(s / 60); if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60); if (h < 24) return `לפני ${h} שע׳`;
  const d = Math.floor(h / 24); if (d < 7) return `לפני ${d} ימים`;
  return new Date(iso).toLocaleDateString("he-IL");
}

/** Section heading — consistent light hierarchy. */
function Head({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-ink text-lg font-black sm:text-xl">{title}</h2>
        {subtitle && <p className="text-muted mt-0.5 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── 1. HERO — daily operating overview ──────────────────────────────────────
function Hero({ agentName, hero }: { agentName: string; hero: HomeHero }) {
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "בוקר טוב";
    if (h < 18) return "צהריים טובים";
    return "ערב טוב";
  }, []);
  const headline = hero.opportunities > 0
    ? `יש לך היום ${hero.opportunities} הזדמנויות ששווה לפעול עליהן`
    : "הכול תחת שליטה — אין כרגע פעולות דחופות";
  return (
    <section className="bg-card border-line rounded-[26px] border p-5 shadow-[var(--shadow-card)] sm:p-6" dir="rtl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-ink text-2xl font-black sm:text-3xl">{greeting}, {agentName} 👋</h1>
          <p className="text-muted mt-1 text-sm sm:text-base">{headline}</p>
          {hero.chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {hero.chips.map((c) => (
                <Link
                  key={c.id}
                  href={c.href}
                  className="border-line hover:border-brand-light bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-bold transition"
                >
                  <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12px] font-black", TONE_SOFT[c.tone])}>{c.value}</span>
                  <span className="text-ink">{c.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
          <Link href="/action-center" className="btn-zono-primary inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold">
            <Icon name="Sparkles" size={16} /> הראה לי מאיפה להתחיל
          </Link>
          <Link href="/today" className="border-line text-ink hover:bg-surface inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-bold transition">
            <Icon name="Calendar" size={16} /> צפה ביום שלי
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── 2. KPI strip ────────────────────────────────────────────────────────────
// Number-first premium KPI cards (shared KpiCard): the value leads at 3xl, the
// icon earns a real IconSurface with a contextual accent (no tiny lavender box).
const KPI_ACCENT: Record<string, Accent> = {
  Users: "info", UserPlus: "info", UserRound: "info",
  Calendar: "info", CalendarClock: "info", MapPin: "info",
  Building: "brand", Building2: "brand", Home: "brand",
  Banknote: "success", Coins: "success", Handshake: "success", TrendingUp: "success",
  ListChecks: "neutral", Clock: "warn", Flame: "warn",
};
function kpiAccent(icon: string): Accent { return KPI_ACCENT[icon] ?? "brand"; }

function KpiStrip({ kpis }: { kpis: HomeKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {kpis.map((k) => (
        <Link key={k.id} href={k.href} className="group block h-full focus-visible:outline-none">
          <KpiCard
            label={k.label}
            value={k.value}
            icon={k.icon}
            accent={kpiAccent(k.icon)}
            hint={k.hint ?? "פתח"}
            iconSurface
            className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-[var(--brand,#6d28d9)]/40"
          />
        </Link>
      ))}
    </div>
  );
}

// ── 3. AI Coach (dark-purple) ───────────────────────────────────────────────
function AiCoach({ recs }: { recs: HomeRec[] }) {
  return (
    <section
      dir="rtl"
      className="relative overflow-hidden rounded-[26px] p-6 shadow-[0_24px_70px_-24px_rgba(124,58,237,0.5)]"
      style={{ background: "linear-gradient(135deg, #1b1340 0%, #241a52 55%, #2b1a5e 100%)" }}
    >
      <div className="pointer-events-none absolute -top-24 -start-24 h-64 w-64 rounded-full bg-violet-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -end-24 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="relative flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white"><Icon name="Sparkles" size={18} /></span>
        <div>
          <h2 className="text-lg font-black text-white sm:text-xl">ה־AI שלך ממליץ היום</h2>
          <p className="text-xs text-white/60">הפעולות עם הסיכוי הגבוה ביותר לקדם עסקה</p>
        </div>
      </div>

      {recs.length === 0 ? (
        <div className="relative mt-4 flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <Icon name="CheckCircle" size={26} className="text-emerald-300/80" />
          <p className="text-sm font-bold text-white/90">אין המלצות דחופות כרגע</p>
          <p className="text-xs text-white/60">ZONO ימשיך לנתח את הנתונים שלך ברקע ויתריע כשיהיה משהו חשוב</p>
        </div>
      ) : (
        <div className="relative mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {recs.map((r) => (
            <div key={r.id} className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-violet-100"><Icon name={AREA_ICON[r.area] ?? "Layers"} size={15} /></span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/85">
                  <span className={cn("h-2 w-2 rounded-full", URGENCY_DOT[r.urgency])} /> {URGENCY_HE[r.urgency]}
                </span>
              </div>
              <p className="text-[15px] font-black leading-snug text-white">{r.title}</p>
              <p className="line-clamp-2 text-xs leading-relaxed text-white/60">{r.why}</p>
              {r.href ? (
                <Link href={r.href} className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-[13px] font-black text-[#241a52] transition hover:bg-violet-50">
                  {r.action || "פתח"} <Icon name="ArrowLeft" size={14} />
                </Link>
              ) : (
                <span className="mt-auto text-[12px] font-semibold text-white/55">{r.action}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── 4. NOW — what requires action ───────────────────────────────────────────
function NowSection({ items }: { items: HomeNowItem[] }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
      <Head title="מה דורש ממך פעולה עכשיו" subtitle="דחיפות תפעולית — לטיפול מיידי" />
      {items.length === 0 ? (
        <div className="text-muted flex flex-col items-center justify-center gap-1 py-6 text-center">
          <Icon name="CheckCircle" size={24} className="text-success" />
          <p className="text-ink text-sm font-bold">אין כרגע פעולות דחופות — עבודה יפה 👏</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={it.href} className="border-line hover:bg-surface/60 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition">
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", TONE_SOFT[it.tone])}><Icon name={it.icon} size={16} /></span>
                <span className="text-ink min-w-0 flex-1 text-sm font-bold">{it.label}</span>
                <span className="text-brand-strong shrink-0 inline-flex items-center gap-1 text-[13px] font-black">{it.action} <Icon name="ArrowLeft" size={13} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 5. Deal pipeline — money first ──────────────────────────────────────────
function DealPipeline({ pipeline }: { pipeline: HomePipeline }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-ink text-lg font-black sm:text-xl">העסקאות שלך</h2>
          <p className="text-muted mt-0.5 text-sm">פוטנציאל העמלה בצנרת שלך</p>
        </div>
        <Link href="/deals" className="text-brand-strong hover:text-brand text-xs font-bold">לצנרת המלאה</Link>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="bg-brand-soft rounded-2xl p-3.5">
          <p className="text-brand-strong text-2xl font-black">{ilsC(pipeline.weightedRevenue)}</p>
          <p className="text-brand-strong/70 text-[11px] font-bold">עמלה צפויה משוקללת</p>
        </div>
        <div className="bg-surface rounded-2xl p-3.5">
          <p className="text-ink text-2xl font-black">{ilsC(pipeline.expectedCommission)}</p>
          <p className="text-muted text-[11px] font-bold">פוטנציאל עמלה כולל</p>
        </div>
        <div className="bg-surface rounded-2xl p-3.5">
          <p className="text-ink text-2xl font-black">{ilsC(pipeline.pipelineValue)}</p>
          <p className="text-muted text-[11px] font-bold">שווי עסקאות בצנרת</p>
        </div>
      </div>
      {pipeline.stages.length === 0 ? (
        <div className="text-muted flex flex-col items-center justify-center gap-1 py-6 text-center">
          <Icon name="Handshake" size={22} className="text-muted/70" />
          <p className="text-ink text-sm font-bold">אין עדיין עסקאות פעילות בצנרת</p>
          <p className="text-xs">צור התאמה או פתח עסקה כדי להתחיל</p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pipeline.stages.map((s, i) => (
            <div key={s.stage} className="flex items-stretch gap-2">
              <Link href="/deals" className="border-line hover:border-brand-light bg-surface flex min-w-[128px] flex-col gap-1 rounded-2xl border p-3 transition">
                <span className="text-muted text-[11px] font-bold">{s.label}</span>
                <span className="text-ink text-xl font-black">{s.count}</span>
                <span className="text-brand-strong text-[11px] font-black">{ilsC(s.value)}</span>
              </Link>
              {i < pipeline.stages.length - 1 && (
                <span className="text-muted/50 flex items-center"><Icon name="ChevronLeft" size={16} /></span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 6. Client × Property matches (buyer-area intelligence) ──────────────────
function ClientMatches({ recs }: { recs: HomeRec[] }) {
  return (
    <div dir="rtl">
      <Head title="התאמות שנוצרו עבורך" subtitle="לקוחות ונכסים שכדאי לחבר עכשיו" action={<Link href="/matches" className="text-brand-strong hover:text-brand text-xs font-bold">לכל ההתאמות</Link>} />
      {recs.length === 0 ? (
        <div className="bg-card border-line text-muted flex flex-col items-center justify-center gap-1 rounded-[22px] border p-8 text-center shadow-[var(--shadow-card)]">
          <Icon name="GitCompareArrows" size={24} className="text-muted/70" />
          <p className="text-ink text-sm font-bold">לא נמצאו כרגע התאמות חדשות</p>
          <p className="text-xs">ZONO תמשיך לעקוב עבורך ותציף התאמות חמות כשייווצרו</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recs.map((r) => (
            <div key={r.id} className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between gap-2">
                <span className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-lg"><Icon name="Users" size={15} /></span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black", TONE_SOFT[r.urgency === "critical" ? "danger" : r.urgency === "high" ? "warning" : "brand"])}>{URGENCY_HE[r.urgency]}</span>
              </div>
              <p className="text-ink text-sm font-black leading-snug">{r.title}</p>
              <p className="text-muted line-clamp-2 text-xs">{r.why}</p>
              {r.href && (
                <Link href={r.href} className="btn-zono-primary mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-bold">
                  {r.action || "פתח התאמה"} <Icon name="ArrowLeft" size={13} />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 7. The Next Deal — killer card ──────────────────────────────────────────
function NextDealCard({ deal }: { deal: HomeNextDeal }) {
  return (
    <div dir="rtl">
      <Head title="העסקה הבאה שלך" subtitle="ההזדמנות הבשלה ביותר לסגירה" />
      <div className="border-brand-light bg-card relative overflow-hidden rounded-[24px] border-2 p-5 shadow-[var(--shadow-card)]">
        <span className="bg-brand-soft absolute -end-10 -top-10 h-32 w-32 rounded-full opacity-60" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="bg-brand-soft text-brand-strong inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black">
                <Icon name="TrendingUp" size={12} /> {deal.probability}% סבירות לסגירה
              </span>
              <span className="text-muted text-[11px] font-bold">{deal.stageLabel}</span>
            </div>
            <p className="text-ink mt-2 truncate text-lg font-black">{deal.buyerName} <span className="text-muted font-bold">×</span> {deal.propertyTitle}</p>
            <p className="text-brand-strong mt-1 text-sm font-black">עמלה פוטנציאלית: {ils(deal.commission)}</p>
          </div>
          <Link href={deal.href} className="btn-zono-primary inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-sm font-black">
            פתח עסקה <Icon name="ArrowLeft" size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── 8. Follow-up radar ──────────────────────────────────────────────────────
function FollowUpRadar({ items }: { items: HomeFollowUpItem[] }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
      <Head
        title="מעקבים שלא כדאי לצנן"
        subtitle="אנשים שלא כדאי לתת להם להתקרר"
        action={items.length > 0 ? <Link href="/buyers" className="text-brand-strong hover:text-brand text-xs font-bold">טפל בכל המעקבים</Link> : undefined}
      />
      {items.length === 0 ? (
        <div className="text-muted flex flex-col items-center justify-center gap-1 py-6 text-center">
          <Icon name="CheckCircle" size={24} className="text-success" />
          <p className="text-ink text-sm font-bold">מעולה — אין כרגע לקוחות שמחכים למעקב</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={it.href} className="border-line hover:bg-surface/60 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-ink truncate text-sm font-bold">{it.name}</span>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black", TONE_SOFT[it.tagTone])}>{it.tag}</span>
                  </span>
                  <span className="text-muted block truncate text-xs">{it.sub}</span>
                </span>
                <span className="text-brand-strong shrink-0 inline-flex items-center gap-1 text-[13px] font-black">{it.action} <Icon name="ArrowLeft" size={13} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 9. Property acquisition radar ───────────────────────────────────────────
function AcquisitionRadar({ acq }: { acq: HomeAcquisition }) {
  const chips = [
    { label: "עדיפות גבוהה", value: acq.highPriority, icon: "Flame" },
    { label: "בעלי בית פרטיים", value: acq.privateSellers, icon: "Home" },
    { label: "ביקוש קונים", value: acq.buyerDemand, icon: "Users" },
    { label: "פוטנציאל דאבל", value: acq.doubleSide, icon: "Handshake" },
  ];
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
      <Head title="רדאר גיוס נכסים" subtitle="הזדמנויות לגיוס מלאי ורווח עתידי" />
      {acq.total === 0 ? (
        <div className="text-muted flex flex-col items-center justify-center gap-1 py-6 text-center">
          <Icon name="Target" size={24} className="text-muted/70" />
          <p className="text-ink text-sm font-bold">אין כרגע הזדמנויות גיוס חדשות באזור שבחרת</p>
          <p className="text-xs">ZONO תסרוק את השוק ותציף הזדמנויות גיוס אוטומטית</p>
        </div>
      ) : (
        <>
          <div className="bg-surface mb-3 flex items-center justify-between rounded-2xl p-3.5">
            <div>
              <p className="text-ink text-2xl font-black">{acq.total}</p>
              <p className="text-muted text-[11px] font-bold">הזדמנויות לגיוס באזור שלך</p>
            </div>
            <Link href="/acquisition" className="btn-zono-primary inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold">
              פתח רדאר גיוס <Icon name="ArrowLeft" size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {chips.map((c) => (
              <div key={c.label} className="border-line rounded-xl border p-2.5 text-center">
                <p className="text-ink text-lg font-black">{c.value}</p>
                <p className="text-muted text-[10px] font-bold">{c.label}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Activity feed ───────────────────────────────────────────────────────────
function ActivityFeed({ items }: { items: HomeActivityItem[] }) {
  return (
    <div className="bg-card border-line flex h-full flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <Head title="מה חדש" subtitle="מה קרה בעסק שלך לאחרונה" action={<Link href="/action-center" className="text-brand-strong hover:text-brand text-xs font-bold">לכל הפעילות</Link>} />
      {items.length === 0 ? (
        <div className="text-muted flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
          <Icon name="Bell" size={24} className="text-muted/70" />
          <p className="text-ink text-sm font-bold">אין עדיין פעילות להצגה</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map((a, i) => {
            const row = (
              <div className={cn("flex items-start gap-3 py-2.5", i > 0 && "border-line border-t")}>
                <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", ACTIVITY_TONE[a.tone])}><Icon name={a.icon} size={15} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-bold">{a.title}</p>
                  {a.description && <p className="text-muted truncate text-xs">{a.description}</p>}
                </div>
                <span className="text-muted shrink-0 text-[11px] font-medium">{timeAgo(a.at)}</span>
              </div>
            );
            return <li key={a.id}>{a.href ? <Link href={a.href} className="hover:bg-surface/60 -mx-2 block rounded-lg px-2 transition">{row}</Link> : row}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

// ── Territory (dark live map) — full-width own section ───────────────────────
function Territory({ territory }: { territory: HomeTerritory }) {
  const stat = (label: string, value: number) => (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
      <p className="text-lg font-black text-white">{value.toLocaleString("he-IL")}</p>
      <p className="text-[11px] font-semibold text-white/60">{label}</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        {stat("נכסים באזור", territory.properties)}
        {stat("קונים פעילים", territory.buyers)}
        {stat("עסקאות", territory.deals)}
      </div>
      <HomeHeatmapSection heightClass="h-[340px] lg:h-[440px]" />
      <Link href="/market" className="btn-zono-primary inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold sm:w-auto sm:self-start sm:px-6">
        <Icon name="Map" size={15} /> פתח את המפה המלאה
      </Link>
    </div>
  );
}

// ── Updates ─────────────────────────────────────────────────────────────────
function Updates({ recTotal, toursThisWeek, newLeads }: { recTotal: number; toursThisWeek: number; newLeads: number }) {
  const rows: { icon: string; tone: string; label: string; value: number; href: string }[] = [
    { icon: "Bell", tone: "bg-brand-soft text-brand-strong", label: "פריטים שדורשים טיפול", value: recTotal, href: "/action-center" },
    { icon: "Calendar", tone: "bg-warning-soft text-warning", label: "סיורים בשבוע הקרוב", value: toursThisWeek, href: "/viewings" },
    { icon: "Users", tone: "bg-success-soft text-success", label: "לידים חדשים לטיפול", value: newLeads, href: "/leads" },
  ];
  return (
    <div className="bg-card border-line flex h-full flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
      <Head title="דברים שכדאי לדעת" subtitle="עדכונים שדורשים את תשומת ליבך" />
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.label}>
            <Link href={r.href} className="border-line hover:bg-surface/60 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition">
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", r.tone)}><Icon name={r.icon} size={15} /></span>
              <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">{r.label}</span>
              <span className="text-ink shrink-0 text-lg font-black">{r.value.toLocaleString("he-IL")}</span>
              <Icon name="ArrowLeft" size={14} className="text-muted shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Monthly performance ─────────────────────────────────────────────────────
function BarList({ rows, tone }: { rows: { label: string; value: number }[]; tone: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-muted py-4 text-center text-sm">אין עדיין נתונים</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          <span className="text-muted w-24 shrink-0 truncate text-[12px] font-semibold">{r.label}</span>
          <div className="bg-surface h-2.5 flex-1 overflow-hidden rounded-full">
            <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.round((r.value / max) * 100)}%` }} />
          </div>
          <span className="text-ink w-8 shrink-0 text-end text-[12px] font-black">{r.value.toLocaleString("he-IL")}</span>
        </li>
      ))}
    </ul>
  );
}

function MonthlyPerformance({ perf }: { perf: HomePerf }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <p className="text-ink text-sm font-black">מדדים חודשיים</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface rounded-xl p-2.5 text-center"><p className="text-brand-strong text-lg font-black">{ilsC(perf.expectedRevenue)}</p><p className="text-muted text-[10px] font-bold">מחזור צפוי</p></div>
          <div className="bg-surface rounded-xl p-2.5 text-center"><p className="text-ink text-lg font-black">{perf.activeDeals}</p><p className="text-muted text-[10px] font-bold">עסקאות פעילות</p></div>
          <div className="bg-surface rounded-xl p-2.5 text-center"><p className="text-ink text-lg font-black">{perf.newLeads}</p><p className="text-muted text-[10px] font-bold">לידים חדשים</p></div>
        </div>
      </div>
      <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <p className="text-ink text-sm font-black">לידים לפי מקור</p>
        <BarList rows={perf.leadsBySource} tone="zono-gradient" />
      </div>
      <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <p className="text-ink text-sm font-black">עסקאות לפי שלב</p>
        <BarList rows={perf.dealsByStage} tone="bg-success" />
      </div>
    </div>
  );
}

// ── WhatsApp — the conversations waiting for you ─────────────────────────────
function WhatsappWaiting({ wa }: { wa: HomeWhatsapp }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <Head
        title="השיחות שמחכות לך"
        subtitle="ZONO זיהה את השיחות שכדאי לקדם עכשיו"
        action={wa.connected ? <Link href="/whatsapp" className="text-brand-strong hover:text-brand text-xs font-bold">לכל השיחות</Link> : undefined}
      />
      {wa.conversations.length > 0 && (
        <div className="mt-3 mb-2 flex flex-wrap gap-2">
          {wa.waiting > 0 && <span className="bg-warning-soft text-warning rounded-full px-3 py-1 text-[11px] font-bold">{wa.waiting} ממתינות לתגובה</span>}
          {wa.urgent > 0 && <span className="bg-danger-soft text-danger rounded-full px-3 py-1 text-[11px] font-bold">{wa.urgent} דחופות</span>}
          {wa.today > 0 && <span className="bg-brand-soft text-brand-strong rounded-full px-3 py-1 text-[11px] font-bold">{wa.today} היום</span>}
        </div>
      )}
      {wa.conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="bg-[#25D366]/10 text-[#128C7E] grid h-12 w-12 place-items-center rounded-2xl"><Icon name="MessageCircle" size={22} /></span>
          <p className="text-ink text-sm font-bold">{wa.connected ? "אין שיחות שממתינות לתגובה — הכול מטופל" : "חברו את WhatsApp כדי לזהות שיחות שדורשות טיפול"}</p>
          <Link href="/whatsapp" className="btn-zono-primary mt-1 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold">
            <Icon name="MessageCircle" size={14} /> {wa.connected ? "פתח את WhatsApp" : "חיבור WhatsApp"}
          </Link>
        </div>
      ) : (
        <ul className="mt-1 flex flex-col gap-2">
          {wa.conversations.map((c) => (
            <li key={c.id}>
              <Link href={c.href} className="border-line hover:bg-surface/60 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition">
                <span className="bg-[#25D366]/12 text-[#128C7E] grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="MessageCircle" size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-bold">{c.name}</p>
                  {c.reason && <p className="text-muted truncate text-[12px]">{c.reason}</p>}
                </div>
                <span className="text-brand-strong shrink-0 inline-flex items-center gap-1 text-[13px] font-black">פתח שיחה <Icon name="ArrowLeft" size={13} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── ZONO worked for you — what happened behind the scenes ────────────────────
function ZonoWork({ work }: { work: HomeZonoWork }) {
  if (work.items.length === 0) return null; // honest: nothing to show yet → hide the band
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <Head title="ZONO עובד בשבילך" subtitle={`מה קרה מאחורי הקלעים ${work.windowLabel}`} />
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {work.items.map((it) => (
          <div key={it.id} className="bg-surface flex items-center gap-2.5 rounded-2xl p-3">
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", TONE_SOFT[it.tone])}><Icon name={it.icon} size={16} /></span>
            <span className="text-ink text-[12px] font-bold leading-tight">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Lead rescue — dormant clients worth bringing back ────────────────────────
function LeadRescue({ items }: { items: HomeDormantLead[] }) {
  if (items.length === 0) return null; // nothing dormant → don't add noise
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <Head
        title="לידים שכדאי להחזיר לתמונה"
        subtitle="לקוחות מהעבר שעכשיו יש סיבה טובה לחזור אליהם"
        action={<Link href="/buyers" className="text-brand-strong hover:text-brand text-xs font-bold">לכל הלקוחות</Link>}
      />
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={it.href} className="border-line hover:bg-surface/60 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition">
              <span className="bg-warning-soft text-warning grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="Snowflake" size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-sm font-bold">{it.name}</p>
                <p className="text-muted truncate text-[12px]">{it.sub}</p>
              </div>
              <span className="text-brand-strong shrink-0 inline-flex items-center gap-1 text-[13px] font-black">חזור ללקוח <Icon name="ArrowLeft" size={13} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Marketing focus — what's worth promoting now ─────────────────────────────
function MarketingFocus({ mk }: { mk: HomeMarketing }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <Head
        title="השיווק שלך"
        subtitle="ZONO מזהה מה עובד, מה נחלש ומה כדאי לקדם עכשיו"
        action={mk.hasData ? <Link href="/marketing" className="text-brand-strong hover:text-brand text-xs font-bold">למרכז השיווק</Link> : undefined}
      />
      {!mk.hasData ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="bg-brand-soft text-brand grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Megaphone" size={22} /></span>
          <p className="text-ink text-sm font-bold">עדיין אין נתוני שיווק</p>
          <p className="text-muted max-w-sm text-xs">הפעילו ניתוח שיווק או חברו את Meta כדי ש-ZONO ימליץ אילו נכסים כדאי לקדם עכשיו ואיפה</p>
          <Link href="/marketing" className="btn-zono-primary mt-1 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold">
            <Icon name="Megaphone" size={14} /> פתח את מרכז השיווק
          </Link>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {mk.items.map((it) => (
            <li key={it.id}>
              <Link href={it.href} className="border-line hover:bg-surface/60 flex items-start gap-3 rounded-xl border px-3 py-2.5 transition">
                <span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="Megaphone" size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-bold">{it.title}</p>
                  {it.detail && <p className="text-muted line-clamp-2 text-[12px]">{it.detail}</p>}
                </div>
                <span className="text-brand-strong shrink-0 inline-flex items-center gap-1 text-[13px] font-black">{it.action} <Icon name="ArrowLeft" size={13} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface HomeControlCenterProps {
  dict: DashboardDict;
  agentName: string;
  hero: HomeHero;
  kpis: HomeKpi[];
  recommendations: HomeRec[];
  buyerMatches: HomeRec[];
  now: HomeNowItem[];
  pipeline: HomePipeline;
  followUps: HomeFollowUpItem[];
  acquisition: HomeAcquisition;
  nextDeal: HomeNextDeal | null;
  activity: HomeActivityItem[];
  tasks: HomeTaskItem[];
  featuredProperty: PropertyCard | null;
  hotProperties: PropertyCard[];
  privateListings: HomePrivateListing[];
  whatsapp: HomeWhatsapp;
  marketing: HomeMarketing;
  dormantLeads: HomeDormantLead[];
  zonoWork: HomeZonoWork;
  territory: HomeTerritory;
  perf: HomePerf;
  summary: { recTotal: number; toursThisWeek: number; newLeads: number };
  /** "על הבוקר" server component, rendered in place of the Now/Today row. */
  morningBriefSlot?: React.ReactNode;
}

export function HomeControlCenter(p: HomeControlCenterProps) {
  const t = useMemo(() => (k: string) => tr(p.dict, k), [p.dict]);
  return (
    <div dir="rtl" className="flex flex-col gap-7">
      {/* 1. Hero — daily operating overview */}
      <Hero agentName={p.agentName} hero={p.hero} />

      {/* 2. KPI strip */}
      <KpiStrip kpis={p.kpis} />

      {/* 3. AI Coach (dark) */}
      <AiCoach recs={p.recommendations} />

      {/* 3b. What ZONO did for you behind the scenes (hidden when nothing recent) */}
      <ZonoWork work={p.zonoWork} />

      {/* 4. "על הבוקר" — the morning action center (replaces the old NOW +
             Today's-tasks row). Server component passed in as a slot so it can
             fetch getDailyCommandCenter() while this stays a client component.
             Falls back to the legacy Now/Today row if no slot is provided. */}
      {p.morningBriefSlot ?? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <NowSection items={p.now} />
          <TodayTasksCard tasks={p.tasks} />
        </div>
      )}

      {/* 4a. Recommended property (50%) + Quick actions (50%) — placed directly
             under "על הבוקר" for fast daily access. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <Head title="הנכס המומלץ עבורך" />
          {p.featuredProperty
            ? <RecommendedPropertyCard t={t} p={p.featuredProperty} />
            : <div className="bg-card border-line text-muted flex h-full min-h-[240px] flex-col items-center justify-center gap-1 rounded-[26px] border p-8 text-center"><Icon name="Building2" size={26} className="text-muted/70" /><p className="text-ink text-sm font-bold">אין עדיין נכס מומלץ</p><p className="text-xs">הוסף נכסים כדי לקבל המלצה חכמה</p></div>}
        </div>
        <div>
          <Head title="פעולות מהירות" />
          <HomeQuickActions />
        </div>
      </div>

      {/* 4b. WhatsApp — the conversations waiting for you */}
      <WhatsappWaiting wa={p.whatsapp} />

      {/* 5. Deal pipeline — money first */}
      <DealPipeline pipeline={p.pipeline} />

      {/* 6. Client × Property matches */}
      <ClientMatches recs={p.buyerMatches} />

      {/* 6b. Lead rescue — dormant clients worth bringing back (hidden when none) */}
      <LeadRescue items={p.dormantLeads} />

      {/* 7. The Next Deal — killer card (only when a real deal exists) */}
      {p.nextDeal && <NextDealCard deal={p.nextDeal} />}

      {/* 8. Follow-up radar + Acquisition radar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FollowUpRadar items={p.followUps} />
        <AcquisitionRadar acq={p.acquisition} />
      </div>

      {/* 8b. Marketing — what's worth promoting now */}
      <MarketingFocus mk={p.marketing} />

      {/* 10. Live area map — full-width, its own section */}
      <div>
        <Head title="מפת הנכסים החיה באזור שלך" subtitle={p.territory.areaLabel ?? undefined} />
        <Territory territory={p.territory} />
      </div>

      {/* 11. New properties in area — PRIVATE-OWNER (no broker) with WhatsApp-to-owner */}
      <div>
        <Head title="נכסים חדשים באזור שלך" subtitle="נכסים ללא מתווך — פנייה ישירה לבעלים בוואטסאפ" action={<Link href="/external-listings" className="text-brand-strong hover:text-brand text-xs font-bold">לכל הנכסים</Link>} />
        <PrivateOwnerListings items={p.privateListings} />
      </div>

      {/* 11b. Hot exclusive properties (preserved — renders its own heading) */}
      <div>
        <HotPropertiesSection t={t} properties={p.hotProperties} />
      </div>

      {/* 12. Activity + Updates + monthly performance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ActivityFeed items={p.activity} />
        <Updates recTotal={p.summary.recTotal} toursThisWeek={p.summary.toursThisWeek} newLeads={p.summary.newLeads} />
      </div>
      <div>
        <Head title="הביצועים שלך" subtitle="התמונה החודשית שלך במבט מהיר" />
        <MonthlyPerformance perf={p.perf} />
      </div>
    </div>
  );
}
