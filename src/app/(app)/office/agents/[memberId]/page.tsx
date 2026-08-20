// ============================================================================
// ZONO — Office agent detail (/office/agents/[memberId]). Manager drill-down for
// one roster member (works for non-Auth members). Redirects non-managers / unknown
// members back to /office. Server component; data from getOfficeAgentDetail.
// ============================================================================
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { getOfficeAgentDetail } from "@/lib/office/agent-detail";
import { AgentProfileEditor } from "./AgentProfileEditor";

export const dynamic = "force-dynamic";

const ROLE_HE: Record<string, string> = { owner: "מנהל/ת המשרד", manager: "מנהל/ת", agent: "מתווך/ת" };
const ils = (n: number | null) => (n == null ? "—" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : `₪${Math.round(n / 1000)}K`);
const CARD = "bg-card border-line rounded-[22px] border shadow-[var(--shadow-card)]";

export default async function OfficeAgentPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const detail = await getOfficeAgentDetail(memberId);
  if (!detail) redirect("/office");
  const { member, stats } = detail;

  const stat = (label: string, value: number, tone = "ink") => (
    <div className="bg-surface rounded-xl px-2.5 py-2 text-center">
      <div className={`text-lg font-black leading-none ${value > 0 && tone !== "ink" ? tone : "text-ink"}`}>{value}</div>
      <div className="text-muted mt-1 text-[10px] font-semibold leading-tight">{label}</div>
    </div>
  );

  return (
    <div dir="rtl" className="flex flex-col gap-6 pb-10">
      <Link href="/office" className="text-muted hover:text-ink inline-flex w-fit items-center gap-1 text-[13px] font-bold"><Icon name="ChevronLeft" size={16} className="rotate-180" />חזרה לניהול המשרד</Link>

      {/* Header */}
      <header className={`${CARD} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-center gap-4">
          <AgentAvatar url={member.avatarUrl} name={member.name} size={64} />
          <div>
            <h1 className="text-ink text-2xl font-black leading-tight">{member.name}</h1>
            <p className="text-muted text-[13px]">{member.specialty || ROLE_HE[member.role] || "מתווך/ת"}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
              <span className={`rounded-full px-2 py-0.5 font-bold ${member.hasLogin ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{detail.accessLabel}</span>
              {member.phone && <span className="text-muted" dir="ltr">{member.phone}</span>}
              {member.email && <span className="text-muted" dir="ltr">{member.email}</span>}
            </div>
          </div>
        </div>
        <AgentProfileEditor member={{ id: member.id, name: member.name, specialty: member.specialty, phone: member.phone, email: member.email, status: member.status }} />
      </header>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {stat("נכסים", stats.activeProperties)}
        {stat("לידים", stats.openLeads)}
        {stat("חמים", stats.hotLeads, "text-warning")}
        {stat("באיחור", stats.overdueLeads, "text-danger")}
        {stat("עסקאות", stats.activeDeals)}
        {stat("תקועות", stats.stuckDeals, "text-danger")}
        {stat("פגישות היום", stats.todayMeetings)}
        {stat("משימות באיחור", stats.overdueTasks, "text-danger")}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main: portfolio + leads + deals */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-ink flex items-center gap-2 text-lg font-black"><Icon name="Building" size={18} className="text-brand-strong" />תיק נכסים <span className="text-muted text-[13px] font-normal">· {stats.activeProperties}</span></h2>
            {detail.properties.length === 0 ? <p className="text-muted text-[13px]">אין נכסים משויכים לסוכן זה.</p> : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {detail.properties.map((p) => (
                  <Link key={p.id} href={p.href} className={`${CARD} hover:border-brand-light flex items-center justify-between gap-2 p-3 transition`}>
                    <span className="min-w-0"><span className="text-ink block truncate text-[13px] font-bold">{p.title}</span><span className="text-muted block truncate text-[11px]">{p.sub}</span></span>
                    <span className="shrink-0 text-left"><span className="text-ink block text-[13px] font-black">{p.price}</span><span className="text-muted block text-[10px]">{p.statusLabel}</span></span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <section className="flex flex-col gap-3">
              <h2 className="text-ink flex items-center gap-2 text-base font-black"><Icon name="Users" size={16} className="text-brand-strong" />לידים <span className="text-muted text-[12px] font-normal">· {stats.openLeads}</span></h2>
              <div className={`${CARD} flex flex-col gap-1.5 p-3`}>
                {detail.leads.length === 0 ? <p className="text-muted p-2 text-center text-[12px]">אין לידים פתוחים</p> : detail.leads.map((l) => (
                  <Link key={l.id} href={l.href} className="hover:bg-surface flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                    <span className="text-ink min-w-0 truncate text-[13px] font-bold">{l.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">{l.hot && <span className="bg-warning-soft text-warning rounded-full px-1.5 py-0.5 text-[10px] font-black">חם</span>}<span className="text-muted text-[11px]">{l.stage}</span></span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-ink flex items-center gap-2 text-base font-black"><Icon name="Handshake" size={16} className="text-brand-strong" />עסקאות <span className="text-muted text-[12px] font-normal">· {stats.activeDeals}</span></h2>
              <div className={`${CARD} flex flex-col gap-1.5 p-3`}>
                {detail.deals.length === 0 ? <p className="text-muted p-2 text-center text-[12px]">אין עסקאות פעילות</p> : detail.deals.map((d) => (
                  <Link key={d.id} href={d.href} className="hover:bg-surface flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                    <span className="min-w-0"><span className="text-ink block truncate text-[13px] font-bold">{d.title}</span><span className="text-muted block truncate text-[11px]">{d.stage}{d.ageDays != null ? ` · ${d.ageDays} ימים` : ""}</span></span>
                    <span className="flex shrink-0 items-center gap-1.5">{d.stuck && <span className="bg-danger-soft text-danger rounded-full px-1.5 py-0.5 text-[10px] font-black">תקועה</span>}<span className="text-ink text-[12px] font-black">{ils(d.value)}</span></span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Rail: today + needs attention */}
        <aside className="flex flex-col gap-4">
          <div className={`${CARD} flex flex-col gap-3 p-4`}>
            <p className="text-ink flex items-center gap-2 text-[13px] font-black"><Icon name="Calendar" size={15} className="text-brand-strong" />היום</p>
            {detail.meetingsToday.length === 0 ? <p className="text-muted py-2 text-center text-[12px]">אין פגישות היום</p> : (
              <ul className="flex flex-col gap-2">
                {detail.meetingsToday.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <span className="bg-brand-soft text-brand-strong shrink-0 rounded-lg px-2 py-1 text-[12px] font-black tabular-nums">{m.time}</span>
                    <div className="min-w-0"><p className="text-ink truncate text-[12px] font-bold">{m.title}</p><p className="text-muted text-[10px]">{m.kind}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`${CARD} flex flex-col gap-3 p-4`}>
            <p className="text-ink flex items-center gap-2 text-[13px] font-black"><Icon name="Flame" size={15} className="text-danger" />דורש טיפול</p>
            {detail.needsAttention.length === 0 ? <p className="text-success py-2 text-center text-[12px] font-bold">אין פיגורים ✓</p> : (
              <ul className="flex flex-col gap-2">
                {detail.needsAttention.map((n) => (
                  <li key={n.id}><Link href={n.href} className="border-line hover:bg-surface flex flex-col rounded-xl border px-3 py-2 transition">
                    <span className="text-ink truncate text-[12px] font-bold">{n.label}</span>
                    <span className="text-muted truncate text-[11px]">{n.sub}</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
