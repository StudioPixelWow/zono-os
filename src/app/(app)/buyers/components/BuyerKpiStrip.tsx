"use client";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { motion } from "framer-motion";
import type { BuyerKpis } from "@/lib/buyers/insights";

export type KpiKey =
  | "new"
  | "followUp"
  | "closeToBuy"
  | "financingRisk"
  | "inactive"
  | "withMatches";

interface KpiDef {
  key: KpiKey;
  label: string;
  hint: string;
  icon: string;
  tone: "brand" | "danger" | "success" | "warning" | "accent";
  value: (k: BuyerKpis) => number;
}

const TONES: Record<KpiDef["tone"], { icon: string; value: string }> = {
  brand: { icon: "bg-brand-soft text-brand", value: "text-brand-strong" },
  danger: { icon: "bg-danger-soft text-danger", value: "text-danger" },
  success: { icon: "bg-success-soft text-success", value: "text-success" },
  warning: { icon: "bg-warning-soft text-warning", value: "text-warning" },
  accent: { icon: "bg-sky-100 text-sky-700", value: "text-sky-700" },
};

const DEFS: KpiDef[] = [
  { key: "new", label: "קונים חדשים", hint: "ב-30 הימים האחרונים", icon: "UserPlus", tone: "brand", value: (k) => k.newThisMonth },
  { key: "followUp", label: "דורשים מעקב", hint: "חמים/פושרים ללא קשר", icon: "Clock", tone: "danger", value: (k) => k.followUp },
  { key: "closeToBuy", label: "קרובים לרכישה", hint: "תקציב וכיוון ברורים", icon: "TrendingUp", tone: "success", value: (k) => k.closeToBuy },
  { key: "financingRisk", label: "סיכוני מימון", hint: "כדאי לבדוק יכולת", icon: "Shield", tone: "warning", value: (k) => k.financingRisk },
  { key: "inactive", label: "ללא פעילות", hint: "מעל 30 יום", icon: "Moon", tone: "accent", value: (k) => k.inactive },
  { key: "withMatches", label: "התאמות זמינות", hint: "נכסים מתאימים בקטלוג", icon: "Home", tone: "brand", value: (k) => k.withMatches },
];

export function BuyerKpiStrip({
  kpis,
  active,
  onSelect,
}: {
  kpis: BuyerKpis;
  active: KpiKey | null;
  onSelect: (key: KpiKey) => void;
}) {
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6">
      {DEFS.map((d, i) => {
        const t = TONES[d.tone];
        const isActive = active === d.key;
        return (
          <motion.button
            key={d.key}
            type="button"
            onClick={() => onSelect(d.key)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 }}
            className={cn(
              "bg-card flex min-w-[150px] shrink-0 flex-col gap-2 rounded-[20px] border p-3.5 text-right transition-all sm:min-w-0",
              isActive
                ? "border-brand-light shadow-[var(--shadow-lift)] ring-brand/20 ring-2"
                : "border-line hover:border-brand-light/60 shadow-[var(--shadow-card)]",
            )}
            aria-pressed={isActive}
          >
            <div className="flex items-center justify-between">
              <span className={cn("grid h-9 w-9 place-items-center rounded-xl", t.icon)}>
                <Icon name={d.icon} size={18} />
              </span>
              <span className={cn("text-3xl font-black tabular-nums", t.value)}>{d.value(kpis)}</span>
            </div>
            <div>
              <p className="text-ink text-sm font-extrabold">{d.label}</p>
              <p className="text-muted text-[11px] font-medium">{d.hint}</p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
