"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type { AttentionItem } from "@/lib/dashboard-home/types";
import { ATTENTION_SOFT, ATTENTION_DOT, EmptyState, SectionHead, type Translate } from "./shared";

export function AttentionCard({ t, item, index }: { t: Translate; item: AttentionItem; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: index * 0.05 }}
      className="bg-card border-line flex min-w-[230px] shrink-0 flex-col gap-2.5 rounded-[20px] border p-4 shadow-[var(--shadow-card)] lg:min-w-0"
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", ATTENTION_DOT[item.tone])} />
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black", ATTENTION_SOFT[item.tone])}>{t(item.titleKey)}</span>
      </div>
      <div>
        <p className="text-ink text-sm font-extrabold">{item.name}</p>
        {item.phone && <p className="text-muted text-[11px] font-medium" dir="ltr">{item.phone}</p>}
      </div>
      <p className="text-muted text-xs">{item.propertyContext}</p>
      <p className="text-ink text-[12px] font-semibold leading-snug">{t(item.reasonKey)}</p>
      <p className="text-muted text-[11px]">{item.daysSince} {t("todayAttention.daysAgo")}</p>
      <Link
        href={item.href}
        className="bg-brand-soft text-brand-strong hover:bg-brand-soft/70 mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold transition-colors"
      >
        <Icon name={item.ctaIcon} size={14} />{t(item.ctaKey)}
      </Link>
    </motion.div>
  );
}

/** "מה דורש טיפול היום?" — horizontal row of attention cards. */
export function TodayAttentionSection({ t, items }: { t: Translate; items: AttentionItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("todayAttention.title")} />
      <p className="text-muted -mt-1 text-sm">{t("todayAttention.subtitle")}</p>
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {items.map((item, i) => <AttentionCard key={item.id} t={t} item={item} index={i} />)}
        </div>
      )}
    </section>
  );
}
