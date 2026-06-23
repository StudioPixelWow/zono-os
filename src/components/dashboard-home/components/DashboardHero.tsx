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

/** Featured property card — the visual centerpiece of the hero. Image-dominant
 *  (~72% height), premium hover (elevation + image zoom + bottom gradient). */
export function RecommendedPropertyCard({ t, p }: { t: Translate; p: PropertyCard }) {
  return (
    <Link
      href={p.href}
      className="group bg-card border-line flex w-full flex-col overflow-hidden rounded-[26px] border shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] lg:min-h-[440px]"
    >
      {/* Image dominates the card (~72% height). */}
      <div className="bg-surface relative h-56 flex-1 overflow-hidden lg:h-auto">
        {p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imageUrl} alt={p.title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          : <div className="text-muted grid h-full place-items-center"><Icon name="Building2" size={40} /></div>}
        <span className="zono-gradient absolute end-4 top-4 rounded-full px-3.5 py-1.5 text-[12px] font-bold text-white shadow-lg">{t("hero.featuredTag")}</span>
        {/* bottom gradient overlay carries title + address over the image */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-4 pt-10">
          <p className="text-base font-black text-white sm:text-lg">{p.title}</p>
          <p className="text-xs text-white/85">{p.addressLine}</p>
        </div>
      </div>
      {/* Compact info strip — minimal white space. */}
      <div className="flex shrink-0 items-center justify-between gap-2 p-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-brand-strong text-2xl font-black leading-none">{ils(p.price)}</p>
          <div className="text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium">
            <span>{p.rooms ?? "—"} {t("property.rooms")}</span><span className="bg-line h-3 w-px" />
            <span>{p.sizeSqm ?? "—"} {t("property.sqm")}</span><span className="bg-line h-3 w-px" />
            <span>{t("property.floor")} {p.floor ?? "—"}</span>
          </div>
        </div>
        <span className="btn-zono-primary inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm">{t("hero.featuredCta")}</span>
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

/** Hero command center — ONE unified module: command center (55%, right in RTL)
 *  + featured property card (45%, left). A soft radial purple glow sits behind
 *  both columns so they read as a single premium surface. */
export function DashboardHero({ t, data }: { t: Translate; data: DashboardHomeData }) {
  return (
    <div className="relative isolate overflow-hidden rounded-[28px]">
      {/* Unifying radial purple glow behind both columns. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(110% 120% at 75% 0%, rgba(124,58,237,0.14) 0%, rgba(168,139,250,0.08) 38%, rgba(248,247,255,0) 70%)" }}
      />
      <div className="grid grid-cols-1 items-center gap-6 p-1 lg:grid-cols-[1.2fr_1fr] lg:gap-10 lg:p-2">
        {/* Command center (right in RTL) — denser, moved up, stronger hierarchy. */}
        <div className="flex flex-col justify-center gap-5 lg:py-2">
          <div className="flex flex-col gap-1">
            <p className="text-muted text-base font-semibold">{t("hero.greeting")}, {data.agentName} 👋</p>
            <h1 className="text-ink text-4xl font-black leading-[1.05] sm:text-5xl lg:text-6xl">{t("hero.title")}</h1>
            <p className="text-muted mt-1 text-lg font-medium sm:text-2xl">{t("hero.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("zono:open-search"))}
              className="bg-card border-line text-muted hover:border-brand-light flex h-16 flex-1 items-center gap-3 rounded-2xl border px-5 text-start shadow-[var(--shadow-card)] transition-colors sm:h-[72px]"
            >
              <Icon name="Search" size={20} />
              <span className="truncate text-base">{t("search.placeholder")}</span>
              <kbd className="bg-surface text-muted ms-auto hidden rounded-lg px-2 py-1 text-xs font-bold sm:inline">⌘K</kbd>
            </button>
            <Link href="/properties/new" className="btn-zono-primary inline-flex h-16 items-center gap-1.5 rounded-2xl px-5 text-sm sm:h-[72px]">
              <Icon name="Plus" size={18} />{t("hero.quickAdd")}
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.l} href={a.h} className="bg-brand-soft text-brand-strong hover:bg-brand-soft/70 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors">
                <Icon name={a.i} size={14} />{t(a.l)}
              </Link>
            ))}
          </div>
        </div>
        {/* Featured property (left in RTL) — the visual centerpiece. */}
        {data.featuredProperty && <RecommendedPropertyCard t={t} p={data.featuredProperty} />}
      </div>
    </div>
  );
}
