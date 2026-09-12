// ZONO — Platform · Office Intelligence Data Health. Surfaces whether the
// Office→Agents→Listings pipeline is actually populated, so a repeat of the
// "brokers scanned fine but office relations empty" failure is caught immediately.
// Read-only. Cap: platform.ops.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOfficeIntelligenceHealth } from "@/lib/office-intel/health";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  healthy: "bg-success-soft text-success",
  degraded: "bg-warning-soft text-warning",
  warning: "bg-warning-soft text-warning",
  critical: "bg-danger-soft text-danger",
};
const LABEL: Record<string, string> = { healthy: "תקין", degraded: "מוחלש", warning: "אזהרה", critical: "קריטי" };

export default async function Page() {
  const operator = await authorizePlatform("platform.ops.read");
  if (!operator) return <PlatformDenied />;
  const h = await getOfficeIntelligenceHealth();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="תפעול" title="בריאות נתוני משרדים" description="ניטור צנרת מודיעין המשרדים: קליטת מתווכים ← שיוך משרדים ← קישור מודעות. לוכד מיד מצב של ״מתווכים נסרקו אך יחסי המשרד ריקים״." icon="Activity" />

      {/* Headline alert (pipeline) */}
      <div className={"flex items-start gap-3 rounded-2xl border border-line px-4 py-3.5 " + (h.verdict === "healthy" ? "bg-success-soft/40" : h.verdict === "critical" ? "bg-danger-soft/40" : "bg-warning-soft/40")}>
        <span className={"mt-0.5 shrink-0 " + (TONE[h.verdict] ?? "").split(" ")[1]}><Icon name={h.verdict === "healthy" ? "ShieldCheck" : "AlertTriangle"} size={18} /></span>
        <div className="min-w-0">
          <div className="text-ink text-[14px] font-black">{h.alert ?? (h.verdict === "healthy" ? "צנרת מודיעין המשרדים תקינה" : "צנרת מודיעין המשרדים דורשת תשומת לב")}</div>
          {h.reasons.length > 0 && <div className="text-muted mt-0.5 text-[12px]">{h.reasons.join(" · ")}</div>}
        </div>
        <span className={"ms-auto shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold " + (TONE[h.verdict] ?? "")}>{LABEL[h.verdict]}</span>
      </div>

      {/* Pipeline stages */}
      <PanelCard title="שלבי הצנרת" icon="Route">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {h.pipeline.map((s, i) => (
            <div key={s.key} className="border-line bg-surface relative rounded-xl border p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-muted text-[11px] font-bold">שלב {i + 1}</span>
                <span className={"rounded-md px-2 py-0.5 text-[10.5px] font-bold " + (TONE[s.status] ?? "")}>{LABEL[s.status]}</span>
              </div>
              <div className="text-ink mt-1 text-[14px] font-black">{s.label}</div>
              <div className="text-muted mt-0.5 text-[12px]">{s.detail}</div>
            </div>
          ))}
        </div>
      </PanelCard>

      {/* Metric drilldown */}
      <PanelCard title="פירוט מדדים" icon="ListChecks">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Metric label="מתווכים סה״כ" value={h.agentsTotal} />
          <Metric label="משויכים למשרד" value={h.agentsWithOffice} sub={`${h.officeAssignmentPct}%`} />
          <Metric label="ללא משרד" value={h.agentsWithoutOffice} danger={h.agentsWithoutOffice > 0} />
          <Metric label="משרדים סה״כ" value={h.officesTotal} />
          <Metric label="משרדים עם מתווך" value={h.officesReferencedByAgents} />
          <Metric label="משרדים ללא מתווך" value={h.officesWithoutAgents} />
          <Metric label="משרדים עם מלאי נצפה" value={h.officesWithListings} />
          <Metric label="קישורי מודעה-משרד" value={h.listingLinks} />
        </div>
      </PanelCard>

      <p className="text-muted px-1 text-[11px]">עודכן: {formatPlatformDateTime(h.generatedAt)} · קריאה בלבד, ללא כתיבה.</p>
    </div>
  );
}

function Metric({ label, value, sub, danger }: { label: string; value: number; sub?: string; danger?: boolean }) {
  return (
    <div className="border-line bg-surface rounded-xl border p-3">
      <div className="text-muted text-[10.5px] font-semibold">{label}</div>
      <div className={"mt-0.5 text-xl font-black tabular-nums " + (danger ? "text-danger" : "text-ink")}>{value.toLocaleString("he-IL")}{sub ? <span className="text-muted ms-1 text-[11px] font-bold">{sub}</span> : null}</div>
    </div>
  );
}
