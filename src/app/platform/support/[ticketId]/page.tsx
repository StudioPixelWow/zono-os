// ZONO — Platform · Ticket detail (P5.7). Full ticket context + internal notes +
// status/priority/assignment controls (audited server actions) + safe links to
// Customer 360 / Users / Integrations / Operations. NO impersonation (P5.8). NO
// secrets, no raw ops payloads. Cap: platform.support.read (mutations: manage).
import { notFound } from "next/navigation";
import { authorizePlatform, currentOperatorCan } from "@/lib/platform-admin/server/auth";
import { getTicketDetail, listAssignableOperators } from "@/lib/platform-admin/server/support";
import { CATEGORY_LABEL, SOURCE_LABEL, primaryNextAction, type TicketStatus } from "@/lib/platform-admin/support/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { StatusChip, PriorityChip, NoteItem, SupportEmpty } from "@/components/platform-admin/support-ui";
import { StatusControl, PriorityControl, AssignControl, NoteForm } from "@/components/platform-admin/TicketControls";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ ticketId: string }> }) {
  const operator = await authorizePlatform("platform.support.read");
  if (!operator) return <PlatformDenied />;
  const { ticketId } = await params;
  const detail = await getTicketDetail(ticketId);
  if (!detail) notFound();
  const { ticket: t, notes } = detail;
  const canManage = await currentOperatorCan("platform.support.manage");
  const canImpersonate = await currentOperatorCan("platform.support.impersonate");
  const operators = canManage ? await listAssignableOperators() : [];
  const next = primaryNextAction({ status: t.status as TicketStatus, assigned_operator_id: t.assignedOperatorId });
  const NEXT_TONE: Record<string, string> = { brand: "bg-brand-soft text-brand-strong", warning: "bg-warning-soft text-warning", success: "bg-success-soft text-success", neutral: "bg-surface text-muted" };
  const BLOCKED_HE: Record<string, string> = { customer: "ממתין ללקוח", us: "אצלנו", none: "" };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={t.ticketNumber ? `תמיכה · ${t.ticketNumber}` : "תמיכה"} title={t.subject} description={`${t.orgName ?? t.orgId} · נפתחה ${formatPlatformDateTime(t.createdAt)}`} icon="Handshake" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Main column */}
        <div className="space-y-5">
          <PanelCard title="פרטי הפנייה" icon="Handshake">
            <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
              <StatusChip status={t.status} /><PriorityChip priority={t.priority} />
              <span className="bg-surface text-muted rounded-md px-2 py-0.5 text-[11px] font-semibold">{CATEGORY_LABEL[t.category as keyof typeof CATEGORY_LABEL] ?? t.category}</span>
              <span className="bg-surface text-muted rounded-md px-2 py-0.5 text-[11px] font-semibold">{SOURCE_LABEL[t.source]}</span>
            </div>
            {/* Canonical primary next action — deterministic, from status + assignment. */}
            <div className={`mb-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${NEXT_TONE[next.tone]}`}>
              <div className="flex items-center gap-2">
                <Icon name="Flame" size={13} />
                <span className="text-[12px] font-black">הפעולה הבאה: {next.label}</span>
              </div>
              {BLOCKED_HE[next.blockedOn] && <span className="rounded-full bg-white/50 px-2 py-0.5 text-[10px] font-bold">{BLOCKED_HE[next.blockedOn]}</span>}
            </div>
            <p className="text-ink whitespace-pre-line px-1 text-[14px] leading-relaxed">{t.description || "אין תיאור"}</p>
            {t.linkedRef && (
              <div className="border-line bg-surface mt-3 flex items-center gap-2 rounded-lg border px-3 py-2">
                <span className="text-muted"><Icon name="Route" size={13} /></span>
                <span className="text-muted text-[12px] font-semibold">בעיה תפעולית מקושרת:</span>
                <span className="text-ink font-mono text-[11px]" dir="ltr">{t.linkedRef}</span>
              </div>
            )}
          </PanelCard>

          <PanelCard title={`הערות פנימיות (${notes.length})`} icon="Lock">
            {canManage && <div className="mb-4"><NoteForm ticketId={t.id} /></div>}
            {notes.length === 0
              ? <SupportEmpty note="אין הערות עדיין" />
              : <ul className="space-y-2">{notes.map((n) => <NoteItem key={n.id} authorName={n.authorName} note={n.note} createdAt={n.createdAt} />)}</ul>}
          </PanelCard>
        </div>

        {/* Side column */}
        <div className="space-y-5">
          <PanelCard title="פעולות" icon="Settings">
            {canManage ? (
              <div className="space-y-3">
                <StatusControl ticketId={t.id} current={t.status} />
                <PriorityControl ticketId={t.id} current={t.priority} />
                <AssignControl ticketId={t.id} current={t.assignedOperatorId} operators={operators} />
              </div>
            ) : (
              <div className="space-y-2 px-1">
                <div className="text-muted text-[12px]">אחראי: <span className="text-ink font-semibold">{t.assignedOperatorName ?? "לא משויך"}</span></div>
                <p className="text-muted flex items-center gap-1.5 text-[12px]"><Icon name="Lock" size={13} />נדרשת הרשאת ניהול לשינוי סטטוס/עדיפות/שיוך</p>
              </div>
            )}
          </PanelCard>

          <PanelCard title="הקשר ארגון" icon="Building2">
            <div className="space-y-2 px-1">
              <div className="text-ink text-[13px] font-bold">{t.orgName ?? t.orgId.slice(0, 8)}</div>
              <div className="flex flex-col gap-1.5 text-[12px] font-bold">
                <Link href={`/platform/customers/${t.orgId}`} className="text-brand">Customer 360 ←</Link>
                <Link href={`/platform/customers/${t.orgId}/users`} className="text-brand">משתמשים ←</Link>
                <Link href={`/platform/customers/${t.orgId}/operations`} className="text-brand">תפעול ←</Link>
                <Link href={`/platform/customers/${t.orgId}/support`} className="text-brand">תמיכה לארגון ←</Link>
              </div>
            </div>
          </PanelCard>

          {canImpersonate && t.userId && (
            <PanelCard title="צפייה במערכת כמשתמש" icon="ShieldCheck">
              <div className="px-1">
                <p className="text-muted mb-3 text-[12px]">מצב תמיכה לקריאה בלבד — שחזור מאובטח של חשבון הלקוח בתוך הפלטפורמה. אין כניסה לחשבון הלקוח ואין שינוי נתונים.</p>
                <Link href={`/platform/support-view/${t.orgId}/${t.userId}?ticket=${t.id}`} className="bg-brand inline-block rounded-lg px-4 py-2 text-[13px] font-bold text-white">כניסה לצפייה כמשתמש ←</Link>
              </div>
            </PanelCard>
          )}
          {!t.userId && (
            <div className="border-line bg-surface rounded-xl border px-4 py-3">
              <p className="text-muted text-[11px] font-semibold">לפנייה זו לא משויך משתמש יעד — צפייה במערכת כמשתמש אינה זמינה.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
