// ============================================================================
// ZONO — OFFICE MANAGER COCKPIT (/office). The workspace a brokerage manager
// manages the office FROM (observe → decide → assign → approve → follow up →
// drill down), not a dashboard ABOUT the office. Agents are visual people
// (photos throughout). IA: header · KPI · team · decision queues + approvals +
// today · properties · deals · workload. Server component; ALL data from
// getOfficeManagementBoard (real DB). The old full exception center is gone —
// its canonical data is surfaced as compact actionable queues. RTL, ZONO identity.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { SurfaceTabs } from "@/components/navigation/SurfaceTabs";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { AssignMemberPopover } from "./AssignMemberPopover";
import { OfficePropertiesStrip } from "./OfficePropertiesStrip";
import { OfficeTeamSection } from "./OfficeTeamSection";
import { ZonoMark } from "@/components/zono/ZonoMark";
import type { OfficeManagementBoard, OfficeQueue, OfficeDealRow } from "@/lib/office/management-board";

const CARD = "bg-card border-line rounded-[22px] border shadow-[var(--shadow-card)]";
const TONE_TEXT: Record<string, string> = { brand: "text-brand-strong", danger: "text-danger", warning: "text-warning", success: "text-success" };
const TONE_CHIP: Record<string, string> = { brand: "bg-brand-soft text-brand-strong", danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", success: "bg-success-soft text-success" };
const ROLE_HE: Record<string, string> = { owner: "מנהל/ת המשרד", manager: "מנהל/ת", agent: "מתווך/ת" };

const QUICK: { label: string; icon: string; href: string }[] = [
  { label: "+ נכס", icon: "Building", href: "/properties/new" },
  { label: "+ קונה", icon: "UserPlus", href: "/buyers/new" },
  { label: "ניהול צוות", icon: "Users", href: "/team" },
  { label: "יומן", icon: "Calendar", href: "/calendar" },
  { label: "עסקאות", icon: "Handshake", href: "/deals" },
];

function ils(n: number | null): string {
  if (n == null) return "—";
  return n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : `₪${Math.round(n / 1000)}K`;
}
function greetingHe(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }).format(now));
  return h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב";
}

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

// ── D — Decision queue card ───────────────────────────────────────────────────
function QueueCard({ q, agents }: { q: OfficeQueue; agents: OfficeManagementBoard["agentOptions"] }) {
  return (
    <div className={`${CARD} flex flex-col gap-2.5 p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink flex items-center gap-2 text-[13px] font-black"><Icon name={q.icon} size={15} className={TONE_TEXT[q.tone]} />{q.title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${TONE_CHIP[q.tone]}`}>{q.count}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {q.items.map((it) => (
          <li key={it.id} className="border-line flex items-center gap-2 rounded-xl border px-2.5 py-1.5">
            <Link href={it.href} className="min-w-0 flex-1">
              <span className="text-ink block truncate text-[12px] font-bold">{it.title}</span>
              <span className="text-muted block truncate text-[11px]">{it.sub}</span>
            </Link>
            {it.assign ? (
              <AssignMemberPopover entityType={it.assign} entityId={it.id} agents={agents} size="xs" label="שייך" />
            ) : (
              <Link href={it.href} className="text-brand-strong inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold hover:underline">פתח<Icon name="ArrowLeft" size={11} /></Link>
            )}
          </li>
        ))}
      </ul>
      {q.count > q.items.length && (
        <Link href={q.moreHref} className="text-brand-strong self-start text-[12px] font-bold hover:underline">הצג את כל {q.count} ←</Link>
      )}
    </div>
  );
}

function DealRow({ d }: { d: OfficeDealRow }) {
  const STAGE_HE: Record<string, string> = { new: "חדשה", qualified: "מוסמכת", negotiation: "משא ומתן", agreement: "הסכמה", contract: "חוזה", closing: "סגירה" };
  return (
    <div className="border-line flex items-center gap-2.5 rounded-xl border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[13px] font-bold">{d.title}</p>
        <p className="text-muted flex items-center gap-1.5 truncate text-[11px]">
          {d.agentName && <AgentAvatar url={d.agentAvatarUrl} name={d.agentName} size={16} ring={false} />}
          <span className="truncate">{STAGE_HE[d.stage] ?? d.stage}{d.agentName ? ` · ${d.agentName}` : ""}{d.ageDays != null ? ` · ${d.ageDays} ימים` : ""}</span>
        </p>
      </div>
      {d.stuck && <span className="bg-danger-soft text-danger shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black">תקועה</span>}
      <span className="text-ink shrink-0 text-[13px] font-black tabular-nums">{ils(d.value)}</span>
      <Link href={d.href} className="text-brand-strong shrink-0 text-[11px] font-bold hover:underline">פתח</Link>
    </div>
  );
}

export function OfficeManagementCenter({ board }: { board: OfficeManagementBoard }) {
  const now = new Date();
  const dateHe = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(now);
  const s = board.summary;
  const agentCards = board.agents.filter((a) => a.role !== "owner");
  const maxLeads = Math.max(1, ...agentCards.map((a) => a.openLeads));

  const stat = (label: string, value: number, icon: string, href: string) => (
    <Link href={href} className={`${CARD} hover:border-brand-light flex items-center gap-3 p-3.5 transition ${value === 0 ? "opacity-60" : ""}`}>
      <span className="bg-brand-soft text-brand-strong grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={icon} size={19} /></span>
      <div><div className="text-ink text-2xl font-black leading-none">{value}</div><div className="text-muted mt-0.5 text-[11px] font-semibold">{label}</div></div>
    </Link>
  );

  return (
    <div dir="rtl" className="flex flex-col gap-6 pb-10">
      <SurfaceTabs active="office" isManager />

      {/* ── A — Office command header ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-muted text-[13px] font-semibold">ניהול משרד</p>
          <h1 className="text-ink text-2xl font-black leading-tight">משרד {board.officeName}</h1>
          <p className="text-muted mt-0.5 text-[13px]">
            {greetingHe(now)} · {dateHe} · <span className="text-ink font-bold">{s.agents}</span> סוכנים · <span className="text-ink font-bold">{s.activeProperties}</span> נכסים · <span className="text-ink font-bold">{s.activeLeads}</span> לידים
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className="border-line hover:border-brand-light hover:bg-surface text-ink inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-bold transition">
              <Icon name={q.icon} size={14} className="text-brand-strong" />{q.label}
            </Link>
          ))}
        </div>
      </header>

      {/* ── B — KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stat("סוכנים", s.agents, "Users", "/team")}
        {stat("נכסים פעילים", s.activeProperties, "Building", "/properties")}
        {stat("לידים פתוחים", s.activeLeads, "UserPlus", "/leads")}
        {stat("עסקאות פעילות", s.activeDeals, "Handshake", "/deals")}
        {stat("פגישות היום", s.meetingsToday, "Calendar", "/calendar")}
      </div>

      {/* ── C — Team (dominant) + manager ─────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionHead title="הצוות שלי" sub="סוכנים מקומיים · עומס ופעילות לפי סוכן" icon="Users" href="/team" hrefLabel="ניהול צוות" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_240px]">
          <OfficeTeamSection agents={agentCards} agentOptions={board.agentOptions} />
          {board.manager && (
            <div className={`${CARD} flex flex-col items-center gap-2 p-4 text-center`}>
              <AgentAvatar url={board.manager.avatarUrl} name={board.manager.name} size={56} />
              <div>
                <p className="text-ink text-[15px] font-black">{board.manager.name}</p>
                <p className="text-brand-strong text-[12px] font-bold">{ROLE_HE[board.manager.role] ?? "מנהל/ת המשרד"}</p>
              </div>
              <Link href={`/office/agents/${board.manager.id}`} className="text-brand-strong text-[12px] font-bold hover:underline">הפרופיל שלי →</Link>
            </div>
          )}
        </div>
      </section>

      {/* ── D — Management workspace: decisions (65) · approvals + today (35) ──── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* LEFT — decision queues */}
        <section className="flex flex-col gap-3 xl:col-span-2">
          <SectionHead title="דורש החלטה ממך" sub="תורים תפעוליים — שייך, טפל, קדם" icon="Flame" />
          {board.queues.length > 0 && (
            // ONE ZONO identity on the real attention surface — count is the sum of
            // the canonical decision queues (no new logic, no fabricated number).
            <div className="flex items-center gap-2">
              <ZonoMark size="compact" state="attention" />
              <p className="text-ink text-[13px] font-black">זונו שם לב</p>
              <span className="text-muted text-[12px]">· {board.queues.reduce((n, q) => n + q.count, 0)} נושאים דורשים את ההחלטה שלך</span>
            </div>
          )}
          {board.queues.length === 0 ? (
            <div className="bg-success-soft flex items-center justify-center gap-2 rounded-2xl p-6 text-center">
              <span className="text-success text-xl">✓</span><span className="text-ink text-[13px] font-black">המשרד בשליטה — אין חריגים שדורשים אותך כרגע</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {board.queues.map((q) => <QueueCard key={q.key} q={q} agents={board.agentOptions} />)}
            </div>
          )}
        </section>

        {/* RIGHT — approvals + today */}
        <aside className="flex flex-col gap-4">
          <div className={`${CARD} flex flex-col gap-3 p-4`}>
            <p className="text-ink flex items-center gap-2 text-[13px] font-black"><Icon name="CheckCircle" size={15} className="text-brand-strong" />ממתין לאישור שלי{board.approvals.count > 0 && <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-black">{board.approvals.count}</span>}</p>
            {board.approvals.count === 0 ? (
              <p className="text-muted py-2 text-center text-[12px]">אין פריטים הממתינים לאישור</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {board.approvals.items.map((a) => (
                  <li key={a.id}><Link href={a.href} className="border-line hover:bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition">
                    <span className="min-w-0"><span className="text-ink block truncate text-[12px] font-bold">{a.title}</span><span className="text-muted block truncate text-[11px]">{a.sub}</span></span>
                    <span className={`shrink-0 text-[11px] font-bold ${TONE_TEXT[a.tone] ?? "text-brand-strong"}`}>פתח לאישור ←</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </div>

          <div className={`${CARD} flex flex-col gap-3 p-4`}>
            <div className="flex items-center justify-between">
              <p className="text-ink flex items-center gap-2 text-[13px] font-black"><Icon name="Calendar" size={15} className="text-brand-strong" />היום במשרד</p>
              <Link href="/calendar" className="text-brand-strong text-[11px] font-bold hover:underline">ליומן</Link>
            </div>
            {board.meetingsToday.length === 0 ? (
              <p className="text-muted py-2 text-center text-[12px]">אין פגישות מתוזמנות היום</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {board.meetingsToday.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <span className="bg-brand-soft text-brand-strong shrink-0 rounded-lg px-2 py-1 text-[12px] font-black tabular-nums">{m.time}</span>
                    {m.agentName && <AgentAvatar url={m.agentAvatarUrl} name={m.agentName} size={28} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate text-[12px] font-bold">{m.title}</p>
                      <p className="text-muted truncate text-[10px]">{m.kind}{m.agentName ? ` · ${m.agentName}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ── E — Office properties (compact + agent chips + agent filter) ──────── */}
      <section className="flex flex-col gap-3">
        <SectionHead title="נכסי המשרד" sub={`${board.propertiesTotal} נכסים פעילים`} icon="Building" href="/properties" hrefLabel="כל נכסי המשרד" />
        <OfficePropertiesStrip cards={board.properties} agents={board.agentOptions} />
      </section>

      {/* ── F — Deals + workload ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Deals */}
        <section className="flex flex-col gap-3">
          <SectionHead title="עסקאות במשרד" icon="Handshake" href="/deals" hrefLabel="כל העסקאות" />
          <div className={`${CARD} flex flex-col gap-3 p-4`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["פעילות", board.deals.active, "brand"], ["תקועות", board.deals.stuck, "danger"], ["שלב מתקדם", board.deals.lateStage, "success"], ["נסגרו החודש", board.deals.wonPeriod, "success"]].map(([label, val, tone]) => (
                <div key={label as string} className="bg-surface rounded-xl px-2.5 py-2 text-center">
                  <div className={`text-lg font-black leading-none ${(val as number) > 0 ? TONE_TEXT[tone as string] : "text-muted"}`}>{val as number}</div>
                  <div className="text-muted mt-1 text-[10px] font-semibold">{label as string}</div>
                </div>
              ))}
            </div>
            {board.deals.rows.length > 0 && <div className="flex flex-col gap-2">{board.deals.rows.slice(0, 3).map((d) => <DealRow key={d.id} d={d} />)}</div>}
          </div>
        </section>

        {/* Workload + lead distribution */}
        <section className="flex flex-col gap-3">
          <SectionHead title="עומס צוות" sub="חלוקת עבודה לפי סוכן" icon="TrendingUp" />
          <div className={`${CARD} flex flex-col gap-2.5 p-4`}>
            {agentCards.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5">
                <AgentAvatar url={a.avatarUrl} name={a.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink truncate text-[13px] font-bold">{a.name}</span>
                    <span className="text-muted shrink-0 text-[11px]">{a.openLeads} לידים · {a.activeProperties} נכסים · {a.todayMeetings} פגישות{a.overdueFollowups > 0 ? <span className="text-danger font-bold"> · {a.overdueFollowups} באיחור</span> : null}</span>
                  </div>
                  <div className="bg-surface mt-1 h-1.5 overflow-hidden rounded-full">
                    <div className="bg-brand h-full rounded-full" style={{ width: `${Math.round((a.openLeads / maxLeads) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {board.leads.unassigned > 0 && (
              <Link href="/leads" className="border-line text-danger hover:bg-surface -mb-1 mt-1 flex items-center justify-between rounded-xl border border-dashed px-3 py-2 text-[12px] font-bold transition">
                <span className="flex items-center gap-1.5"><Icon name="AlertTriangle" size={13} />לידים ללא אחראי</span>
                <span className="tabular-nums">{board.leads.unassigned} ←</span>
              </Link>
            )}
          </div>
        </section>
      </div>

      {/* ── Compact office insight (single, if any) ───────────────────────────── */}
      {board.intelligenceTeaser[0] && (
        <Link href="/office/intelligence" className="zono-ai-gradient flex items-center gap-3 rounded-[22px] p-4 text-white transition hover:brightness-105">
          <Icon name="Sparkles" size={18} className="shrink-0" />
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium opacity-95">{board.intelligenceTeaser[0].text}</p>
          <span className="shrink-0 text-[12px] font-bold underline opacity-90">תובנות</span>
        </Link>
      )}
    </div>
  );
}
