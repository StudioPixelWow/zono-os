"use client";

import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { TEMPERATURE_LABELS, TEMPERATURE_TONES } from "@/lib/buyers/labels";
import {
  buyerBudgetLine,
  buyerInterestLine,
  type BuyerInsight,
  type FinancingRisk,
} from "@/lib/buyers/insights";
import { NextActionButton, QuickContactIcons } from "./buyerActions";

const COLUMNS = [
  "שם הקונה",
  "סטטוס",
  "תחום עניין",
  "תקציב",
  "התאמות",
  "שלב בתהליך",
  "איש קשר",
  "פעולה הבאה",
  "עודכן לאחרונה",
  "",
];

const FINANCING_DOT: Record<FinancingRisk, { tone: string; label: string }> = {
  high: { tone: "bg-danger", label: "סיכון מימון גבוה" },
  medium: { tone: "bg-warning", label: "סיכון מימון בינוני" },
  low: { tone: "bg-success", label: "מימון תקין" },
  unknown: { tone: "bg-line", label: "מימון לא ידוע" },
};

function Avatar({ name, urgent }: { name: string; urgent: boolean }) {
  return (
    <span
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black",
        urgent ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-strong",
      )}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

function MatchCell({ insight }: { insight: BuyerInsight }) {
  if (insight.matchCount == null)
    return <span className="text-muted text-xs">טרם חושב</span>;
  if (insight.matchCount === 0)
    return <span className="text-muted text-xs">אין התאמות</span>;
  return (
    <Badge tone="brand" size="sm" leadingDot>
      {insight.matchCount} נכסים
    </Badge>
  );
}

function StatusCell({ insight }: { insight: BuyerInsight }) {
  const b = insight.buyer;
  const fin = FINANCING_DOT[insight.financingRisk];
  return (
    <div className="flex flex-col items-start gap-1">
      {b.temperature ? (
        <Badge tone={TEMPERATURE_TONES[b.temperature]} size="sm">
          {TEMPERATURE_LABELS[b.temperature]}
        </Badge>
      ) : (
        <span className="text-muted text-xs">—</span>
      )}
      <span className="text-muted flex items-center gap-1 text-[10px]" title={fin.label}>
        <span className={cn("h-1.5 w-1.5 rounded-full", fin.tone)} />
        {fin.label}
      </span>
    </div>
  );
}

/** Desktop table row. */
function BuyerTableRow({
  insight,
  onOpen,
  index,
}: {
  insight: BuyerInsight;
  onOpen: () => void;
  index: number;
}) {
  const b = insight.buyer;
  const urgent = insight.urgency >= 70;
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.015, 0.3) }}
      onClick={onOpen}
      className="border-line hover:bg-surface group cursor-pointer border-b transition-colors last:border-0"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={b.full_name} urgent={urgent} />
          <div className="min-w-0">
            <p className="text-ink truncate font-extrabold">{b.full_name}</p>
            <p className="text-muted truncate text-xs">{b.phone ?? b.email ?? "ללא פרטי קשר"}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3"><StatusCell insight={insight} /></td>
      <td className="px-3 py-3">
        <p className="text-ink max-w-[180px] truncate text-sm">{buyerInterestLine(b)}</p>
      </td>
      <td className="text-ink px-3 py-3 font-bold whitespace-nowrap">{buyerBudgetLine(b)}</td>
      <td className="px-3 py-3"><MatchCell insight={insight} /></td>
      <td className="px-3 py-3">
        <span className="text-muted text-sm">{insight.stageLabel}</span>
      </td>
      <td className="px-3 py-3"><QuickContactIcons insight={insight} /></td>
      <td className="px-3 py-3"><NextActionButton insight={insight} size="sm" /></td>
      <td className="text-muted px-3 py-3 text-xs whitespace-nowrap">{insight.lastActivityLabel}</td>
      <td className="px-2 py-3">
        <span className="text-muted group-hover:text-brand-strong grid h-8 w-8 place-items-center transition">
          <Icon name="ChevronLeft" size={18} />
        </span>
      </td>
    </motion.tr>
  );
}

/** Mobile card (table collapses to this under lg). */
function BuyerCard({ insight, onOpen }: { insight: BuyerInsight; onOpen: () => void }) {
  const b = insight.buyer;
  const urgent = insight.urgency >= 70;
  return (
    <div
      onClick={onOpen}
      className="bg-card border-line flex cursor-pointer flex-col gap-3 rounded-[20px] border p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar name={b.full_name} urgent={urgent} />
          <div className="min-w-0">
            <p className="text-ink truncate font-extrabold">{b.full_name}</p>
            <p className="text-muted text-xs">{insight.lastActivityLabel}</p>
          </div>
        </div>
        {b.temperature && (
          <Badge tone={TEMPERATURE_TONES[b.temperature]} size="sm">
            {TEMPERATURE_LABELS[b.temperature]}
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-brand-strong text-base font-black">{buyerBudgetLine(b)}</p>
        <MatchCell insight={insight} />
      </div>
      <p className="text-muted truncate text-xs">{buyerInterestLine(b)}</p>
      <div className="flex items-center justify-between gap-2">
        <QuickContactIcons insight={insight} />
        <NextActionButton insight={insight} size="sm" />
      </div>
    </div>
  );
}

export function BuyersTable({
  insights,
  onOpen,
  view = "table",
}: {
  insights: BuyerInsight[];
  onOpen: (buyerId: string) => void;
  view?: "table" | "cards";
}) {
  if (view === "cards") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map((i) => (
          <BuyerCard key={i.buyer.id} insight={i} onOpen={() => onOpen(i.buyer.id)} />
        ))}
      </div>
    );
  }
  return (
    <>
      {/* Desktop table */}
      <div className="bg-card border-line hidden overflow-hidden rounded-[20px] border shadow-[var(--shadow-card)] lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-start text-sm">
            <thead className="text-muted border-line bg-surface/60 border-b text-xs">
              <tr>
                {COLUMNS.map((h, i) => (
                  <th key={i} className="px-3 py-3 text-start font-bold whitespace-nowrap first:px-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {insights.map((i, idx) => (
                <BuyerTableRow key={i.buyer.id} insight={i} index={idx} onOpen={() => onOpen(i.buyer.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {insights.map((i) => (
          <BuyerCard key={i.buyer.id} insight={i} onOpen={() => onOpen(i.buyer.id)} />
        ))}
      </div>
    </>
  );
}
