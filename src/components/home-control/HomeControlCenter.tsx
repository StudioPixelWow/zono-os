"use client";
// ============================================================================
// ZONO — Home Control Center (redesign). A clean, premium, RTL command surface:
// daily snapshot → KPIs → AI recommendations (dark-purple) → activity + today's
// tasks → featured property + quick actions + territory map (dark-purple) → new
// properties → updates → monthly performance. 100% composition over the EXISTING
// data pipeline + services — no new engines, no mock data. Light throughout;
// dark-purple is used ONLY for the AI block and the territory map.
// ============================================================================
import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { tr, type DashboardDict } from "@/lib/dashboard-home/i18n";
import type { PropertyCard } from "@/lib/dashboard-home/types";
import { RecommendedPropertyCard } from "@/components/dashboard-home/components/DashboardHero";
import { HotPropertiesSection } from "@/components/dashboard-home/components/HotPropertiesSection";
import { HomeHeatmapSection } from "@/components/dashboard-home/components/HomeHeatmapSection";
import { TodayTasksCard } from "./TodayTasksCard";
import type { HomeTaskItem } from "@/lib/home/home-service";
import type { HomeKpi, HomeRec, HomeActivityItem, HomeTerritory, HomePerf } from "./types";

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const ilsC = (n: number) => (n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : ils(n));

const URGENCY_DOT: Record<HomeRec["urgency"], string> = {
  critical: "bg-rose-400", high: "bg-amber-400", medium: "bg-violet-300", low: "bg-white/40",
};
const URGENCY_HE: Record<HomeRec["urgency"], string> = { critical: "קריטי", high: "דחוף", medium: "חשוב", low: "רגיל" };
const AREA_ICON: Record<string, string> = {
  acquisition: "Target", buyer: "Users", seller: "Home", deal: "Handshake", journey: "Route", daily: "Sparkles", office: "Building2",
};
const ACTIVITY_TONE: Record<HomeActivityItem["tone"], string> = {
  brand: "bg-brand-soft text-brand-strong", success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", neutral: "bg-surface text-muted",
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

// ── 1. Snapshot header ──────────────────────────────────────────────────────
function Snapshot({ agentName }: { agentName: string }) {
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "בוקר טוב";
    if (h < 18) return "צהריים טובים";
    return "ערב טוב";
  }, []);
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-ink text-3xl font-black sm:text-4xl">{greeting}, {agentName} 👋</h1>
      <p className="text-muted text-base sm:text-lg">הנה מה שקורה אצלך היום</p>
    </div>
  );
}

// ── 2. KPI strip ────────────────────────────────────────────────────────────
function KpiStrip({ kpis }: { kpis: HomeKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {kpis.map((k) => (
        <Link
          key={k.id}
          href={k.href}
          className="bg-card border-line hover:border-brand-light group flex flex-col gap-2 rounded-2xl border p-4 shadow-[var(--shadow-soft)] transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-muted text-[11px] font-bold">{k.label}</span>
            <span className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-xl"><Icon name={k.icon} size={15} /></span>
          </div>
          <span className="text-ink text-2xl font-black">{k.value}</span>
          <span className="text-muted group-hover:text-brand-strong inline-flex items-center gap-1 text-[11px] font-semibold transition">
            {k.hint ?? "פתח"} <Icon name="ArrowLeft" size={12} />
          </span>
        </Link>
      ))}
    </div>
  );
}

// ── 3. AI recommendations (dark-purple) ─────────────────────────────────────
function AiRecommendations({ recs }: { recs: HomeRec[] }) {
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
        <h2 className="text-lg font-black text-white sm:text-xl">ה־AI שלך ממליץ היום ✨</h2>
      </div>

      {recs.length === 0 ? (
        <div className="relative mt-4 flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <Icon name="CheckCircle2" size={26} className="text-emerald-300/80" />
          <p className="text-sm font-bold text-white/90">אין המלצות דחופות כרגע</p>
          <p className="text-xs text-white/60">ZONO ימשיך לנתח את הנתונים שלך ברקע ויתריע כשיהיה משהו חשוב</p>
        </div>
      ) : (
        <div className="relative mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {recs.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-violet-100"><Icon name={AREA_ICON[r.area] ?? "Sparkles"} size={15} /></span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/85">
                  <span className={cn("h-2 w-2 rounded-full", URGENCY_DOT[r.urgency])} /> {URGENCY_HE[r.urgency]}
                </span>
              </div>
              <p className="text-sm font-black text-white">{r.title}</p>
              <p className="line-clamp-2 text-xs leading-relaxed text-white/65">{r.why}</p>
              {r.href ? (
                <Link href={r.href} className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-[13px] font-bold text-[#241a52] transition hover:bg-white">
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

// ── 3b. Activity feed ───────────────────────────────────────────────────────
function ActivityFeed({ items }: { items: HomeActivityItem[] }) {
  const Body = (
    <div className="bg-card border-line flex h-full flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <Head title="מה חדש" subtitle="פעילות אחרונה במערכת" action={<Link href="/action-center" className="text-brand-strong hover:text-brand text-xs font-bold">לכל הפעילות</Link>} />
      {items.length === 0 ? (
        <div className="text-muted flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
          <Icon name="Inbox" size={24} className="text-muted/70" />
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
  return Body;
}

// ── 7. Territory (dark map) ─────────────────────────────────────────────────
function Territory({ territory }: { territory: HomeTerritory }) {
  const stat = (label: string, value: number) => (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
      <p className="text-lg font-black text-white">{value.toLocaleString("he-IL")}</p>
      <p className="text-[11px] font-semibold text-white/60">{label}</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {stat("נכסים באזור", territory.properties)}
        {stat("קונים פעילים", territory.buyers)}
        {stat("עסקאות", territory.deals)}
      </div>
      <HomeHeatmapSection heightClass="h-[300px] lg:h-[340px]" />
      <Link href="/market" className="btn-zono-primary inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold">
        <Icon name="Map" size={15} /> פתח את המפה המלאה
      </Link>
    </div>
  );
}

// ── 9. Updates ──────────────────────────────────────────────────────────────
function Updates({ recTotal, toursThisWeek, newLeads }: { recTotal: number; toursThisWeek: number; newLeads: number }) {
  const rows: { icon: string; tone: string; label: string; value: number; href: string }[] = [
    { icon: "Sparkles", tone: "bg-brand-soft text-brand-strong", label: "פריטים שדורשים טיפול", value: recTotal, href: "/action-center" },
    { icon: "Calendar", tone: "bg-warning-soft text-warning", label: "סיורים בשבוע הקרוב", value: toursThisWeek, href: "/viewings" },
    { icon: "Users", tone: "bg-success-soft text-success", label: "לידים חדשים לטיפול", value: newLeads, href: "/leads" },
  ];
  return (
    <div className="bg-card border-line flex h-full flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
      <Head title="הודעות ועדכונים" subtitle="מה דורש את תשומת ליבך" />
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

// ── 10. Monthly performance ─────────────────────────────────────────────────
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

// ── 6. Quick actions ────────────────────────────────────────────────────────
const QUICK_ACTIONS: { label: string; icon: string; href: string }[] = [
  { label: "ליד חדש", icon: "UserPlus", href: "/leads" },
  { label: "הוסף נכס", icon: "Building", href: "/properties/new" },
  { label: "צור התאמה", icon: "Sparkles", href: "/matches" },
  { label: "קבע סיור", icon: "Calendar", href: "/viewings" },
  { label: "שלח הודעה", icon: "MessageCircle", href: "/whatsapp" },
  { label: "משימה חדשה", icon: "ListChecks", href: "/action-center" },
];

function QuickActions() {
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
      <h2 className="text-ink text-base font-black">פעולות מהירות</h2>
      <div className="grid grid-cols-3 gap-2">
        {QUICK_ACTIONS.map((a) => (
          <Link key={a.label} href={a.href} className="bg-surface hover:bg-brand-soft border-line flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition">
            <span className="bg-brand-soft text-brand-strong grid h-9 w-9 place-items-center rounded-xl"><Icon name={a.icon} size={17} /></span>
            <span className="text-ink text-[12px] font-bold">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export interface HomeControlCenterProps {
  dict: DashboardDict;
  agentName: string;
  kpis: HomeKpi[];
  recommendations: HomeRec[];
  activity: HomeActivityItem[];
  tasks: HomeTaskItem[];
  featuredProperty: PropertyCard | null;
  hotProperties: PropertyCard[];
  territory: HomeTerritory;
  perf: HomePerf;
  summary: { recTotal: number; toursThisWeek: number; newLeads: number };
}

export function HomeControlCenter(p: HomeControlCenterProps) {
  const t = useMemo(() => (k: string) => tr(p.dict, k), [p.dict]);
  return (
    <div dir="rtl" className="flex flex-col gap-7">
      {/* 1. Snapshot */}
      <Snapshot agentName={p.agentName} />

      {/* 2. KPIs */}
      <KpiStrip kpis={p.kpis} />

      {/* 3. AI recommendations (dark) */}
      <AiRecommendations recs={p.recommendations} />

      {/* 4. Activity + today's tasks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ActivityFeed items={p.activity} />
        <TodayTasksCard tasks={p.tasks} />
      </div>

      {/* 5. Featured property + quick actions + territory */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Head title="הנכס המומלץ עבורך" />
          {p.featuredProperty
            ? <RecommendedPropertyCard t={t} p={p.featuredProperty} />
            : <div className="bg-card border-line text-muted flex h-full min-h-[240px] flex-col items-center justify-center gap-1 rounded-[26px] border p-8 text-center"><Icon name="Building2" size={26} className="text-muted/70" /><p className="text-ink text-sm font-bold">אין עדיין נכס מומלץ</p><p className="text-xs">הוסף נכסים כדי לקבל המלצה חכמה</p></div>}
        </div>
        <div className="lg:col-span-1">
          <Head title="פעולות מהירות" />
          <QuickActions />
        </div>
        <div className="lg:col-span-1">
          <Head title="האזור שלך" subtitle={p.territory.areaLabel ?? undefined} />
          <Territory territory={p.territory} />
        </div>
      </div>

      {/* 6. New properties in area */}
      <div>
        <Head title="נכסים חדשים באזור" action={<Link href="/properties" className="text-brand-strong hover:text-brand text-xs font-bold">לכל הנכסים</Link>} />
        <HotPropertiesSection t={t} properties={p.hotProperties} />
      </div>

      {/* 7. Updates + monthly performance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1"><Updates recTotal={p.summary.recTotal} toursThisWeek={p.summary.toursThisWeek} newLeads={p.summary.newLeads} /></div>
        <div className="lg:col-span-2">
          <Head title="ביצועים חודשיים" />
          <MonthlyPerformance perf={p.perf} />
        </div>
      </div>
    </div>
  );
}
