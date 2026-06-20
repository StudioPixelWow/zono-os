"use client";

/**
 * Reusable "מחקר עסקאות" panel — research any property against real sold
 * transactions. Used on the property page, external-listing detail and the
 * acquisition drawer. Deterministic; shows only real comparable transactions.
 */
import { useState, useTransition } from "react";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { detectOpportunityAction, researchPropertyAction } from "@/lib/transactions/actions";
import type { ResearchResult } from "@/lib/transactions/engine";

interface Props {
  propertyListingId?: string | null;
  externalListingId?: string | null;
  acquisitionProfileId?: string | null;
  cityName: string | null;
  neighborhoodName?: string | null;
  address?: string | null;
  rooms?: number | null;
  area?: number | null;
  askingPrice?: number | null;
}

const LEVEL_LABEL: Record<string, string> = { high: "גבוהה", medium: "בינונית", low: "נמוכה", insufficient: "לא מספקת" };
const LEVEL_TONE: Record<string, string> = { high: "text-success", medium: "text-brand-strong", low: "text-warning", insufficient: "text-muted" };
const fmt = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("he-IL"));
const fmtGap = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}%`);

export function TransactionResearchPanel(props: Props) {
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const input = {
    propertyListingId: props.propertyListingId ?? null,
    externalListingId: props.externalListingId ?? null,
    acquisitionProfileId: props.acquisitionProfileId ?? null,
    cityName: props.cityName,
    neighborhoodName: props.neighborhoodName ?? null,
    normalizedAddress: props.address ?? null,
    street: props.address ?? null,
    rooms: props.rooms ?? null,
    area: props.area ?? null,
    askingPrice: props.askingPrice ?? null,
  };

  const research = () => { setError(null); setAlertMsg(null); start(async () => { try { const r = await researchPropertyAction(input, true); setResult(r.result); } catch (e) { setError(e instanceof Error ? e.message : "שגיאה"); } }); };
  const createAlert = () => { setError(null); start(async () => { try { const r = await detectOpportunityAction(input); setAlertMsg(r.alertId ? "נוצרה התראת הזדמנות ברדאר ✓" : "אין הזדמנות מובהקת מספיק להתראה."); } catch (e) { setError(e instanceof Error ? e.message : "שגיאה"); } }); };

  const gapTone = result?.gapFromMarketPercent == null ? "text-muted" : result.gapFromMarketPercent <= -5 ? "text-success" : result.gapFromMarketPercent >= 8 ? "text-danger" : "text-muted";

  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name="BarChart3" size={14} /></span>
          <p className="text-ink text-sm font-extrabold">מחקר עסקאות</p>
        </div>
        <button onClick={research} disabled={pending || !props.cityName} className="text-brand-strong text-xs font-bold disabled:opacity-50">{pending ? "מחשב…" : "חשב מחקר עסקאות"}</button>
      </div>
      {!props.cityName && <p className="text-muted text-[11px]">חסרה עיר לנכס — לא ניתן לחשב מחקר.</p>}
      {error && <p className="bg-danger-soft text-danger rounded-lg px-2 py-1 text-[11px] font-semibold">{error}</p>}
      {alertMsg && <p className="bg-success-soft text-success rounded-lg px-2 py-1 text-[11px] font-semibold">{alertMsg}</p>}

      {result && (
        <div className="flex flex-col gap-3">
          {result.confidenceLevel === "insufficient" ? (
            <p className="text-muted text-sm">{result.explanationHebrew}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Cell label="מחיר מבוקש" value={props.askingPrice ? formatShekels(props.askingPrice) : "—"} />
                <Cell label="שווי שוק משוער" value={result.estimatedMarketValue ? formatShekels(result.estimatedMarketValue) : "—"} tone="text-success" />
                <Cell label="פער מהשוק" value={fmtGap(result.gapFromMarketPercent)} tone={gapTone} />
                <Cell label="₪/מ״ר מבוקש" value={fmt(result.askingPpsqm)} />
                <Cell label="₪/מ״ר ממוצע" value={fmt(result.avgPpsqm)} />
                <Cell label="₪/מ״ר חציון" value={fmt(result.medianPpsqm)} tone="text-brand-strong" />
              </div>
              <p className="text-ink text-[11px]">{result.explanationHebrew}</p>
              <p className="text-[11px]">רמת ביטחון: <span className={cn("font-black", LEVEL_TONE[result.confidenceLevel])}>{LEVEL_LABEL[result.confidenceLevel]}</span> · {result.comparables.length} עסקאות דומות</p>
              {result.comparables.length > 0 && (
                <div className="border-line overflow-x-auto rounded-xl border">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-surface text-muted font-bold"><tr>{["תאריך", "כתובת", "מחיר", "מ״ר", "₪/מ״ר", "חדרים"].map((h) => <th key={h} className="px-2 py-1.5 whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {result.comparables.slice(0, 8).map((c) => (
                        <tr key={c.id} className="border-line border-t">
                          <td className="text-muted px-2 py-1 whitespace-nowrap">{c.deal_date ? new Date(c.deal_date).toLocaleDateString("he-IL", { month: "2-digit", year: "2-digit" }) : "—"}</td>
                          <td className="text-ink px-2 py-1">{c.address ?? c.normalized_address ?? "—"}</td>
                          <td className="text-ink px-2 py-1 whitespace-nowrap">{c.deal_amount ? formatShekels(c.deal_amount) : "—"}</td>
                          <td className="text-muted px-2 py-1">{c.area ?? "—"}</td>
                          <td className="text-brand-strong px-2 py-1 font-bold">{fmt(c.price_per_sqm)}</td>
                          <td className="text-muted px-2 py-1">{c.rooms ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.gapFromMarketPercent != null && result.gapFromMarketPercent <= -5 && (
                <button onClick={createAlert} disabled={pending} className="text-brand-strong self-start text-xs font-bold">צור התראת הזדמנות →</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-surface rounded-lg p-2">
      <p className="text-muted text-[10px] font-bold">{label}</p>
      <p className={cn("text-sm font-black", tone)}>{value}</p>
    </div>
  );
}
