"use client";
// ============================================================================
// 🏢 ZONO — Office AI Manager view (mobile-first RTL). PHASE 55.0.
// Morning briefing → broker workload cards → delegation suggestions → follow-up
// compliance → approval center. Advisory + approval-gated; nothing auto-assigns.
// ============================================================================
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import type { OfficeManagerReport, BrokerCard, DelegationSuggestion } from "@/lib/office-manager/types";

const WL_CLS: Record<string, string> = { low: "bg-surface text-muted", balanced: "bg-success-soft text-success", high: "bg-warning-soft text-warning", overloaded: "bg-danger-soft text-danger" };
const ST_CLS: Record<string, string> = { free: "bg-success-soft text-success", vacation: "bg-warning-soft text-warning", offline: "bg-danger-soft text-danger", busy: "bg-surface text-muted", meeting: "bg-surface text-muted", field: "bg-surface text-muted" };

export function OfficeManagerView({ report }: { report: OfficeManagerReport | null }) {
  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO · ניהול משרד</p>
        <h1 className="text-ink mt-1 text-2xl font-black">🏢 מנהל המשרד AI</h1>
        <p className="text-muted mt-1 text-sm leading-relaxed">מי זקוק לעזרה, מי בעומס, מה חייב לקרות היום, איפה המשרד מפסיד כסף ואילו פעולות צוות ממתינות לאישור. המלצות בלבד — אין הקצאה אוטומטית.</p>
      </div>

      {!report && <p className="text-muted mt-6 text-center text-sm">טעינת מרכז הניהול נכשלה — נסה שוב.</p>}

      {report && !report.hasData && (
        <div className="bg-card border-line mt-4 flex flex-col items-center gap-2 rounded-[20px] border p-8 text-center">
          <span className="bg-surface grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Users" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין נתוני צוות</p>
          <p className="text-muted max-w-sm text-sm">{report.notes[0]}</p>
        </div>
      )}

      {report && report.hasData && (
        <div className="mt-4 space-y-4">
          {/* Briefing */}
          <div className="bg-card border-line rounded-[20px] border p-4">
            <h2 className="text-ink text-lg font-black">{report.briefing.headline}</h2>
            <p className="text-muted mt-1 text-[13px]">{report.briefing.todayFocus}</p>
            {report.briefing.losingMoney.length > 0 && (
              <div className="mt-2">
                <p className="text-danger text-[11px] font-bold">איפה מפסידים כסף</p>
                <ul className="mt-1 space-y-0.5">{report.briefing.losingMoney.map((m, i) => <li key={i} className="text-muted text-[12px]">• {m}</li>)}</ul>
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Stat label="סוכנים" value={report.totals.brokers} />
            <Stat label="בעומס" value={report.totals.overloaded} tone="text-danger" />
            <Stat label="לא פעילים" value={report.totals.inactive} tone="text-warning" />
            <Stat label="בחופשה" value={report.totals.onVacation} />
          </div>

          {/* Delegation suggestions */}
          {report.delegations.length > 0 && (
            <Section title="הצעות האצלה (דורשות אישור)" icon="Handshake">
              <div className="space-y-2">{report.delegations.map((d, i) => <DelegationRow key={i} d={d} />)}</div>
            </Section>
          )}

          {/* Brokers */}
          <Section title={`הצוות (${report.brokers.length})`} icon="Users">
            <div className="space-y-2">{report.brokers.map((b) => <BrokerRow key={b.id} b={b} />)}</div>
          </Section>

          {/* Follow-up compliance */}
          <Section title="עמידה במעקבים" icon="ListChecks">
            <p className="text-muted text-[12px]">{report.followUp.note}{report.followUp.teamRatePct != null ? ` שיעור מעקב צוותי: ${report.followUp.teamRatePct}%.` : ""}</p>
            {report.followUp.brokersAtRisk.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">{report.followUp.brokersAtRisk.map((x, i) => <span key={i} className="bg-warning-soft text-warning rounded-full px-2.5 py-1 text-[11px] font-bold">{x.name} · {x.openLeads} לידים</span>)}</div>
            )}
          </Section>

          {/* Vacation */}
          {report.vacation.onVacation.length > 0 && (
            <Section title="חופשות / היעדרויות" icon="Calendar">
              <p className="text-muted text-[12px]">{report.vacation.note}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{report.vacation.onVacation.map((v, i) => <span key={i} className="bg-surface text-ink rounded-full px-2.5 py-1 text-[11px] font-bold">{v.name} · {v.state}</span>)}</div>
            </Section>
          )}

          {/* Approval center */}
          {report.approvals.count > 0 && (
            <Section title={`מרכז אישורים (${report.approvals.count})`} icon="CheckCircle">
              <div className="space-y-2">{report.approvals.bundles.map((a, i) => (
                <div key={i} className="bg-surface flex items-center justify-between gap-2 rounded-xl p-3">
                  <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-bold">{a.title}</span>
                  {a.href ? <Link href={a.href} className="text-brand-strong shrink-0 text-[11px] font-bold">פתח ↗</Link> : <span className="text-muted text-[11px]">עדיפות {a.priority}</span>}
                </div>
              ))}</div>
              <p className="text-muted mt-2 text-[11px]">האישור מתבצע במסך ההנהלה — לא אוטומטי.</p>
            </Section>
          )}

          {report.notes.map((n, i) => <p key={i} className="text-muted text-[11px] leading-relaxed">🔒 {n}</p>)}
        </div>
      )}
    </div>
  );
}

function BrokerRow({ b }: { b: BrokerCard }) {
  return (
    <div className="bg-surface rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink text-[13px] font-bold">{b.name}{b.score != null ? <span className="text-muted font-normal"> · {b.score}</span> : null}</p>
          <p className="text-muted text-[11px]">{b.todayEvents} אירועים · {b.activeBuyers} קונים · {b.activeSellers} מוכרים · {b.openLeads} לידים</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", WL_CLS[b.workloadLevel])}>{b.workloadHe}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", ST_CLS[b.state] ?? "bg-surface text-muted")}>{b.stateHe}</span>
        </div>
      </div>
      {b.flags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{b.flags.map((f, i) => <span key={i} className="text-muted bg-card rounded-full px-2 py-0.5 text-[10px] font-bold">{f}</span>)}</div>}
    </div>
  );
}

function DelegationRow({ d }: { d: DelegationSuggestion }) {
  return (
    <div className="bg-surface rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink text-[13px] font-bold">{d.fromName} → {d.toName ?? "?"} · {d.item}</p>
        <span className="bg-warning-soft text-warning shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">דורש אישור</span>
      </div>
      <p className="text-muted mt-0.5 text-[12px]">{d.reason}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-3 flex items-center gap-2"><span className="text-brand"><Icon name={icon} size={16} /></span><h3 className="text-ink text-sm font-extrabold">{title}</h3></div>
      {children}
    </div>
  );
}
function Stat({ label, value, tone = "text-brand" }: { label: string; value: number; tone?: string }) {
  return <div className="bg-card border-line rounded-2xl border p-3 text-center"><div className={cn("text-xl font-black", tone)}>{value}</div><div className="text-muted text-[11px] font-bold">{label}</div></div>;
}
