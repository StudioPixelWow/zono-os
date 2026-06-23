"use client";

import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { sellerPriceLine, sellerContextLine, type SellerInsight } from "@/lib/sellers/insights";
import { NextActionButton, QuickContactIcons } from "./sellerActions";

const COLUMNS = [
  "שם המוכר",
  "סטטוס",
  "נכסים",
  "רמת אמון",
  "סיכון נטישה",
  "עדכון אחרון",
  "פעולה מומלצת",
  "איש קשר",
  "",
];

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

function ScoreBar({ value, tone }: { value: number; tone: "success" | "warning" | "danger" }) {
  const bar = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-danger";
  const text = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="bg-line h-1.5 w-14 overflow-hidden rounded-full">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn("text-xs font-bold tabular-nums", text)}>{value}</span>
    </div>
  );
}

function StatusCell({ insight }: { insight: SellerInsight }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone={insight.isActive ? "success" : "neutral"} size="sm">
        {insight.statusLabel}
      </Badge>
      <span className="text-muted text-[10px]">{insight.stageLabel}</span>
    </div>
  );
}

function ChurnCell({ insight }: { insight: SellerInsight }) {
  return (
    <div className="flex items-center gap-1.5">
      <Badge tone={insight.churnTone} size="sm" leadingDot>{insight.churnLabel}</Badge>
      <span className="text-muted text-[11px] font-bold tabular-nums">{insight.churnRisk}</span>
      {insight.trustTrend !== "flat" && (
        <Icon
          name={insight.trustTrend === "up" ? "TrendingUp" : "TrendingDown"}
          size={13}
          className={insight.trustTrend === "up" ? "text-success" : "text-danger"}
        />
      )}
    </div>
  );
}

function SellerTableRow({
  insight,
  onOpen,
  index,
}: {
  insight: SellerInsight;
  onOpen: () => void;
  index: number;
}) {
  const s = insight.seller;
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
          <Avatar name={s.full_name} urgent={urgent} />
          <div className="min-w-0">
            <p className="text-ink truncate font-extrabold">{s.full_name}</p>
            <p className="text-muted truncate text-xs">{sellerContextLine(s)}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3"><StatusCell insight={insight} /></td>
      <td className="px-3 py-3">
        {insight.propertyCount > 0 ? (
          <Badge tone="brand" size="sm">{insight.propertyCount} נכסים</Badge>
        ) : (
          <span className="text-muted text-xs">ללא נכס</span>
        )}
      </td>
      <td className="px-3 py-3"><ScoreBar value={insight.trustScore} tone={insight.trustTone === "success" ? "success" : insight.trustTone === "warning" ? "warning" : "danger"} /></td>
      <td className="px-3 py-3"><ChurnCell insight={insight} /></td>
      <td className="text-muted px-3 py-3 text-xs whitespace-nowrap">{insight.lastActivityLabel}</td>
      <td className="px-3 py-3"><NextActionButton insight={insight} size="sm" /></td>
      <td className="px-3 py-3"><QuickContactIcons insight={insight} /></td>
      <td className="px-2 py-3">
        <span className="text-muted group-hover:text-brand-strong grid h-8 w-8 place-items-center transition">
          <Icon name="ChevronLeft" size={18} />
        </span>
      </td>
    </motion.tr>
  );
}

function SellerCard({ insight, onOpen }: { insight: SellerInsight; onOpen: () => void }) {
  const s = insight.seller;
  const urgent = insight.urgency >= 70;
  return (
    <div
      onClick={onOpen}
      className="bg-card border-line flex cursor-pointer flex-col gap-3 rounded-[20px] border p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar name={s.full_name} urgent={urgent} />
          <div className="min-w-0">
            <p className="text-ink truncate font-extrabold">{s.full_name}</p>
            <p className="text-muted text-xs">{insight.lastActivityLabel}</p>
          </div>
        </div>
        <Badge tone={insight.churnTone} size="sm">{insight.churnLabel}</Badge>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-brand-strong text-base font-black">{sellerPriceLine(s)}</p>
        {insight.propertyCount > 0 ? (
          <Badge tone="brand" size="sm">{insight.propertyCount} נכסים</Badge>
        ) : (
          <span className="text-muted text-xs">ללא נכס</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-[10px] font-bold">אמון</span>
          <ScoreBar value={insight.trustScore} tone={insight.trustTone === "success" ? "success" : insight.trustTone === "warning" ? "warning" : "danger"} />
        </div>
        <span className="text-muted truncate text-xs">{sellerContextLine(s)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <QuickContactIcons insight={insight} />
        <NextActionButton insight={insight} size="sm" />
      </div>
    </div>
  );
}

export function SellersTable({
  insights,
  onOpen,
  view = "table",
}: {
  insights: SellerInsight[];
  onOpen: (sellerId: string) => void;
  view?: "table" | "cards";
}) {
  if (view === "cards") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map((i) => (
          <SellerCard key={i.seller.id} insight={i} onOpen={() => onOpen(i.seller.id)} />
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
                  <th key={i} className="px-3 py-3 text-start font-bold whitespace-nowrap first:px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {insights.map((i, idx) => (
                <SellerTableRow key={i.seller.id} insight={i} index={idx} onOpen={() => onOpen(i.seller.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {insights.map((i) => (
          <SellerCard key={i.seller.id} insight={i} onOpen={() => onOpen(i.seller.id)} />
        ))}
      </div>
    </>
  );
}
