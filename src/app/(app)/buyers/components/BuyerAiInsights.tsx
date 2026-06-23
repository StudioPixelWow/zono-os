"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type { BuyerInsight } from "@/lib/buyers/insights";
import { whatsappNumber } from "./buyerActions";

interface InsightGroup {
  key: string;
  icon: string;
  tone: "brand" | "success" | "warning" | "danger";
  title: string;
  hint: string;
  items: BuyerInsight[];
}

const TONES: Record<InsightGroup["tone"], string> = {
  brand: "bg-brand-soft text-brand-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function BuyerAiInsights({
  insights,
  onOpen,
}: {
  insights: BuyerInsight[];
  onOpen: (buyerId: string) => void;
}) {
  const groups = useMemo<InsightGroup[]>(() => {
    const byUrgency = (a: BuyerInsight, b: BuyerInsight) => b.urgency - a.urgency;
    const defs: InsightGroup[] = [
      {
        key: "intent",
        icon: "TrendingUp",
        tone: "success",
        title: "כוונת רכישה גבוהה",
        hint: "קונים בשלים לדחיפה לסגירה",
        items: insights.filter((i) => i.isCloseToBuy).sort(byUrgency),
      },
      {
        key: "matches",
        icon: "Home",
        tone: "brand",
        title: "תואמים לנכסים קיימים",
        hint: "תקציב והעדפות תואמים למלאי",
        items: insights.filter((i) => i.hasMatches).sort((a, b) => (b.matchCount ?? 0) - (a.matchCount ?? 0)),
      },
      {
        key: "whatsapp",
        icon: "MessageCircle",
        tone: "warning",
        title: "מעקב וואטסאפ להיום",
        hint: "מומלץ ליצור קשר עוד היום",
        items: insights
          .filter((i) => i.needsFollowUp && whatsappNumber(i.buyer.phone))
          .sort(byUrgency),
      },
      {
        key: "inactive",
        icon: "Moon",
        tone: "danger",
        title: "ללא פעילות — סיכון נטישה",
        hint: "לא היה מגע תקופה ארוכה",
        items: insights.filter((i) => i.isInactive).sort(byUrgency),
      },
      {
        key: "financing",
        icon: "Shield",
        tone: "warning",
        title: "סיכון מימון",
        hint: "כדאי לבדוק יכולת מימון",
        items: insights.filter((i) => i.isFinancingRisk).sort(byUrgency),
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
            ZONO סורק את הקונים שלך ומסמן הזדמנויות לפעולה
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
                <li key={i.buyer.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(i.buyer.id)}
                    className="hover:bg-surface flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-right transition"
                  >
                    <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">
                      {i.buyer.full_name}
                    </span>
                    <span className="text-muted shrink-0 text-[11px] font-semibold">
                      {g.key === "matches" ? `${i.matchCount} התאמות` : i.stageLabel}
                    </span>
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
