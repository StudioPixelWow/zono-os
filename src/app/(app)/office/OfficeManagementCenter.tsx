// ============================================================================
// ZONO — OFFICE MANAGEMENT CENTER (/office). The manager/owner OFFICE screen:
// סקירה · הסוכנים שלי · נכסי המשרד · לידים · עסקאות · דורש את תשומת לבך · תובנות.
// The existing exceptions command center is preserved as the "attention" section
// (demoted, not deleted). Server component; all data from getOfficeManagementBoard.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { OfficeManagementBoard, OfficeAgentCard, OfficeDealRow } from "@/lib/office/management-board";
import { OfficePropertiesStrip } from "./OfficePropertiesStrip";
import { OfficeCommandCenter } from "./OfficeCommandCenter";

const CARD = "bg-card border-line rounded-[22px] border shadow-[var(--shadow-card)]";
// Static (Tailwind-safe) tone → text-color classes for the stat tiles.
const TONE_TEXT: Record<string, string> = { brand: "text-brand-strong", danger: "text-danger", warning: "text-warning", success: "text-success" };

function SectionHead({ title, sub, icon, href, hrefLabel }: { title: string; sub?: string; icon: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name={icon} size={18} /></span>
        <div>
          <h2 className="text-ink text-lg font-black leading-tight">{title}</h2>
          {sub && <p className="text-muted text-[12px]">{sub}</p>}
        </div>
      </div>
      {href && <Link href={href} className="text-brand-strong flex shrink-0 items-center gap-0.5 text-[13px] font-bold hover:underline">{hrefLabel ?? "הצג הכל"}<Icon name="ArrowLeft" size={14} /></Link>}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

function AgentCard({ a }: { a: OfficeAgentCard }) {
  const ROLE_HE: Record<string, string> = { owner: "מנהל/ת משרד", manager: "מנהל/ת", agent: "מתווך/ת" };
  const metric = (label: string, value: number, icon: string) => (
    <div className="flex items-center gap-1.5"><Icon name={icon} size={13} className="text-muted" /><span className="text-ink text-[13px] font-black tabular-nums">{value}</span><span className="text-muted text-[11px]">{label}</span></div>
  );
  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`}>
      <div className="flex items-center gap-3">
        <span className="bg-brand-soft text-brand-strong grid h-11 w-11 shrink-0 place-items-center rounded-full text-[15px] font-black">{initials(a.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-[15px] font-black">{a.name}</p>
          <p className="text-muted truncate text-[12px]">{a.specialty || ROLE_HE[a.role] || "מתווך/ת"}</p>
        </div>
        {a.attention > 0 && <span className="bg-danger-soft text-danger inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black"><Icon name="Flame" size={11} />{a.attention}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {metric("נכסים", a.activeProperties, "Building")}
        {metric("לידים", a.openLeads, "Users")}
        {metric("עסקאות", a.activeDeals, "Handshake")}
        {metric("פגישות היום", a.todayMeetings, "Calendar")}
      </div>
      <div className="border-line flex items-center justify-between border-t pt-2.5">
        <span className={`text-[11px] font-bold ${a.overdueFollowups > 0 ? "text-danger" : "text-success"}`}>{a.overdueFollowups > 0 ? `דורש טיפול: ${a.overdueFollowups}` : "אין פיגורים"}</span>
        <Link href="/team" className="text-brand-strong inline-flex items-center gap-0.5 text-[12px] font-bold">פתח סוכן<Icon name="ArrowLeft" size={12} /></Link>
      </div>
    </div>
  );
}

function DealRow({ d }: { d: OfficeDealRow }) {
  const STAGE_HE: Record<string, string> = { new: "חדשה", qualified: "מוסמכת", negotiation: "משא ומתן", agreement: "הסכמה", contract: "חוזה", closing: "סגירה" };
  const ils = (n: number | null) => (n == null ? "—" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : `₪${Math.round(n / 1000)}K`);
  return (
    <Link href={d.href} className="border-line hover:bg-surface/70 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${d.stuck ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-strong"}`}><Icon name="Handshake" size={15} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[13px] font-bold">{d.title}</p>
        <p className="text-muted truncate text-[11px]">{STAGE_HE[d.stage] ?? d.stage}{d.agentName ? ` · ${d.agentName}` : ""}{d.ageDays != null ? ` · ${d.ageDays} ימים` : ""}</p>
      </div>
      {d.stuck && <span className="bg-danger-soft text-danger shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black">תקועה</span>}
      <span className="text-ink shrink-0 text-[13px] font-black tabular-nums">{ils(d.value)}</span>
    </Link>
  );
}

export function OfficeManagementCenter({ board }: { board: OfficeManagementBoard }) {
  const s = board.summary;
  const quiet = (n: number) => (n === 0 ? "opacity-60" : "");
  const stat = (label: string, value: number, icon: string, href: string) => (
    <Link href={href} className={`${CARD} flex items-center gap-3 p-3.5 transition hover:border-brand-light ${quiet(value)}`}>
      <span className="bg-brand-soft text-brand-strong grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={icon} size={19} /></span>
      <div><div className="text-ink text-2xl font-black leading-none">{value}</div><div className="text-muted mt-0.5 text-[11px] font-semibold">{label}</div></div>
    </Link>
  );

  return (
    <div dir="rtl" className="flex flex-col gap-7 pb-10">
      {/* ── Overview ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-muted text-[13px] font-semibold">ניהול משרד</p>
          <h1 className="text-ink text-2xl font-black">משרד {board.officeName}</h1>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stat("סוכנים", s.agents, "Users", "/team")}
          {stat("נכסים פעילים", s.activeProperties, "Building", "/properties")}
          {stat("לידים פעילים", s.activeLeads, "UserPlus", "/leads")}
          {stat("עסקאות פעילות", s.activeDeals, "Handshake", "/deals")}
          {stat("פגישות היום", s.meetingsToday, "Calendar", "/calendar")}
        </div>
      </div>

      {/* ── SECTION A — הסוכנים שלי (dominant) ────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionHead title="הסוכנים שלי" sub="עומס ופעילות לפי סוכן" icon="Users" href="/team" hrefLabel="ניהול צוות" />
        {board.agents.length === 0 ? (
          <div className={`${CARD} text-muted p-6 text-center text-[13px]`}>עדיין אין סוכנים במשרד</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {board.agents.map((a) => <AgentCard key={a.id} a={a} />)}
          </div>
        )}
      </section>

      {/* ── Properties ────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionHead title="נכסי המשרד" sub={`${board.propertiesTotal} נכסים פעילים`} icon="Building" href="/properties" hrefLabel="כל נכסי המשרד" />
        <OfficePropertiesStrip cards={board.properties} />
      </section>

      {/* ── Leads + Deals (two columns on wide) ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <SectionHead title="לידים" icon="UserPlus" href="/leads" hrefLabel="נהל לידים" />
          <div className={`${CARD} flex flex-col gap-3 p-4`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["לא משויכים", board.leads.unassigned, "danger"], ["חמים", board.leads.hot, "warning"], ["בפיגור", board.leads.overdue, "danger"], ["חדשים היום", board.leads.newToday, "success"]].map(([label, val, tone]) => (
                <div key={label as string} className="bg-surface rounded-xl px-3 py-2.5 text-center">
                  <div className={`text-xl font-black leading-none ${(val as number) > 0 ? TONE_TEXT[tone as string] : "text-muted"}`}>{val as number}</div>
                  <div className="text-muted mt-1 text-[11px] font-semibold">{label as string}</div>
                </div>
              ))}
            </div>
            {board.leads.byAgent.length > 0 && (
              <div className="border-line flex flex-col gap-1.5 border-t pt-2.5">
                <p className="text-muted text-[11px] font-bold">פיזור לפי סוכן</p>
                {board.leads.byAgent.map((x) => (
                  <div key={x.name} className="flex items-center justify-between text-[12px]"><span className="text-ink font-semibold">{x.name}</span><span className="text-muted tabular-nums">{x.count}</span></div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHead title="עסקאות" icon="Handshake" href="/deals" hrefLabel="כל העסקאות" />
          <div className={`${CARD} flex flex-col gap-3 p-4`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["פעילות", board.deals.active, "brand"], ["תקועות", board.deals.stuck, "danger"], ["שלב מתקדם", board.deals.lateStage, "success"], ["נסגרו החודש", board.deals.wonPeriod, "success"]].map(([label, val, tone]) => (
                <div key={label as string} className="bg-surface rounded-xl px-3 py-2.5 text-center">
                  <div className={`text-xl font-black leading-none ${(val as number) > 0 ? TONE_TEXT[tone as string] : "text-muted"}`}>{val as number}</div>
                  <div className="text-muted mt-1 text-[11px] font-semibold">{label as string}</div>
                </div>
              ))}
            </div>
            {board.deals.rows.length > 0 && (
              <div className="flex flex-col gap-2">{board.deals.rows.map((d) => <DealRow key={d.id} d={d} />)}</div>
            )}
          </div>
        </section>
      </div>

      {/* ── דורש את תשומת לבך — existing command center (preserved, demoted) ───── */}
      <section className="flex flex-col gap-3">
        <SectionHead title="דורש את תשומת לבך" sub="חריגים והחלטות ניהוליות" icon="Flame" />
        <OfficeCommandCenter center={board.center} agents={board.reassignAgents} />
      </section>

      {/* ── Intelligence teaser ───────────────────────────────────────────────── */}
      {board.intelligenceTeaser.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHead title="תובנות על המשרד" icon="Sparkles" href="/office/intelligence" hrefLabel="לכל התובנות" />
          <div className="zono-ai-gradient flex flex-col gap-2 rounded-[22px] p-4 text-white">
            {board.intelligenceTeaser.map((t, i) => (
              <p key={i} className="text-[13px] font-medium opacity-95">{t.text}</p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
