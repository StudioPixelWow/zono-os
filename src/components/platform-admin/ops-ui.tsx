// ============================================================================
// ZONO — PLATFORM OPS presentational UI (P5.6). Pure/client-safe. Renders the
// honest ops DTOs: severity chips, queue tables, integration rollups, heartbeat
// classes, alerts. NO server imports, NO event handlers, NO mutation controls
// (P5.6 is read-only — no redrive primitive exists safely).
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import {
  SEVERITY_LABEL, HEARTBEAT_LABEL, INTEGRATION_LABEL,
  type OpsSeverity, type OpsAlert, type QueueSignal, type HeartbeatClass, type IntegrationState,
} from "@/lib/platform-admin/ops/model";

const SEV_TONE: Record<OpsSeverity, string> = {
  critical: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning",
  healthy: "bg-success-soft text-success", unavailable: "bg-surface text-muted",
};

export function SeverityChip({ severity, className }: { severity: OpsSeverity; className?: string }) {
  return <span className={"inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold " + SEV_TONE[severity] + " " + (className ?? "")}>{SEVERITY_LABEL[severity]}</span>;
}

export function SeverityDot({ severity }: { severity: OpsSeverity }) {
  const tone: Record<OpsSeverity, string> = { critical: "bg-danger", warning: "bg-warning", healthy: "bg-success", unavailable: "bg-muted/40" };
  return <span className={"inline-block h-2.5 w-2.5 rounded-full " + tone[severity]} />;
}

/** Big status banner for the ops overview / system-health header. */
export function StatusBanner({ severity, title }: { severity: OpsSeverity; title: string }) {
  const label: Record<OpsSeverity, string> = { critical: "דורש טיפול מיידי", warning: "יש נושאים לתשומת לב", healthy: "המערכת תקינה", unavailable: "מצב לא ידוע" };
  return (
    <div className={"flex items-center gap-3 rounded-2xl border border-line px-5 py-4 " + SEV_TONE[severity]}>
      <SeverityDot severity={severity} />
      <div>
        <div className="text-[15px] font-black">{title}</div>
        <div className="text-[12px] font-semibold opacity-80">{label[severity]}</div>
      </div>
    </div>
  );
}

export function formatAge(ms: number | null): string {
  if (ms === null) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "< דקה";
  if (m < 60) return `${m} ד׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ש׳`;
  return `${Math.floor(h / 24)} ימים`;
}

function CountCell({ n, tone }: { n: number | null; tone?: string }) {
  if (n === null) return <span className="text-muted" title="לא זמין">—</span>;
  return <span className={"tabular-nums font-bold " + (n > 0 ? (tone ?? "text-ink") : "text-muted")}>{n}</span>;
}

export function QueueTable({ queues, severityOf }: { queues: QueueSignal[]; severityOf: (q: QueueSignal) => OpsSeverity }) {
  return (
    <div className="border-line overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-line bg-surface border-b text-[12px]">
            {["", "תת-מערכת", "פעיל", "נכשל", "מכתבים מתים", "ממתין ותיק", "מצב"].map((h, i) => <th key={i} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {queues.map((q) => {
            const sev = severityOf(q);
            return (
              <tr key={q.key} className="border-line border-b last:border-0">
                <td className="px-3 py-2.5"><SeverityDot severity={sev} /></td>
                <td className="text-ink px-3 py-2.5 font-semibold">{q.label}</td>
                <td className="px-3 py-2.5"><CountCell n={q.active} /></td>
                <td className="px-3 py-2.5"><CountCell n={q.failed} tone="text-danger" /></td>
                <td className="px-3 py-2.5"><CountCell n={q.deadLetter} tone="text-danger" /></td>
                <td className="text-muted px-3 py-2.5 text-[12px]">{formatAge(q.oldestPendingAgeMs)}</td>
                <td className="px-3 py-2.5"><SeverityChip severity={sev} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const HB_TONE: Record<HeartbeatClass, string> = { healthy: "bg-success-soft text-success", stale: "bg-warning-soft text-warning", offline: "bg-danger-soft text-danger", unknown: "bg-surface text-muted" };
export function HeartbeatChip({ hb }: { hb: HeartbeatClass }) {
  return <span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + HB_TONE[hb]}>{HEARTBEAT_LABEL[hb]}</span>;
}

const INTEG_TONE: Record<IntegrationState, string> = {
  connected: "text-success", warning: "text-warning", disconnected: "text-danger", not_configured: "text-muted", unavailable: "text-muted",
};
export function IntegrationRollupCard({ label, byState, total }: { label: string; total: number | null; byState: Record<IntegrationState, number> }) {
  const order: IntegrationState[] = ["connected", "warning", "disconnected", "not_configured", "unavailable"];
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <span className="text-ink text-sm font-extrabold">{label}</span>
        <span className="text-muted text-[12px] font-semibold">{total === null ? "לא זמין" : `${total} ארגונים`}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {order.filter((s) => byState[s] > 0 || s === "connected").map((s) => (
          <div key={s} className="border-line bg-surface flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-muted text-[12px] font-semibold">{INTEGRATION_LABEL[s]}</span>
            <span className={"tabular-nums text-[15px] font-black " + INTEG_TONE[s]}>{byState[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AlertList({ alerts }: { alerts: OpsAlert[] }) {
  if (alerts.length === 0) {
    return <p className="text-muted flex items-center gap-2 px-1 py-4 text-[13px] font-semibold"><span className="text-success"><Icon name="Check" size={16} /></span>אין התראות פעילות — כל המדדים תקינים</p>;
  }
  return (
    <ul className="divide-line divide-y">
      {alerts.map((a, i) => (
        <li key={i} className="flex items-start gap-3 px-1 py-2.5">
          <span className={"mt-0.5 rounded-md px-2 py-0.5 text-[11px] font-bold " + (a.severity === "critical" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>{a.severity === "critical" ? "קריטי" : "אזהרה"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-ink text-[13px] font-semibold">{a.subsystem ?? a.source}{a.orgName ? ` · ${a.orgName}` : ""}</div>
            <div className="text-muted text-[12px]">{a.reason}</div>
          </div>
          <span className="text-muted/70 text-[11px]" dir="ltr">{a.source}</span>
        </li>
      ))}
    </ul>
  );
}
