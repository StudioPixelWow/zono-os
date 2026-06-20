"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { createAcquisitionTaskFromAlertAction, setRadarAlertStatusAction } from "@/lib/transactions/actions";
import type { RadarBoard } from "@/lib/transactions/service";

const TYPE_LABEL: Record<string, string> = { below_market: "מתחת לשוק", above_market: "מעל השוק", fair_market: "מחיר הוגן", price_drop: "ירידת מחיר", hot_street: "רחוב חם", needs_review: "לבדיקה", not_enough_data: "אין מספיק דאטה" };
const TYPE_TONE: Record<string, string> = { below_market: "text-success", above_market: "text-danger", hot_street: "text-brand-strong", needs_review: "text-warning", fair_market: "text-muted", price_drop: "text-success", not_enough_data: "text-muted" };
const STATUS_LABEL: Record<string, string> = { new: "חדש", reviewing: "בבדיקה", sent_to_client: "נשלח ללקוח", not_relevant: "לא רלוונטי", closed: "סגור" };
const fmtGap = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}%`);

export function RadarView({ board }: { board: RadarBoard }) {
  const router = useRouter();
  const { alerts, counts } = board;
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => { setError(null); start(async () => { try { await fn(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "שגיאה"); } }); };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Transactions · Radar</p>
          <h1 className="text-ink mt-1 text-2xl font-black">רדאר הזדמנויות</h1>
          <p className="text-muted mt-1 text-sm">הזדמנויות מתחת/מעל לשוק ורחובות חמים — מבוססות אך ורק על עסקאות אמת. ללא נתונים מומצאים.</p>
        </div>
        <Link href="/transactions" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />עסקאות</Link>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="מתחת לשוק" value={counts.below_market ?? 0} icon="ArrowUpRight" tone="text-success" />
        <Stat label="מעל השוק" value={counts.above_market ?? 0} icon="AlertTriangle" tone="text-danger" />
        <Stat label="רחובות חמים" value={counts.hot_street ?? 0} icon="Flame" tone="text-brand-strong" />
        <Stat label="לבדיקה" value={counts.needs_review ?? 0} icon="Filter" tone="text-warning" />
      </div>

      {alerts.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Flame" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין התראות הזדמנות</p>
          <p className="text-muted max-w-sm text-sm">הרץ ״מחקר עסקאות״ על נכס/מודעה — אם המחיר מתחת/מעל לשוק לפי עסקאות אמת, תיווצר כאן התראה.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {alerts.map((a) => (
            <div key={a.id} className="bg-card border-line flex flex-col gap-2 rounded-[18px] border p-3 shadow-[var(--shadow-soft)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-extrabold">{a.address ?? a.city_name ?? "נכס"}</p>
                  <p className="text-muted text-[11px]">{a.city_name}{a.neighborhood_name ? ` · ${a.neighborhood_name}` : ""} · {STATUS_LABEL[a.status] ?? a.status}</p>
                </div>
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black", TYPE_TONE[a.opportunity_type] ?? "text-muted")}>{TYPE_LABEL[a.opportunity_type] ?? a.opportunity_type}</span>
              </div>
              <div className="text-muted flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                {a.asking_price && <span>מבוקש {formatShekels(a.asking_price)}</span>}
                {a.estimated_market_value && <span>שווי {formatShekels(a.estimated_market_value)}</span>}
                <span>פער {fmtGap(a.gap_from_market_percent)}</span>
                <span>ציון {Math.round(a.opportunity_score)}</span>
                <span>ביטחון {Math.round(a.confidence_score)}</span>
              </div>
              {a.reason_hebrew && <p className="text-ink text-[11px]">{a.reason_hebrew}</p>}
              {a.recommended_action_hebrew && <p className="text-brand-strong text-[11px] font-bold">→ {a.recommended_action_hebrew}</p>}
              <div className="mt-1 flex flex-wrap gap-2">
                <button className="text-brand-strong text-[11px] font-bold" disabled={pending} onClick={() => run(() => createAcquisitionTaskFromAlertAction(a.id))}>צור משימת גיוס</button>
                <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => run(() => setRadarAlertStatusAction(a.id, "sent_to_client"))}>נשלח ללקוח</button>
                <button className="text-muted text-[11px] font-bold" disabled={pending} onClick={() => run(() => setRadarAlertStatusAction(a.id, "reviewing"))}>סמן בבדיקה</button>
                <button className="text-danger text-[11px] font-bold" disabled={pending} onClick={() => run(() => setRadarAlertStatusAction(a.id, "not_relevant"))}>לא רלוונטי</button>
                {a.property_listing_id && <Link href={`/properties/${a.property_listing_id}`} className="text-muted text-[11px] font-bold">נכס ↗</Link>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: number; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
