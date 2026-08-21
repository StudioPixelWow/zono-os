"use client";
// ============================================================================
// ZONO — Agent Manager Drawer. In-context side sheet opened from an /office agent
// card: the manager inspects and manages ONE agent's day, workload, portfolio,
// leads, deals, exceptions and recent activity WITHOUT leaving the workspace.
// Data is lazy-loaded per selected member (never eagerly for all agents). Reuses
// the canonical getOfficeAgentDetail selector + roster assignment actions — no
// second CRM. RTL. Dialog semantics (aria-modal, ESC, focus). Works for non-Auth
// roster members.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { AssignMemberPopover } from "./AssignMemberPopover";
import { loadOfficeAgentDetailAction } from "@/lib/office/agent-detail-actions";
import type { OfficeAgentDetail } from "@/lib/office/agent-detail";
import type { OfficeAgentOption } from "@/lib/office/management-board";

const ROLE_HE: Record<string, string> = { owner: "מנהל/ת המשרד", manager: "מנהל/ת", agent: "מתווך/ת" };
const ils = (n: number | null) => (n == null ? "—" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : `₪${Math.round(n / 1000)}K`);

function Stat({ label, value, tone = "ink" }: { label: string; value: number; tone?: string }) {
  const cls = value > 0 && tone !== "ink" ? tone : "text-ink";
  return (
    <div className="bg-surface rounded-xl px-2.5 py-2 text-center">
      <div className={`text-lg font-black leading-none ${cls}`}>{value}</div>
      <div className="text-muted mt-1 text-[10px] font-semibold leading-tight">{label}</div>
    </div>
  );
}
function Section({ title, icon, count, action, children }: { title: string; icon: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-ink flex items-center gap-1.5 text-[13px] font-black"><Icon name={icon} size={15} className="text-brand-strong" />{title}{count != null && <span className="text-muted font-normal">· {count}</span>}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AgentManagerDrawer({ memberId, agents, onClose }: { memberId: string | null; agents: OfficeAgentOption[]; onClose: () => void }) {
  const open = !!memberId;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open || !memberId) return null;

  return (
    <div dir="rtl" className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="ניהול סוכן">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div className="bg-surface absolute inset-y-0 start-0 flex w-full max-w-[640px] flex-col shadow-2xl sm:w-[85vw] md:w-[640px]">
        {/* key=memberId → a fresh fetch (and clean loading state) per agent, with
            no state-reset effect. */}
        <DrawerContent key={memberId} memberId={memberId} agents={agents} onClose={onClose} />
      </div>
    </div>
  );
}

function DrawerContent({ memberId, agents, onClose }: { memberId: string; agents: OfficeAgentOption[]; onClose: () => void }) {
  const [data, setData] = useState<OfficeAgentDetail | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const closeRef = useRef<HTMLButtonElement>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    loadOfficeAgentDetailAction(memberId)
      .then((d) => { if (!alive) return; if (d) { setData(d); setState("ready"); } else setState("error"); })
      .catch(() => { if (alive) setState("error"); });
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    return () => { alive = false; clearTimeout(t); };
  }, [memberId, reloadTick]);

  if (state === "loading") return <DrawerSkeleton onClose={onClose} closeRef={closeRef} />;
  if (state === "error" || !data) {
    return (
      <div className="flex h-full flex-col">
        <DrawerBar onClose={onClose} closeRef={closeRef} />
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <p className="text-ink text-[15px] font-bold">לא הצלחנו לטעון את פרטי הסוכן</p>
            <button type="button" onClick={() => { setState("loading"); setReloadTick((n) => n + 1); }}
              className="bg-brand-soft text-brand-strong mt-3 rounded-xl px-4 py-2 text-[13px] font-bold">נסה שוב</button>
          </div>
        </div>
      </div>
    );
  }
  return <DrawerBody data={data} agents={agents} onClose={onClose} closeRef={closeRef} />;
}

function DrawerBar({ onClose, closeRef }: { onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <div className="border-line flex items-center justify-between border-b px-4 py-3">
      <span className="text-muted text-[12px] font-bold">ניהול סוכן</span>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="סגירה" className="text-muted hover:text-ink grid h-8 w-8 place-items-center rounded-lg"><Icon name="X" size={18} /></button>
    </div>
  );
}

function DrawerSkeleton({ onClose, closeRef }: { onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <div className="flex h-full flex-col">
      <DrawerBar onClose={onClose} closeRef={closeRef} />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3"><div className="bg-black/10 h-14 w-14 animate-pulse rounded-full" /><div className="flex-1 space-y-2"><div className="bg-black/10 h-4 w-32 animate-pulse rounded" /><div className="bg-black/[0.06] h-3 w-24 animate-pulse rounded" /></div></div>
        <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="bg-black/[0.06] h-14 animate-pulse rounded-xl" />)}</div>
        {[0, 1, 2].map((i) => <div key={i} className="bg-black/5 h-16 animate-pulse rounded-xl" />)}
      </div>
    </div>
  );
}

function DrawerBody({ data, agents, onClose, closeRef }: { data: OfficeAgentDetail; agents: OfficeAgentOption[]; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const { member, stats } = data;
  const needs = stats.overdueLeads + stats.stuckDeals + stats.overdueTasks;
  const others = agents.filter((a) => a.id !== member.id);

  return (
    <div className="flex h-full flex-col">
      <DrawerBar onClose={onClose} closeRef={closeRef} />
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-3">
          <AgentAvatar url={member.avatarUrl} name={member.name} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-ink truncate text-[18px] font-black">{member.name}</p>
            <p className="text-muted truncate text-[12px]">{member.specialty || ROLE_HE[member.role] || "מתווך/ת"}</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${member.hasLogin ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{data.accessLabel}</span>
          </div>
          <Link href={`/office/agents/${member.id}`} onClick={onClose} className="text-brand-strong shrink-0 text-[12px] font-bold hover:underline">עמוד מלא →</Link>
        </div>

        <div className="flex flex-col gap-5 px-4 pb-24">
          {/* Summary */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-4 gap-2">
              <Stat label="נכסים" value={stats.activeProperties} />
              <Stat label="לידים" value={stats.openLeads} />
              <Stat label="עסקאות" value={stats.activeDeals} />
              <Stat label="פגישות היום" value={stats.todayMeetings} />
            </div>
            <div className={`rounded-xl px-3 py-2 text-[12px] font-bold ${needs > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
              {needs > 0 ? `דורש טיפול: ${needs}` : "הכול תקין"}
            </div>
          </div>

          {/* Today */}
          <Section title="היום" icon="Calendar" count={data.meetingsToday.length}>
            {data.meetingsToday.length === 0 ? <Empty text="אין פגישות להיום" /> : (
              <ul className="flex flex-col gap-1.5">
                {data.meetingsToday.map((m) => (
                  <li key={m.id} className="border-line flex items-center gap-2.5 rounded-xl border px-3 py-2">
                    <span className="bg-brand-soft text-brand-strong shrink-0 rounded-lg px-2 py-1 text-[12px] font-black tabular-nums">{m.time}</span>
                    <span className="min-w-0"><span className="text-ink block truncate text-[13px] font-bold">{m.title}</span><span className="text-muted block truncate text-[11px]">{m.kind}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Needs attention */}
          <Section title="דורש טיפול" icon="Flame">
            {data.needsAttention.length === 0 ? <Empty text="הכול מסודר כרגע" tone="success" /> : (
              <ul className="flex flex-col gap-1.5">
                {data.needsAttention.map((n) => (
                  <li key={n.id}><Link href={n.href} onClick={onClose} className="border-line hover:bg-card flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition">
                    <span className="min-w-0"><span className="text-ink block truncate text-[12px] font-bold">{n.label}</span><span className="text-muted block truncate text-[11px]">{n.sub}</span></span>
                    <span className="text-brand-strong shrink-0 text-[11px] font-bold">פתח ←</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Section>

          {/* Properties */}
          <Section title="הנכסים של הסוכן" icon="Building" count={stats.activeProperties} action={stats.activeProperties > 0 ? <Link href="/properties" onClick={onClose} className="text-brand-strong text-[11px] font-bold hover:underline">כל הנכסים ←</Link> : undefined}>
            {data.properties.length === 0 ? <Empty text="אין נכסים משויכים לסוכן" /> : (
              <ul className="flex flex-col gap-1.5">
                {data.properties.slice(0, 4).map((p) => (
                  <li key={p.id}><Link href={p.href} onClick={onClose} className="border-line hover:bg-card flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition">
                    <span className="min-w-0"><span className="text-ink block truncate text-[13px] font-bold">{p.title}</span><span className="text-muted block truncate text-[11px]">{p.sub}</span></span>
                    <span className="shrink-0 text-left"><span className="text-ink block text-[12px] font-black">{p.price}</span><span className="text-muted block text-[10px]">{p.statusLabel}</span></span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Section>

          {/* Leads */}
          <Section title="לידים" icon="Users" count={stats.openLeads} action={<span className="text-muted text-[11px]">{stats.hotLeads} חמים · {stats.overdueLeads} באיחור</span>}>
            {data.leads.length === 0 ? <Empty text="אין לידים פתוחים" /> : (
              <ul className="flex flex-col gap-1.5">
                {data.leads.slice(0, 4).map((l) => (
                  <li key={l.id} className="border-line flex items-center gap-2 rounded-xl border px-3 py-1.5">
                    <Link href={`/leads/${l.id}`} onClick={onClose} className="min-w-0 flex-1"><span className="text-ink block truncate text-[13px] font-bold">{l.name}</span><span className="text-muted block truncate text-[11px]">{l.stage}</span></Link>
                    {l.hot && <span className="bg-warning-soft text-warning shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black">חם</span>}
                    {others.length > 0 && <AssignMemberPopover entityType="lead" entityId={l.id} agents={others} size="xs" label="העבר" />}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Deals */}
          <Section title="עסקאות" icon="Handshake" count={stats.activeDeals}>
            {data.deals.length === 0 ? <Empty text="אין עסקאות פעילות" /> : (
              <ul className="flex flex-col gap-1.5">
                {data.deals.slice(0, 3).map((d) => (
                  <li key={d.id}><Link href={d.href} onClick={onClose} className="border-line hover:bg-card flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition">
                    <span className="min-w-0"><span className="text-ink block truncate text-[13px] font-bold">{d.title}</span><span className="text-muted block truncate text-[11px]">{d.stage}{d.ageDays != null ? ` · ${d.ageDays} ימים` : ""}</span></span>
                    <span className="flex shrink-0 items-center gap-1.5">{d.stuck && <span className="bg-danger-soft text-danger rounded-full px-1.5 py-0.5 text-[10px] font-black">תקועה</span>}<span className="text-ink text-[12px] font-black">{ils(d.value)}</span></span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Section>

          {/* Recent activity */}
          {data.recentActivity.length > 0 && (
            <Section title="פעילות אחרונה" icon="ListChecks">
              <ul className="flex flex-col gap-1.5">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-1">
                    <span className="text-ink min-w-0 truncate text-[12px]">{a.label}</span>
                    <span className="text-muted shrink-0 text-[11px]">{a.when}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>

      {/* Sticky manager actions */}
      <div className="border-line bg-surface absolute inset-x-0 bottom-0 flex items-center gap-2 border-t px-4 py-3">
        <Link href="/calendar" onClick={onClose} className="border-line hover:bg-card text-ink inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-bold transition"><Icon name="Calendar" size={14} className="text-brand-strong" />יומן</Link>
        <Link href={`/office/agents/${member.id}`} onClick={onClose} className="border-line hover:bg-card text-ink inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-bold transition"><Icon name="Pencil" size={14} className="text-brand-strong" />ניהול פרופיל</Link>
        <span className="ms-auto text-muted text-[11px]">{member.hasLogin ? "" : "לסוכן אין גישה למערכת"}</span>
      </div>
    </div>
  );
}

function Empty({ text, tone = "muted" }: { text: string; tone?: "muted" | "success" }) {
  return <p className={`py-3 text-center text-[12px] ${tone === "success" ? "text-success font-bold" : "text-muted"}`}>{text}{tone === "success" ? " ✓" : ""}</p>;
}
