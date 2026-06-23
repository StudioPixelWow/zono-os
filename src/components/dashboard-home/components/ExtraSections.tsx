"use client";

// Preserved feature sections from the previous dashboard that aren't part of the
// new reference's primary layout but must NOT be removed: the property journey
// kanban, seller + buyer intelligence, and competitor AI insights. They render
// below the reference-matched sections.
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type {
  BuyerIntelligenceItem, DashboardHomeData, JourneyStageKey,
  PropertyJourneyItem, SellerIntelligenceItem,
} from "@/lib/dashboard-home/types";
import { SectionHead, TONE_SOFT, ilsC, type Translate } from "./shared";

const STAGES: JourneyStageKey[] = ["draft", "photography", "published", "leads", "tours", "negotiation", "contract", "sold"];

function JourneyCard({ t, item }: { t: Translate; item: PropertyJourneyItem }) {
  const p = item.property;
  return (
    <div className="bg-card border-line flex h-full flex-col gap-2 rounded-2xl border p-2.5 shadow-[var(--shadow-soft)]">
      <div className="bg-surface relative aspect-square w-full overflow-hidden rounded-xl">
        {p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imageUrl} alt={p.title} className="absolute inset-0 h-full w-full object-cover object-center" />
          : <div className="text-muted absolute inset-0 grid place-items-center"><Icon name="Image" size={20} /></div>}
        {item.alertKey && item.alertTone && <span className={cn("absolute end-2 top-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold", TONE_SOFT[item.alertTone])}>{t(item.alertKey)}</span>}
      </div>
      <p className="text-ink truncate text-xs font-bold">{p.title}</p>
      <p className="text-brand-strong text-[12px] font-black">{ilsC(p.price)}</p>
      <div className="bg-surface rounded-lg px-2 py-1.5">
        <p className="text-muted text-[9px] font-bold">{t("journey.nextAction")}</p>
        <p className="text-ink truncate text-[11px] font-bold">{t(item.nextActionKey)}</p>
      </div>
    </div>
  );
}

export function PropertyJourneySection({ t, journey }: { t: Translate; journey: PropertyJourneyItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("journey.title")} action={<Link href="/properties" className="text-brand-strong text-sm font-bold">{t("journey.viewAll")}</Link>} />
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const items = journey.filter((j) => j.stage === stage);
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
  );
}

function SellerCard({ t, s }: { t: Translate; s: SellerIntelligenceItem }) {
  return (
    <Link href={s.href} className="bg-card border-line flex gap-3 rounded-2xl border p-3 shadow-[var(--shadow-soft)]">
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
  );
}

function BuyerCard({ t, b }: { t: Translate; b: BuyerIntelligenceItem }) {
  return (
    <Link href={b.href} className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-3 shadow-[var(--shadow-soft)]">
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
  );
}

export function SellerBuyerIntelligence({ t, data }: { t: Translate; data: DashboardHomeData }) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <SectionHead title={t("sellerIntel.title")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.sellers.map((s) => <SellerCard key={s.id} t={t} s={s} />)}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <SectionHead title={t("buyerIntel.title")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.buyers.map((b) => <BuyerCard key={b.id} t={t} b={b} />)}
        </div>
      </div>
    </section>
  );
}

export function CompetitorInsightsCard({ t, insightKeys }: { t: Translate; insightKeys: string[] }) {
  if (!insightKeys.length) return null;
  return (
    <section className="bg-card border-line flex flex-col gap-2 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-base font-black">{t("competitors.insightsTitle")}</h3>
        <Link href="/competitors" className="text-brand-strong text-xs font-bold">{t("competitors.viewAll")}</Link>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {insightKeys.map((k) => (
          <div key={k} className="bg-surface flex items-start gap-2 rounded-xl p-3">
            <Icon name="Sparkles" size={15} className="text-brand-strong mt-0.5 shrink-0" />
            <p className="text-ink text-sm">{t(k)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
