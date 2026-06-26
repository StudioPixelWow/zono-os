"use client";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { Button } from "@/components/ui/Button";
import {
  exportSingleAgencyReportAction, exportCompetitorOverviewAction, exportTerritoryReportAction,
} from "@/lib/agencies/exports/agencyReportExportActions";
import type { ExportResult } from "@/lib/agencies/exports/agencyExportTypes";

type ExportActionResult = { ok: true; data: ExportResult } | { ok: false; error: string };

/** Safe export controls for the Competition Radar (Phase 26.15). Opens the
 *  generated report when available; otherwise surfaces a clear message. */
export function RadarExportButtons({ agencyId, agencyCity }: { agencyId: string | null; agencyCity: string | null }) {
  const runner = useActionRunner();

  const handle = (id: string, label: string, fn: () => Promise<ExportActionResult>) =>
    runner.run(async () => {
      const r = await fn();
      if (!r.ok) throw new Error(r.error);
      if (r.data.fileUrl) { try { window.open(r.data.fileUrl, "_blank", "noopener"); } catch { /* popup blocked */ } }
      if (r.data.status === "failed") throw new Error(r.data.error ?? "הפקת הדוח נכשלה.");
      return r.data.error ?? `${label} הופק בהצלחה.`;
    }, { id, success: (m) => m, refresh: false });

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted text-xs font-semibold">ייצוא דוחות:</span>
        <Button size="sm" variant="secondary" loading={runner.busyId === "agency"} disabled={!agencyId}
          onClick={() => agencyId && handle("agency", "דוח המשרד", () => exportSingleAgencyReportAction(agencyId))}>
          ייצא משרד נבחר
        </Button>
        <Button size="sm" variant="secondary" loading={runner.busyId === "overview"}
          onClick={() => handle("overview", "סקירת המתחרים", () => exportCompetitorOverviewAction({}))}>
          ייצא סקירת מתחרים
        </Button>
        <Button size="sm" variant="secondary" loading={runner.busyId === "territory"} disabled={!agencyCity}
          onClick={() => agencyCity && handle("territory", "דוח האזור", () => exportTerritoryReportAction(agencyCity))}>
          ייצא דוח אזור
        </Button>
      </div>
      {(runner.note || runner.error) && (
        <div className={`rounded-lg border px-3 py-1.5 text-xs ${runner.error ? "border-danger/40 bg-danger-soft/40 text-danger" : "border-success/40 bg-success-soft/40 text-success"}`}>
          {runner.error ?? runner.note}
        </div>
      )}
    </div>
  );
}
