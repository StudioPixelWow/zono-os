"use client";
import { ZonoMap } from "@/components/maps/ZonoMap";
import type { CompetitorMapPoint } from "@/lib/competitor-intelligence/types";

export function CompetitorMarketMap({ points }: { points: CompetitorMapPoint[] }) {
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-black text-ink">מפת שוק מתחרים</h2>
        <div className="flex items-center gap-2 text-[10px] font-bold text-ink/50">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> מתחרה</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> ירידת מחיר</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" /> מודעה</span>
        </div>
      </div>
      <ZonoMap
        points={points.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details, tone: p.tone }))}
        heightClass="h-[360px]"
        emptyMessage="אין מודעות עם מיקום מדויק להצגה כעת — המפה תתמלא ככל שייאספו קואורדינטות."
      />
    </section>
  );
}
