"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type {
  CompetitorInsight, MissionTask, SellerIntelligenceItem,
} from "@/lib/dashboard-home/types";
import { ilsC, type Translate } from "./shared";

/* ── A. Hot opportunities (from seller intelligence) ─────────────────────── */
const SELLER_CHIP: Record<SellerIntelligenceItem["bucket"], { key: string; tone: BadgeTone }> = {
  hot: { key: "opportunitiesHot.chip.hot", tone: "success" },
  follow_up: { key: "opportunitiesHot.chip.warm", tone: "warning" },
  at_risk: { key: "opportunitiesHot.chip.watch", tone: "danger" },
  unresponsive: { key: "opportunitiesHot.chip.track", tone: "neutral" },
};

export function OpportunitiesCard({ t, sellers }: { t: Translate; sellers: SellerIntelligenceItem[] }) {
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-base font-black">{t("opportunitiesHot.title")}</h3>
        <Link href="/sellers" className="text-brand-strong text-xs font-bold">{t("hotProperties.viewAll")}</Link>
      </div>
      <div className="divide-line flex flex-col divide-y">
        {sellers.map((s) => {
          const chip = SELLER_CHIP[s.bucket];
          return (
            <Link key={s.id} href={s.href} className="hover:bg-surface flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors">
              <span className="bg-surface grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl">
                {s.propertyImageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.propertyImageUrl} alt="" className="h-full w-full object-cover" />
                  : <Icon name="Building2" size={16} className="text-muted" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-sm font-bold">{s.name}</p>
                <p className="text-muted truncate text-[11px]">{t(s.recommendedActionKey)}</p>
              </div>
              <Badge tone={chip.tone} size="sm">{t(chip.key)}</Badge>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── B. Agent ranking (repurposes competitor data) ───────────────────────── */
// TODO(team): swap to real team-performance ranking from the team intelligence
// service (teamService) once exposed to the home page. Shape-compatible today.
export function AgentRankingCard({ t, agents }: { t: Translate; agents: CompetitorInsight[] }) {
  const ranked = [...agents].sort((a, b) => b.avgPrice - a.avgPrice).slice(0, 5);
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-base font-black">{t("agentRanking.title")}</h3>
        <Link href="/team" className="text-brand-strong text-xs font-bold">{t("agentRanking.viewAll")}</Link>
      </div>
      <div className="flex flex-col gap-1">
        {ranked.map((a, i) => (
          <div key={a.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
            <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black", i === 0 ? "bg-warning-soft text-warning" : "bg-surface text-muted")}>
              {i === 0 ? <Icon name="Star" size={14} /> : i + 1}
            </span>
            <span className="bg-surface grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full">
              {a.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.avatarUrl} alt={a.name} className="h-full w-full object-cover" />
                : <Icon name="Users" size={14} className="text-muted" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-ink truncate text-sm font-bold">{a.name}</p>
              <p className="text-muted truncate text-[11px]">{a.agency}</p>
            </div>
            <span className="text-ink shrink-0 text-sm font-black">{ilsC(a.avgPrice)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── C. AI Mission Control ────────────────────────────────────────────────── */
export function AiMissionControlCard({ t, missions, dealProbabilityPct }: { t: Translate; missions: MissionTask[]; dealProbabilityPct: number }) {
  const [items, setItems] = useState(missions);
  const done = items.filter((m) => m.done).length;
  const progress = Math.round((done / items.length) * 100);
  return (
    <div className="bg-card border-line flex flex-col gap-4 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-ink text-base font-black">AI Mission Control</h3>
      <div className="flex items-center gap-4">
        <div className="relative grid h-24 w-24 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-line)" strokeWidth="10" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-brand)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(progress / 100) * 264} 264`} />
          </svg>
          <span className="text-ink text-xl font-black">{progress}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-ink text-sm font-bold">{t("missionControl.progress")}</p>
          <p className="text-muted mt-1 text-[12px] leading-snug">{t("missionControl.prediction")} · {dealProbabilityPct}%</p>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {items.map((m) => (
          <button key={m.id} onClick={() => setItems((prev) => prev.map((x) => x.id === m.id ? { ...x, done: !x.done } : x))} className="hover:bg-surface flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-start transition-colors">
            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border-2", m.done ? "bg-brand border-brand text-white" : "border-line")}>{m.done && <Icon name="Check" size={12} />}</span>
            <span className={cn("flex-1 text-[13px] font-bold", m.done ? "text-muted line-through" : "text-ink")}>{t(m.labelKey)}</span>
          </button>
        ))}
      </div>
      <Link href="/tasks" className="btn-zono-primary inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm">
        {t("missionControl.openTasks")}
      </Link>
    </div>
  );
}

export function DashboardIntelligenceGrid({
  t, sellers, agents, missions, dealProbabilityPct,
}: {
  t: Translate; sellers: SellerIntelligenceItem[]; agents: CompetitorInsight[]; missions: MissionTask[]; dealProbabilityPct: number;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <OpportunitiesCard t={t} sellers={sellers} />
      <AgentRankingCard t={t} agents={agents} />
      <AiMissionControlCard t={t} missions={missions} dealProbabilityPct={dealProbabilityPct} />
    </section>
  );
}
