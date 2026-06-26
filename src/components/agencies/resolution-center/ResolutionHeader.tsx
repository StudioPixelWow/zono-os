"use client";
import { Button } from "@/components/ui/Button";
import { ResolutionStats } from "./ResolutionStats";
import type { ResolutionKpis } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

/** Title + subtitle + headline KPIs for the AI Review Center. */
export function ResolutionHeader({ kpis, onRefresh, refreshing }: { kpis: ResolutionKpis; onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-extrabold">מרכז אימות AI</h1>
          <p className="text-muted mt-1 text-sm">אשר, תקן ושפר את מנוע המודיעין של ZONO.</p>
        </div>
        <Button variant="ghost" onClick={onRefresh} loading={refreshing}>רענן</Button>
      </div>
      <ResolutionStats kpis={kpis} />
    </div>
  );
}
