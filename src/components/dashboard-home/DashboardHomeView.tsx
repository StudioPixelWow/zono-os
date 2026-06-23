"use client";

// ============================================================================
// ZONO — AI Real Estate Operating System · Home (Command Center) view
// ----------------------------------------------------------------------------
// Premium, RTL, light-theme, vertically-scrolling command center. All UI labels
// resolve through the i18n dictionary (no hardcoded Hebrew). Interactive bits
// (heat-map metric + neighborhood drawer, carousel, mission toggles, AI FAB)
// live here; data is loaded on the server and passed in as props.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Reveal, RevealGroup, RevealItem } from "@/components/dashboard/motion";
import { cn } from "@/lib/utils";
import { tr, type DashboardDict } from "@/lib/dashboard-home/i18n";
import type {
  CompetitorInsight, DashboardHomeData, DashboardKpi, HeatMapMetric, HeatMapZone,
  MarketTrend, OpportunitySignal, PropertyCard, PropertyJourneyItem, SignalTone,
} from "@/lib/dashboard-home/types";

/* ── format helpers ──────────────────────────────────────────────────────── */
const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const ilsC = (n: number) => (n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : ils(n));

const TONE_BG: Record<SignalTone, string> = {
  positive: "bg-success", negative: "bg-danger", opportunity: "bg-warning", agent: "bg-brand", neutral: "bg-muted",
};
const TONE_SOFT: Record<SignalTone, string> = {
  positive: "bg-success-soft text-success", negative: "bg-danger-soft text-danger",
  opportunity: "bg-warning-soft text-warning", agent: "bg-brand-soft text-brand-strong", neutral: "bg-line/70 text-ink",
};

/* ── small shared bits ───────────────────────────────────────────────────── */
function SectionHead({ n, title, action }: { n?: number; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-ink text-lg font-black sm:text-xl">{title}</h2>
        {n != null && <span className="bg-brand-soft text-brand-strong grid h-6 w-6 place-items-center rounded-full text-xs font-black">{n}</span>}
      </div>
      {action}
    </div>
  );
}
function Delta({ pct, trend }: { pct: number; trend: "up" | "down" | "flat" }) {
  const up = trend === "up";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold", up ? "text-success" : trend === "down" ? "text-danger" : "text-muted")}>
      <Icon name={up ? "TrendingUp" : trend === "down" ? "TrendingDown" : "Minus"} size={13} />{pct > 0 ? "+" : ""}{pct}%
    </span>
  );
}
function Sparkline({ points, tone = "brand" }: { points: number[]; tone?: "brand" | "success" | "danger" }) {
  const w = 120, h = 36;
  const stroke = tone === "success" ? "var(--color-success)" : tone === "danger" ? "var(--color-danger)" : "var(--color-brand)";
  const d = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - p * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={d} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── 1. Hero command center ──────────────────────────────────────────────── */
function FeaturedPropertyCard({ t, p }: { t: (k: string) => string; p: PropertyCard }) {
  return (
    <div className="bg-card border-line flex w-full flex-col overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)] lg:w-72">
      <div className="bg-surface relative aspect-[16/10]">
        {p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
          : <div className="text-muted grid h-full place-items-center"><Icon name="Building2" size={30} /></div>}
        <span className="bg-brand text-white absolute end-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold">{t("hero.featuredTag")}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        <p className="text-ink text-sm font-extrabold">{p.title}</p>
        <p className="text-muted text-xs">{p.addressLine}</p>
        {p.aiInsightKey && <span className="bg-success-soft text-success inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"><Icon name="BadgeCheck" size={11} />{t(p.aiInsightKey)}</span>}
        <p className="text-brand-strong text-lg font-black">{ils(p.price)}</p>
        <div className="flex items-center justify-between">
          {p.aiMatchScore != null && <span className="text-success text-xs font-black">{t("hero.matchScore")} {p.aiMatchScore}%</span>}
          <Link href={p.href} className="bg-brand-soft text-brand-strong rounded-lg px-3 py-1.5 text-[12px] font-bold">{t("hero.featuredCta")}</Link>
        </div>
      </div>
    </div>
  );
}
function KpiCard({ t, k }: { t: (k: string) => string; k: DashboardKpi }) {
  return (
    <RevealItem>
      <div className="bg-card border-line flex h-full flex-col gap-1.5 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between">
          <span className="text-muted text-[11px] font-bold">{t(k.labelKey + ".label")}</span>
          <span className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-xl"><Icon name={k.icon} size={15} /></span>
        </div>
        <span className="text-ink text-2xl font-black">{k.value}</span>
        <div className="flex items-center justify-between gap-1">
          <Delta pct={k.deltaPct} trend={k.trend} />
          <span className="text-muted truncate text-[10px]">{t(k.hintKey)}</span>
        </div>
      </div>
    </RevealItem>
  );
}
function HeroCommandCenter({ t, data }: { t: (k: string) => string; data: DashboardHomeData }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {data.featuredProperty && <FeaturedPropertyCard t={t} p={data.featuredProperty} />}
        <div className="flex flex-1 flex-col justify-center gap-4">
          <div>
            <p className="text-muted text-sm">{t("hero.greeting")}, {data.agentName} 👋</p>
            <h1 className="text-ink text-2xl font-black sm:text-3xl">{t("hero.title")}</h1>
            <p className="text-muted mt-0.5 text-sm">{t("hero.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("zono:open-search"))}
              className="bg-card border-line text-muted hover:border-brand-light flex h-11 flex-1 items-center gap-2 rounded-xl border px-3 text-start shadow-[var(--shadow-soft)] transition-colors"
            >
              <Icon name="Search" size={16} />
              <span className="text-sm truncate">{t("search.placeholder")}</span>
              <kbd className="bg-surface text-muted ms-auto hidden rounded px-1.5 py-0.5 text-[10px] font-bold sm:inline">⌘K</kbd>
            </button>
            <Link href="/properties/new" className="bg-brand text-white inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-bold">
              <Icon name="Plus" size={16} />{t("hero.quickAdd")}
            </Link>
          </div>
          {/* Fill the space beside the featured card with quick AI shortcuts. */}
          <div className="flex flex-wrap gap-2">
            {[
              { l: "aiActions.findBuyers", i: "Users", h: "/buyers" },
              { l: "aiActions.findSellers", i: "Home", h: "/sellers" },
              { l: "aiActions.createPost", i: "Sparkles", h: "/creative" },
              { l: "aiActions.openOpportunities", i: "Target", h: "/command" },
            ].map((a) => (
              <Link key={a.l} href={a.h} className="bg-brand-soft text-brand-strong hover:bg-brand-soft/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors">
                <Icon name={a.i} size={13} />{t(a.l)}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <RevealGroup className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {data.kpis.map((k) => <KpiCard key={k.id} t={t} k={k} />)}
      </RevealGroup>
    </div>
  );
}

/* ── 2. City heat map ────────────────────────────────────────────────────── */
const METRICS: HeatMapMetric[] = ["price_per_sqm", "buyer_demand", "rental_demand", "new_listings", "recent_transactions", "price_drops"];

function NeighborhoodInsightDrawer({ t, zone, onClose }: { t: (k: string) => string; zone: HeatMapZone; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex justify-start">
      <div className="bg-ink/20 absolute inset-0" onClick={onClose} aria-hidden />
      <div className="bg-card relative h-full w-full max-w-sm overflow-y-auto p-5 shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between">
          <h3 className="text-ink text-lg font-black">{zone.name}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label={t("heatMap.drawer.close")}><Icon name="X" size={18} /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { l: t("heatMap.drawer.avgPrice"), v: ilsC(zone.avgPrice) },
            { l: t("heatMap.drawer.pricePerSqm"), v: ils(zone.pricePerSqm) },
            { l: t("heatMap.drawer.activeProperties"), v: String(zone.activeProperties) },
            { l: t("heatMap.drawer.recentTransactions"), v: String(zone.recentTransactions) },
          ].map((s) => (
            <div key={s.l} className="bg-surface rounded-xl p-3"><p className="text-muted text-[11px] font-bold">{s.l}</p><p className="text-ink text-base font-black">{s.v}</p></div>
          ))}
        </div>
        <div className="bg-surface mt-3 flex items-center justify-between rounded-xl p-3">
          <span className="text-muted text-[11px] font-bold">{t("heatMap.drawer.trend30")}</span>
          <Delta pct={zone.deltaPct} trend={zone.deltaPct >= 0 ? "up" : "down"} />
        </div>
        <div className="mt-3">
          <p className="text-muted text-[11px] font-bold">{t("heatMap.drawer.topCompetitors")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">{zone.topCompetitors.map((c) => <span key={c} className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{c}</span>)}</div>
        </div>
        <div className="bg-brand-soft mt-4 rounded-xl p-3">
          <p className="text-brand-strong inline-flex items-center gap-1 text-[11px] font-black"><Icon name="Sparkles" size={13} />{t("heatMap.drawer.aiInsight")}</p>
          <p className="text-ink mt-1 text-sm">{t(zone.aiInsightKey)}</p>
        </div>
        <Link href="/market" className="bg-brand text-white mt-3 block rounded-xl px-3 py-2.5 text-center text-sm font-bold">{t(zone.recommendedActionKey)}</Link>
      </div>
    </div>
  );
}

function CityHeatMap({ t, data }: { t: (k: string) => string; data: DashboardHomeData }) {
  const [metric, setMetric] = useState<HeatMapMetric>("price_per_sqm");
  const [zone, setZone] = useState<HeatMapZone | null>(null);
  return (
    <div className="bg-card border-line relative grid grid-cols-1 overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)] lg:grid-cols-[1.7fr_1fr]">
      <div className="relative aspect-[16/10] lg:aspect-auto">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-100 via-surface to-success-soft/50" />
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(var(--color-line) 1px,transparent 1px),linear-gradient(90deg,var(--color-line) 1px,transparent 1px)", backgroundSize: "46px 46px", opacity: 0.45 }} />
        {data.heatZones.map((z) => (
          <button key={z.id} onClick={() => setZone(z)} className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer" style={{ top: `${z.top}%`, insetInlineStart: `${z.left}%` }} aria-label={z.name}>
            <span className={cn("absolute -inset-6 rounded-full opacity-25 blur-xl", TONE_BG[z.tone])} style={{ width: z.radius, height: z.radius, insetInlineStart: -z.radius / 2, top: -z.radius / 2 }} />
            <span className="bg-card border-line text-ink relative inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-black shadow-[var(--shadow-soft)]">
              {z.name}<span className={cn(z.deltaPct >= 0 ? "text-success" : "text-danger")}>{z.deltaPct >= 0 ? "+" : ""}{z.deltaPct}%</span>
            </span>
          </button>
        ))}
        {zone && <NeighborhoodInsightDrawer t={t} zone={zone} onClose={() => setZone(null)} />}
      </div>
      <div className="border-line flex flex-col gap-3 border-t p-4 lg:border-s lg:border-t-0">
        <p className="text-ink text-sm font-extrabold">{t("heatMap.filtersTitle")}</p>
        <div className="flex flex-col gap-1.5">
          {METRICS.map((m) => (
            <button key={m} onClick={() => setMetric(m)} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-start text-[13px] font-bold transition-colors", metric === m ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface")}>
              <span className={cn("grid h-4 w-4 place-items-center rounded-full border-2", metric === m ? "border-brand" : "border-line")}>{metric === m && <span className="bg-brand h-2 w-2 rounded-full" />}</span>
              {t("heatMap.metric." + m)}
            </button>
          ))}
        </div>
        <div className="bg-surface mt-auto rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted text-[11px] font-bold">{t("heatMap.cityTrend")}</span>
            <span className="text-success text-lg font-black">+{data.cityTrendPct}%</span>
          </div>
          <Sparkline points={[0.3, 0.42, 0.4, 0.52, 0.58, 0.64, 0.72]} tone="success" />
          <p className="text-muted text-[10px]">{t("heatMap.last30")}</p>
        </div>
      </div>
    </div>
  );
}

/* ── 3. Opportunity radar ────────────────────────────────────────────────── */
function OpportunityCard({ t, o }: { t: (k: string) => string; o: OpportunitySignal }) {
  return (
    <RevealItem>
      <Link href={o.href} className="bg-card border-line hover:shadow-[var(--shadow-lift)] flex h-full flex-col gap-2 rounded-[22px] border p-5 shadow-[var(--shadow-card)] transition-shadow">
        <div className="flex items-center justify-between">
          <span className="bg-brand-soft text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name={o.icon} size={20} /></span>
          <span className="text-ink text-3xl font-black">{o.count}</span>
        </div>
        <p className="text-ink text-sm font-extrabold">{t("opportunity.kind." + o.kind)}</p>
        <p className="text-muted text-xs leading-snug">{t(o.reasonKey)}</p>
        <div className="border-line mt-auto flex items-center justify-between border-t pt-2">
          <span className="text-muted text-[11px] font-bold">{t("opportunity.confidence")} {o.confidence}%</span>
          <span className="text-brand-strong inline-flex items-center gap-1 text-[12px] font-bold">{t("opportunity.view")}<Icon name="ChevronLeft" size={13} /></span>
        </div>
      </Link>
    </RevealItem>
  );
}

/* ── 5. Property card (premium, image-first) ─────────────────────────────── */
function PremiumPropertyCard({ t, p }: { t: (k: string) => string; p: PropertyCard }) {
  const badgeTone: BadgeTone = p.badgeKey === "badge.price_drop" ? "danger" : p.badgeKey === "badge.exclusive" ? "brand" : p.badgeKey === "badge.hot" ? "warning" : "success";
  return (
    <div className="bg-card border-line flex min-w-[260px] max-w-[280px] flex-col overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)]">
      <div className="bg-surface relative aspect-square w-full overflow-hidden">
        {p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imageUrl} alt={p.title} className="absolute inset-0 h-full w-full object-cover object-center" />
          : (
            <div className="absolute inset-0 grid place-items-center p-3 text-center">
              <div>
                <Icon name="Image" size={26} className="text-muted mx-auto" />
                <p className="text-ink mt-1 text-[11px] font-bold">{t("empty.noImageTitle")}</p>
              </div>
            </div>
          )}
        {p.badgeKey && <span className="absolute start-3 top-3"><Badge tone={badgeTone} size="sm">{t(p.badgeKey)}</Badge></span>}
        {p.aiMatchScore != null && <span className="bg-card/90 text-success absolute end-3 top-3 rounded-full px-2 py-0.5 text-xs font-black backdrop-blur">{p.aiMatchScore}%</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-ink text-sm font-extrabold">{p.title}</p>
        <p className="text-muted text-xs">{p.neighborhood}{p.city ? `, ${p.city}` : ""}</p>
        <p className="text-brand-strong text-lg font-black">{ils(p.price)}</p>
        <div className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">
          <span>{p.rooms ?? "—"} {t("property.rooms")}</span><span className="bg-line h-3 w-px" />
          <span>{p.sizeSqm ?? "—"} {t("property.sqm")}</span><span className="bg-line h-3 w-px" />
          <span>{t("property.floor")} {p.floor ?? "—"}</span>
        </div>
        {p.aiInsightKey && <span className="bg-brand-soft text-brand-strong inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"><Icon name="Sparkles" size={11} />{t(p.aiInsightKey)}</span>}
        <Link href={p.href} className="bg-brand-soft text-brand-strong mt-auto rounded-lg px-3 py-2 text-center text-[13px] font-bold">{t("property.details")}</Link>
      </div>
    </div>
  );
}

/* ── 6. Competitor intelligence ──────────────────────────────────────────── */
function CompetitorCard({ c }: { c: CompetitorInsight }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="bg-surface grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full">
        {c.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={c.avatarUrl} alt={c.name} className="h-full w-full object-cover" />
          : <Icon name="Users" size={15} className="text-muted" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-sm font-bold">{c.name}</p>
        <p className="text-muted truncate text-[11px]">{c.agency}</p>
      </div>
      <span className="text-ink w-8 text-center text-sm font-black">{c.newListings}</span>
      <span className="text-muted hidden w-16 text-center text-xs font-bold sm:block">{ilsC(c.avgPrice)}</span>
      <span className="text-muted w-8 text-center text-xs font-bold">{c.exclusiveEstimate}</span>
      <span className={cn("w-10 text-center text-xs font-black", c.movement === "up" ? "text-success" : "text-danger")}>{c.movement === "up" ? "+" : ""}{c.movementScore}</span>
    </div>
  );
}

/* ── 7. Property journey (kanban) ────────────────────────────────────────── */
function JourneyCard({ t, item }: { t: (k: string) => string; item: PropertyJourneyItem }) {
  const p = item.property;
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-2.5 shadow-[var(--shadow-soft)]">
      <div className="bg-surface relative aspect-[16/9] overflow-hidden rounded-xl">
        {p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
          : <div className="text-muted grid h-full place-items-center"><Icon name="Image" size={20} /></div>}
        {item.alertKey && item.alertTone && <span className={cn("absolute end-2 top-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold", TONE_SOFT[item.alertTone])}>{t(item.alertKey)}</span>}
      </div>
      <p className="text-ink truncate text-xs font-bold">{p.title}</p>
      <p className="text-brand-strong text-[12px] font-black">{ilsC(p.price)}</p>
      <div className="bg-surface rounded-lg px-2 py-1.5">
        <p className="text-muted text-[9px] font-bold">{t("journey.nextAction")}</p>
        <p className="text-ink text-[11px] font-bold">{t(item.nextActionKey)}</p>
      </div>
      {item.interestedBuyers.length > 0 && (
        <div className="flex -space-x-2 space-x-reverse">
          {item.interestedBuyers.map((b) => (
            <span key={b.id} className="border-card bg-brand-soft text-brand-strong grid h-6 w-6 place-items-center overflow-hidden rounded-full border-2 text-[9px] font-black">
              {b.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={b.avatarUrl} alt={b.name} className="h-full w-full object-cover" />
                : b.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Root view ───────────────────────────────────────────────────────────── */
export function DashboardHomeView({ dict, data }: { dict: DashboardDict; data: DashboardHomeData }) {
  const t = useMemo(() => (k: string) => tr(dict, k), [dict]);
  const [missions, setMissions] = useState(data.missions);
  const doneCount = missions.filter((m) => m.done).length;
  const progress = Math.round((doneCount / missions.length) * 100);
  const [fabOpen, setFabOpen] = useState(false);

  const stages = ["draft", "photography", "published", "leads", "tours", "negotiation", "contract", "sold"] as const;

  const cityNow = [
    { l: t("cityNow.newListings"), v: String(data.cityNow.newListings) },
    { l: t("cityNow.priceDrops"), v: String(data.cityNow.priceDrops) },
    { l: t("cityNow.hotNeighborhood"), v: data.cityNow.hotNeighborhood },
    { l: t("cityNow.topTransaction"), v: ilsC(data.cityNow.topTransaction) },
    { l: t("cityNow.avgPricePerSqm"), v: ils(data.cityNow.avgPricePerSqm) },
  ];

  return (
    <div dir="rtl" className="relative flex flex-col gap-9">
      {/* 1 */}
      <Reveal><HeroCommandCenter t={t} data={data} /></Reveal>

      {/* 2 */}
      <section className="flex flex-col gap-3">
        <SectionHead n={1} title={t("heatMap.title")} />
        <CityHeatMap t={t} data={data} />
      </section>

      {/* 3 */}
      <section className="flex flex-col gap-3">
        <SectionHead n={2} title={t("opportunity.title")} action={<Link href="/command" className="text-brand-strong text-sm font-bold">{t("opportunity.openAll")}</Link>} />
        <p className="text-muted -mt-1 text-sm">{t("opportunity.subtitle")}</p>
        <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.opportunities.map((o) => <OpportunityCard key={o.id} t={t} o={o} />)}
        </RevealGroup>
      </section>

      {/* 4 */}
      <section className="flex flex-col gap-3">
        <SectionHead n={3} title={t("cityNow.title")} />
        <div className="bg-gradient-to-l from-brand-soft to-surface border-line grid grid-cols-2 gap-3 rounded-[22px] border p-4 sm:grid-cols-3 lg:grid-cols-5">
          {cityNow.map((s) => (
            <div key={s.l} className="bg-card/70 rounded-xl p-3 backdrop-blur">
              <p className="text-muted text-[11px] font-bold">{s.l}</p>
              <p className="text-ink text-lg font-black">{s.v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5 */}
      <section className="flex flex-col gap-3">
        <SectionHead n={4} title={t("hotProperties.title")} action={<Link href="/properties" className="text-brand-strong text-sm font-bold">{t("hotProperties.viewAll")}</Link>} />
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
          {data.hotProperties.map((p) => <PremiumPropertyCard key={p.id} t={t} p={p} />)}
        </div>
      </section>

      {/* 6 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-card border-line flex flex-col gap-1 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
          <SectionHead n={5} title={t("competitors.title")} action={<Link href="/competitors" className="text-brand-strong text-sm font-bold">{t("competitors.viewAll")}</Link>} />
          <div className="text-muted mt-2 flex items-center gap-3 px-1 text-[10px] font-bold">
            <span className="flex-1">{t("competitors.col.agent")}</span>
            <span className="w-8 text-center">{t("competitors.col.newListings")}</span>
            <span className="hidden w-16 text-center sm:block">{t("competitors.col.avgPrice")}</span>
            <span className="w-8 text-center">{t("competitors.col.exclusive")}</span>
            <span className="w-10 text-center">{t("competitors.col.movement")}</span>
          </div>
          <div className="divide-line divide-y">{data.competitors.map((c) => <CompetitorCard key={c.id} c={c} />)}</div>
        </div>
        <div className="bg-card border-line flex flex-col gap-2 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
          <p className="text-ink text-sm font-extrabold">{t("competitors.insightsTitle")}</p>
          <div className="flex flex-col gap-2">
            {data.competitorInsightKeys.map((k) => (
              <div key={k} className="bg-surface flex items-start gap-2 rounded-xl p-3">
                <Icon name="Sparkles" size={15} className="text-brand-strong mt-0.5 shrink-0" />
                <p className="text-ink text-sm">{t(k)}</p>
              </div>
            ))}
          </div>
          <Link href="/competitors" className="text-brand-strong mt-auto text-sm font-bold">{t("competitors.viewInsights")}</Link>
        </div>
      </section>

      {/* 7 */}
      <section className="flex flex-col gap-3">
        <SectionHead n={6} title={t("journey.title")} action={<Link href="/properties" className="text-brand-strong text-sm font-bold">{t("journey.viewAll")}</Link>} />
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {stages.map((stage) => {
            const items = data.journey.filter((j) => j.stage === stage);
            return (
              <div key={stage} className="bg-surface/60 border-line flex min-w-[200px] max-w-[210px] flex-col gap-2 rounded-2xl border p-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-ink text-[13px] font-extrabold">{t("journey.stage." + stage)}</span>
                  <span className="bg-card text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">{items.length}</span>
                </div>
                {items.map((it) => <JourneyCard key={it.property.id} t={t} item={it} />)}
              </div>
            );
          })}
        </div>
      </section>

      {/* 8 */}
      <section className="flex flex-col gap-3">
        <SectionHead n={7} title={t("marketTrends.title")} />
        <RevealGroup className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {data.marketTrends.map((m: MarketTrend) => (
            <RevealItem key={m.id}>
              <div className="bg-card border-line flex h-full flex-col gap-1 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
                <p className="text-muted text-[11px] font-bold">{t(m.labelKey)}</p>
                <div className="flex items-center justify-between">
                  <span className="text-ink text-lg font-black">{m.current}</span>
                  <Delta pct={m.deltaPct} trend={m.trend} />
                </div>
                <Sparkline points={m.points} tone={m.trend === "down" ? "danger" : "success"} />
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* 9 + 10 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionHead n={8} title={t("sellerIntel.title")} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.sellers.map((s) => (
              <Link key={s.id} href={s.href} className="bg-card border-line flex gap-3 rounded-2xl border p-3 shadow-[var(--shadow-soft)]">
                <span className="bg-surface grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl">
                  {s.propertyImageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.propertyImageUrl} alt="" className="h-full w-full object-cover" />
                    : <Icon name="Building2" size={18} className="text-muted" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-ink truncate text-sm font-bold">{s.name}</p>
                    <Badge tone={s.bucket === "at_risk" || s.bucket === "unresponsive" ? "danger" : s.bucket === "hot" ? "success" : "warning"} size="sm">{t("sellerIntel.bucket." + s.bucket)}</Badge>
                  </div>
                  <div className="text-muted mt-1 flex gap-2 text-[10px] font-bold">
                    <span>{t("sellerIntel.trust")} {s.trustScore}</span><span>{t("sellerIntel.urgency")} {s.urgencyScore}</span>
                  </div>
                  <p className="text-brand-strong mt-1 text-[12px] font-bold">{t(s.recommendedActionKey)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <SectionHead n={9} title={t("buyerIntel.title")} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.buyers.map((b) => (
              <Link key={b.id} href={b.href} className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-3 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-2">
                  <span className="bg-surface grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full">
                    {b.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={b.avatarUrl} alt={b.name} className="h-full w-full object-cover" />
                      : <Icon name="Users" size={15} className="text-muted" />}
                  </span>
                  <p className="text-ink flex-1 truncate text-sm font-bold">{b.name}</p>
                  <Badge tone={b.bucket === "hot" ? "success" : b.bucket === "dormant" ? "neutral" : "brand"} size="sm">{t("buyerIntel.bucket." + b.bucket)}</Badge>
                </div>
                <div className="text-muted flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold">
                  <span>{t("buyerIntel.budget")}: {ilsC(b.budget)}</span>
                  <span>{t("buyerIntel.area")}: {b.preferredArea}</span>
                  <span>{t("buyerIntel.matches")}: {b.matchCount}</span>
                </div>
                <p className="text-muted text-[11px]">{t(b.lastActivityKey)}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 11 */}
      <section className="flex flex-col gap-3">
        <SectionHead n={10} title={t("missionControl.title")} />
        <div className="bg-card border-line grid grid-cols-1 gap-5 rounded-[22px] border p-5 shadow-[var(--shadow-card)] lg:grid-cols-[200px_1fr_240px]">
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="relative grid h-28 w-28 place-items-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-line)" strokeWidth="10" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-brand)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(progress / 100) * 264} 264`} />
              </svg>
              <span className="text-ink text-2xl font-black">{progress}%</span>
            </div>
            <p className="text-muted text-[11px] font-bold">{t("missionControl.progress")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            {missions.map((m) => (
              <button key={m.id} onClick={() => setMissions((prev) => prev.map((x) => x.id === m.id ? { ...x, done: !x.done } : x))} className="hover:bg-surface flex items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors">
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border-2", m.done ? "bg-brand border-brand text-white" : "border-line")}>{m.done && <Icon name="Check" size={13} />}</span>
                <span className="text-muted w-10 text-[11px] font-bold">{m.time}</span>
                <span className={cn("flex-1 text-sm font-bold", m.done ? "text-muted line-through" : "text-ink")}>{t(m.labelKey)}</span>
                <Icon name={m.icon} size={14} className="text-muted" />
              </button>
            ))}
          </div>
          <div className="zono-ai-gradient flex flex-col justify-center gap-2 rounded-2xl p-4 text-center text-white">
            <p className="text-white/85 text-xs font-bold">{t("missionControl.prediction")}</p>
            <p className="text-4xl font-black">{data.dealProbabilityPct}%</p>
            <Link href="/tasks" className="bg-white text-brand-strong mt-1 rounded-xl px-3 py-2 text-sm font-black">{t("missionControl.openTasks")}</Link>
          </div>
        </div>
      </section>

      {/* 12 */}
      <section className="flex flex-col gap-3">
        <SectionHead n={11} title={t("recentActivity.title")} />
        <div className="bg-card border-line flex flex-col gap-1 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
          {data.activity.map((a) => (
            <div key={a.id} className="hover:bg-surface flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors">
              <span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name={a.icon} size={15} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-sm font-bold">{t(a.detailKey)}</p>
                <p className="text-muted text-[11px]">{a.entity}</p>
              </div>
              {a.propertyImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.propertyImageUrl} alt="" className="h-9 w-12 shrink-0 rounded-lg object-cover" />
              )}
              <span className="text-muted shrink-0 text-[11px]">{a.time}</span>
            </div>
          ))}
        </div>
      </section>

      {/* AI floating action button */}
      <div className="fixed bottom-24 start-5 z-30 lg:bottom-8">
        {fabOpen && (
          <div className="bg-card border-line mb-3 flex w-56 flex-col gap-0.5 rounded-2xl border p-2 shadow-[var(--shadow-lift)]">
            {[
              { l: "aiActions.findSellers", i: "Home", h: "/sellers" },
              { l: "aiActions.findBuyers", i: "Users", h: "/buyers" },
              { l: "aiActions.analyzeNeighborhood", i: "MapPin", h: "/market" },
              { l: "aiActions.analyzeProperty", i: "Building2", h: "/properties" },
              { l: "aiActions.createCampaign", i: "Megaphone", h: "/creative" },
              { l: "aiActions.createPost", i: "Sparkles", h: "/creative" },
              { l: "aiActions.openOpportunities", i: "Target", h: "/command" },
            ].map((a) => (
              <Link key={a.l} href={a.h} className="text-ink hover:bg-surface flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold transition-colors">
                <span className="text-brand-strong"><Icon name={a.i} size={15} /></span>{t(a.l)}
              </Link>
            ))}
          </div>
        )}
        <button onClick={() => setFabOpen((v) => !v)} className="zono-ai-gradient zono-focus-ring grid h-14 w-14 place-items-center rounded-full" aria-label={t("aiActions.label")} aria-expanded={fabOpen}>
          <Icon name={fabOpen ? "X" : "Sparkles"} size={24} />
        </button>
      </div>
    </div>
  );
}
