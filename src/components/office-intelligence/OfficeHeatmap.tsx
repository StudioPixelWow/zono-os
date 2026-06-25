"use client";
import { ZonoMap } from "@/components/maps/ZonoMap";
import type { OfficeMapPoint, MarketShareEstimate } from "@/lib/office-intelligence/types";

export function OfficeHeatmap({ points, marketShare }: { points: OfficeMapPoint[]; marketShare: MarketShareEstimate[] }) {
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 text-sm font-black text-ink">מפת פעילות המשרד</h2>
      <ZonoMap
        points={points.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details, tone: p.tone }))}
        heightClass="h-[340px]"
        emptyMessage="אין נכסים עם מיקום מדויק להצגה כעת."
      />
      {marketShare.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-bold text-ink/55">נתח שוק מוערך לפי עיר <span className="font-medium text-ink/35">(הערכה)</span></p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {marketShare.map((m) => (
              <div key={m.city} className="rounded-xl border border-black/5 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black text-ink">{m.city}</span>
                  <span className="text-[13px] font-black text-brand-strong">{m.sharePercent}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5">
                  <div className="h-full rounded-full bg-brand-strong" style={{ width: `${Math.min(100, m.sharePercent)}%` }} />
                </div>
                <p className="mt-1 text-[10px] font-bold text-ink/40">{m.officeListings} מתוך {m.monitoredListings} · ודאות {m.confidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
