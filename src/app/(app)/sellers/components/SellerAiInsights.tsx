"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type { SellerInsight } from "@/lib/sellers/insights";
import { whatsappNumber } from "./sellerActions";

interface InsightGroup {
  key: string;
  icon: string;
  tone: "brand" | "success" | "warning" | "danger";
  title: string;
  hint: string;
  metric: (i: SellerInsight) => string;
  items: SellerInsight[];
}

const TONES: Record<InsightGroup["tone"], string> = {
  brand: "bg-brand-soft text-brand-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function SellerAiInsights({
  insights,
  onOpen,
}: {
  insights: SellerInsight[];
  onOpen: (sellerId: string) => void;
}) {
  const groups = useMemo<InsightGroup[]>(() => {
    const byUrgency = (a: SellerInsight, b: SellerInsight) => b.urgency - a.urgency;
    const defs: InsightGroup[] = [
      {
        key: "opportunity",
        icon: "TrendingUp",
        tone: "success",
        title: "הזדמנויות לקידום",
        hint: "מוכרים בשלים לדחיפה קדימה",
        metric: (i) => i.stageLabel,
        items: insights.filter((i) => i.isNearOpportunity).sort(byUrgency),
      },
      {
        key: "churn",
        icon: "TrendingDown",
        tone: "danger",
        title: "סיכון נטישה גבוה",
        hint: "נדרש חיזוק קשר מיידי",
        metric: (i) => `${i.churnRisk} סיכון`,
        items: insights.filter((i) => i.isHighChurn).sort((a, b) => b.churnRisk - a.churnRisk),
      },
      {
        key: "trust",
        icon: "Shield",
        tone: "warning",
        title: "אמון נמוך או יורד",
        hint: "מומלץ לחזק את היחסים",
        metric: (i) => `${i.trustScore} אמון`,
        items: insights.filter((i) => i.isLowTrust || i.isTrustDrop).sort((a, b) => a.trustScore - b.trustScore),
      },
      {
        key: "whatsapp",
        icon: "MessageCircle",
        tone: "warning",
        title: "מעקב וואטסאפ להיום",
        hint: "מומלץ ליצור קשר עוד היום",
        metric: (i) => i.lastActivityLabel,
        items: insights.filter((i) => i.needsTreatment && whatsappNumber(i.seller.phone)).sort(byUrgency),
      },
      {
        key: "nocontact",
        icon: "Moon",
        tone: "danger",
        title: "ללא קשר תקופה ארוכה",
        hint: "סיכון להתקררות הקשר",
        metric: (i) => i.lastActivityLabel,
        items: insights.filter((i) => i.isNoContact).sort(byUrgency),
      },
    ];
    return defs.filter((g) => g.items.length > 0);
  }, [insights]);

  if (groups.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]"
    >
      <div className="zono-ai-gradient flex items-center gap-2.5 px-5 py-4 text-white">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20">
          <Icon name="Sparkles" size={18} />
        </span>
        <div>
          <h2 className="text-base font-black">זיהוי הזדמנויות AI</h2>
          <p className="text-xs font-medium text-white/85">
            ZONO סורק את המוכרים שלך ומסמן הזדמנויות וסיכונים לפעולה
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.key} className="bg-card flex flex-col gap-2.5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn("grid h-8 w-8 place-items-center rounded-lg", TONES[g.tone])}>
                  <Icon name={g.icon} size={16} />
                </span>
                <div>
                  <p className="text-ink text-sm font-extrabold">{g.title}</p>
                  <p className="text-muted text-[11px]">{g.hint}</p>
                </div>
              </div>
              <span className="text-ink text-xl font-black tabular-nums">{g.items.length}</span>
            </div>
            <ul className="flex flex-col gap-1">
              {g.items.slice(0, 3).map((i) => (
                <li key={i.seller.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(i.seller.id)}
                    className="hover:bg-surface flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-right transition"
                  >
                    <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">
                      {i.seller.full_name}
                    </span>
                    <span className="text-muted shrink-0 text-[11px] font-semibold">{g.metric(i)}</span>
                  </button>
                </li>
              ))}
              {g.items.length > 3 && (
                <li className="text-muted px-2 pt-0.5 text-[11px] font-semibold">
                  ועוד {g.items.length - 3}…
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
