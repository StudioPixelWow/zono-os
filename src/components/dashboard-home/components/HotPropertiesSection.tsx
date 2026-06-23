"use client";

import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { PropertyCard } from "@/lib/dashboard-home/types";
import { SectionHead, ils, type Translate } from "./shared";

export function HotPropertyCard({ t, p }: { t: Translate; p: PropertyCard }) {
  const badgeTone: BadgeTone =
    p.badgeKey === "badge.price_drop" ? "danger" : p.badgeKey === "badge.exclusive" ? "brand" : p.badgeKey === "badge.hot" ? "warning" : "success";
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
        <Link href={p.href} className="bg-brand-soft text-brand-strong mt-auto rounded-lg px-3 py-2 text-center text-[13px] font-bold">{t("property.details")}</Link>
      </div>
    </div>
  );
}

export function HotPropertiesSection({ t, properties }: { t: Translate; properties: PropertyCard[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("hotProperties.title")} action={<Link href="/properties" className="text-brand-strong text-sm font-bold">{t("hotProperties.viewAll")}</Link>} />
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
        {properties.map((p) => <HotPropertyCard key={p.id} t={t} p={p} />)}
      </div>
    </section>
  );
}
