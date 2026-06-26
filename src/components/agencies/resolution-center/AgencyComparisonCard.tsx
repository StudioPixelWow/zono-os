import { Card } from "@/components/ui/Card";
import type { AgencyLite } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

const Row = ({ label, a, b }: { label: string; a: string; b: string }) => (
  <div className="grid grid-cols-3 gap-2 border-b border-line/60 py-1.5 text-xs last:border-0">
    <span className="text-muted">{label}</span>
    <span className="text-ink truncate font-semibold">{a || "—"}</span>
    <span className="text-ink truncate font-semibold">{b || "—"}</span>
  </div>
);

/** Side-by-side comparison: detected candidate vs the matched agency. */
export function AgencyComparisonCard({ detectedName, normalized, agency }: { detectedName: string; normalized: string; agency: AgencyLite | null }) {
  return (
    <Card padding="sm">
      <div className="grid grid-cols-3 gap-2 pb-2 text-[11px] font-bold text-muted">
        <span>שדה</span><span>זוהה</span><span>משרד מותאם</span>
      </div>
      <Row label="שם" a={detectedName} b={agency?.name ?? ""} />
      <Row label="מנורמל" a={normalized} b={agency?.displayName ?? ""} />
      <Row label="עיר" a="—" b={agency?.city ?? ""} />
      <Row label="אתר" a="—" b={agency?.website ?? ""} />
      <Row label="טלפון" a="—" b={agency?.phone ?? ""} />
      <Row label="נכסים" a="—" b={agency?.propertyCount != null ? String(agency.propertyCount) : ""} />
      <Row label="מתווכים" a="—" b={agency?.agentCount != null ? String(agency.agentCount) : ""} />
    </Card>
  );
}
