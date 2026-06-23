"use client";

import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { RevealGroup, RevealItem } from "@/components/dashboard/motion";
import type { DashboardHomeData, DashboardKpi, PropertyCard } from "@/lib/dashboard-home/types";
import { ils, type Translate } from "./shared";

/** Quick-action pills shown in the hero (route to existing modules). */
const QUICK_ACTIONS: { l: string; i: string; h: string }[] = [
  { l: "aiActions.findBuyers", i: "Users", h: "/buyers" },
  { l: "aiActions.findSellers", i: "Home", h: "/sellers" },
  { l: "aiActions.createPost", i: "Sparkles", h: "/creative" },
  { l: "aiActions.openOpportunities", i: "Target", h: "/command" },
  { l: "aiActions.createTask", i: "ListChecks", h: "/tasks" },
];

/** Left-side recommended property card (RTL: appears on the left of the hero). */
export function RecommendedPropertyCard({ t, p }: { t: Translate; p: PropertyCard }) {
  return (
    <Link
      href={p.href}
      className="bg-card border-line hover:shadow-[var(--shadow-lift)] flex w-full flex-col overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)] transition-shadow lg:w-80"
    >
      <div className="bg-surface relative aspect-[16/11]">
        {p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
          : <div className="text-muted grid h-full place-items-center"><Icon name="Building2" size={32} /></div>}
        <span className="zono-gradient absolute end-3 top-3 rounded-full px-3 py-1 text-[11px] font-bold text-white">{t("hero.featuredTag")}</span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <p className="text-sm font-extrabold text-white">{p.title}</p>
          <p className="text-[11px] text-white/85">{p.addressLine}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <div className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">
          <span>{p.rooms ?? "—"} {t("property.rooms")}</span><span className="bg-line h-3 w-px" />
          <span>{p.sizeSqm ?? "—"} {t("property.sqm")}</span><span className="bg-line h-3 w-px" />
          <span>{t("property.floor")} {p.floor ?? "—"}</span>
        </div>
        {p.aiInsightKey && (
          <span className="bg-success-soft text-success inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold">
            <Icon name="BadgeCheck" size={11} />{t(p.aiInsightKey)}
          </span>
        )}
        <div className="flex items-center justify-between">
          <p className="text-brand-strong text-xl font-black">{ils(p.price)}</p>
          <span className="bg-brand-soft text-brand-strong rounded-lg px-3 py-1.5 text-[12px] font-bold">{t("hero.featuredCta")}</span>
        </div>
      </div>
    </Link>
  );
}

function KpiCard({ t, k }: { t: Translate; k: DashboardKpi }) {
  const up = k.trend === "up";
  return (
    <RevealItem>
      <div className="bg-card border-line flex h-full flex-col gap-1.5 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between">
          <span className="text-muted text-[11px] font-bold">{t(k.labelKey + ".label")}</span>
          <span className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-xl"><Icon name={k.icon} size={15} /></span>
        </div>
        <span className="text-ink text-2xl font-black">{k.value}</span>
        <div className="flex items-center justify-between gap-1">
          <span className={up ? "text-success inline-flex items-center gap-1 text-xs font-bold" : "text-muted inline-flex items-center gap-1 text-xs font-bold"}>
            <Icon name={up ? "TrendingUp" : "Minus"} size={13} />{k.deltaPct > 0 ? "+" : ""}{k.deltaPct}%
          </span>
          <span className="text-muted truncate text-[10px]">{t(k.hintKey)}</span>
        </div>
      </div>
    </RevealItem>
  );
}

/** KPI strip — 6 equal compact cards directly under the hero. */
export function DashboardKpiStrip({ t, kpis }: { t: Translate; kpis: DashboardKpi[] }) {
  return (
    <RevealGroup className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {kpis.map((k) => <KpiCard key={k.id} t={t} k={k} />)}
    </RevealGroup>
  );
}

/** Hero command center: welcome + search + quick-action pills (right) and the
 *  recommended property card (left). RTL — first child renders on the right. */
export function DashboardHero({ t, data }: { t: Translate; data: DashboardHomeData }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
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
            <span className="truncate text-sm">{t("search.placeholder")}</span>
            <kbd className="bg-surface text-muted ms-auto hidden rounded px-1.5 py-0.5 text-[10px] font-bold sm:inline">⌘K</kbd>
          </button>
          <Link href="/properties/new" className="btn-zono-primary inline-flex h-11 items-center gap-1.5 px-4 text-sm">
            <Icon name="Plus" size={16} />{t("hero.quickAdd")}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.l} href={a.h} className="bg-brand-soft text-brand-strong hover:bg-brand-soft/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors">
              <Icon name={a.i} size={13} />{t(a.l)}
            </Link>
          ))}
        </div>
      </div>
      {data.featuredProperty && <RecommendedPropertyCard t={t} p={data.featuredProperty} />}
    </div>
  );
}
