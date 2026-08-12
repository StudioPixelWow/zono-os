// ============================================================================
// ZONO — PLATFORM SUPPORT presentational UI (P5.7). Pure/client-safe. Status &
// priority chips, ticket table, note items, empty states. NO server imports,
// NO mutation logic (interactive controls live in the client control components).
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import {
  STATUS_LABEL, PRIORITY_LABEL, CATEGORY_LABEL,
  type TicketStatus, type TicketPriority,
} from "@/lib/platform-admin/support/model";
import { formatPlatformDateTime } from "@/components/platform-admin/ui";

const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-info-soft text-info", in_progress: "bg-brand-soft text-brand",
  waiting_customer: "bg-warning-soft text-warning", resolved: "bg-success-soft text-success", closed: "bg-surface text-muted",
};
export function StatusChip({ status }: { status: TicketStatus }) {
  return <span className={"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold " + STATUS_TONE[status]}>{STATUS_LABEL[status]}</span>;
}

const PRIORITY_TONE: Record<TicketPriority, string> = {
  low: "bg-surface text-muted", normal: "bg-surface text-ink", high: "bg-warning-soft text-warning", urgent: "bg-danger-soft text-danger",
};
export function PriorityChip({ priority }: { priority: TicketPriority }) {
  return <span className={"inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold " + PRIORITY_TONE[priority]}>{priority === "urgent" ? <Icon name="AlertTriangle" size={11} /> : null}{PRIORITY_LABEL[priority]}</span>;
}

export function ageOf(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const ms = Date.now() - t;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} ד׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ש׳`;
  return `${Math.floor(h / 24)} ימים`;
}

export interface UITicket {
  id: string; orgId: string; orgName: string | null; subject: string;
  status: TicketStatus; priority: TicketPriority; category: string;
  assignedOperatorName: string | null; createdAt: string; updatedAt: string;
}
export function TicketTable({ tickets }: { tickets: UITicket[] }) {
  return (
    <div className="border-line overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[820px] border-collapse text-[13px]">
        <thead>
          <tr className="border-line bg-surface border-b text-[12px]">
            {["פנייה", "ארגון", "קטגוריה", "עדיפות", "סטטוס", "אחראי", "גיל", "עודכן"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-line border-b last:border-0">
              <td className="px-3 py-2.5"><Link href={`/platform/support/${t.id}`} className="text-ink hover:text-brand font-semibold">{t.subject}</Link></td>
              <td className="text-muted px-3 py-2.5">{t.orgName ?? t.orgId.slice(0, 8)}</td>
              <td className="text-muted px-3 py-2.5 text-[12px]">{CATEGORY_LABEL[t.category as keyof typeof CATEGORY_LABEL] ?? t.category}</td>
              <td className="px-3 py-2.5"><PriorityChip priority={t.priority} /></td>
              <td className="px-3 py-2.5"><StatusChip status={t.status} /></td>
              <td className="text-muted px-3 py-2.5 text-[12px]">{t.assignedOperatorName ?? <span className="text-warning">לא משויך</span>}</td>
              <td className="text-muted px-3 py-2.5 text-[12px]">{ageOf(t.createdAt)}</td>
              <td className="text-muted px-3 py-2.5 text-[12px]">{formatPlatformDateTime(t.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SupportEmpty({ note }: { note: string }) {
  return (
    <div className="text-muted flex flex-col items-center gap-2 px-1 py-10 text-center">
      <span className="text-muted/50"><Icon name="Handshake" size={28} /></span>
      <span className="text-[13px] font-semibold">{note}</span>
    </div>
  );
}

export function SupportUnavailable() {
  return (
    <div className="border-warning-soft bg-warning-soft/40 flex items-center gap-2 rounded-xl border px-4 py-3">
      <span className="text-warning"><Icon name="AlertTriangle" size={15} /></span>
      <span className="text-ink text-[12px] font-semibold">נתוני התמיכה אינם זמינים כרגע (ייתכן שמודל התמיכה טרם הוחל). זו אינה עדות ל-0 פניות.</span>
    </div>
  );
}

export function NoteItem({ authorName, note, createdAt }: { authorName: string | null; note: string; createdAt: string }) {
  return (
    <li className="border-line bg-surface rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <span className="text-ink text-[12px] font-bold">{authorName ?? "מפעיל"}</span>
        <span className="text-muted text-[11px]">{formatPlatformDateTime(createdAt)}</span>
      </div>
      <p className="text-ink mt-1.5 whitespace-pre-line text-[13px] leading-relaxed">{note}</p>
      <span className="text-muted/70 mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold"><Icon name="Lock" size={10} />פנימי בלבד</span>
    </li>
  );
}
