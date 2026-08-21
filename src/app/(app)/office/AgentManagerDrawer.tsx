"use client";
// ============================================================================
// ZONO — Agent Manager Drawer (manager QUICK VIEW). A compact, premium side sheet
// opened from an /office agent card: who the agent is, their workload, what needs
// attention, what's on today, and where to drill in — in 3–5 seconds, without
// leaving /office. NOT a full CRM page in a panel. Data is lazy-loaded per agent
// via the canonical getOfficeAgentDetail selector (org-scoped, manager-gated).
// The click→open mechanism is LOCAL state (never URL-only) — do not revert it.
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
const ils = (n: number | null) => (n == null ? "—" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${n}`);

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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div className="bg-surface absolute inset-y-0 start-0 flex h-[100dvh] w-full max-w-[620px] flex-col shadow-2xl sm:w-[84vw] md:w-[600px]">
        <DrawerContent key={memberId} memberId={memberId} agents={agents} onClose={onClose} />
      </div>
    </div>
  );
}

function DrawerContent({ memberId, agents, onClose }: { memberId: string; agents: OfficeAgentOption[]; onClose: () => void }) {
  const [data, setData] = useState<OfficeAgentDetail | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [reloadTick, setReloadTick] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    loadOfficeAgentDetailAction(memberId)
      .then((d) => { if (!alive) return; if (d) { setData(d); setState("ready"); } else setState("error"); })
      .catch(() => { if (alive) setState("error"); });
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    return () => { alive = false; clearTimeout(t); };
  }, [memberId, reloadTick]);

  if (state === "loading") return <Skeleton onClose={onClose} closeRef={closeRef} />;
  if (state === "error" || !data) {
    return (
      <div className="flex h-full flex-col">
        <TopBar onClose={onClose} closeRef={closeRef} />
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <p className="text-ink text-[15px] font-bold">לא הצלחנו לטעון את פרטי הסוכן</p>
            <button type="button" onClick={() => { setState("loading"); setReloadTick((n) => n + 1); }} className="bg-brand-soft text-brand-strong mt-3 rounded-xl px-4 py-2 text-[13px] font-bold">נסה שוב</button>
          </div>
        </div>
      </div>
    );
  }
  return <Body data={data} agents={agents} onClose={onClose} closeRef={closeRef} />;
}

// ── Chrome ────────────────────────────────────────────────────────────────────
function TopBar({ onClose, closeRef }: { onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <div className="border-line flex items-center justify-between border-b px-4 py-2.5">
      <span className="text-muted text-[12px] font-bold">ניהול סוכן</span>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="סגירה" className="text-muted hover:text-ink grid h-8 w-8 place-items-center rounded-lg"><Icon name="X" size={18} /></button>
    </div>
  );
}

function Header({ member, accessLabel, onClose, closeRef }: { member: OfficeAgentDetail["member"]; accessLabel: string; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <div className="border-line bg-surface flex items-start gap-3 border-b px-4 py-3.5">
      <AgentAvatar url={member.avatarUrl} name={member.name} size={64} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-ink truncate text-[17px] font-black leading-tight">{member.name}</p>
        <p className="text-muted truncate text-[12.5px]">{member.specialty || ROLE_HE[member.role] || "מתווך/ת"}</p>
        <span className={`mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold ${member.hasLogin ? "text-success" : "text-warning"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${member.hasLogin ? "bg-success" : "bg-warning"}`} />{accessLabel}
        </span>
      </div>
      <div className="flex flex-col items-end gap-2">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="סגירה" className="text-muted hover:text-ink grid h-8 w-8 place-items-center rounded-lg"><Icon name="X" size={18} /></button>
        <Link href={`/office/agents/${member.id}`} onClick={onClose} className="text-brand-strong text-[12px] font-bold hover:underline">עמוד מלא →</Link>
      </div>
    </div>
  );
}

function SecHead({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-ink text-[13px] font-black">{title}{count != null && <span className="text-muted font-semibold"> · {count}</span>}</h3>
      {action}
    </div>
  );
}
const More = ({ href, label, onClose }: { href: string; label: string; onClose: () => void }) => (
  <Link href={href} onClick={onClose} className="text-brand-strong text-[11.5px] font-bold hover:underline">{label}</Link>
);
const Empty = ({ text }: { text: string }) => <p className="text-muted py-1.5 text-[12px]">{text}</p>;

// ── Body ──────────────────────────────────────────────────────────────────────
function Body({ data, agents, onClose, closeRef }: { data: OfficeAgentDetail; agents: OfficeAgentOption[]; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const { member, stats } = data;
  const [showAllAttn, setShowAllAttn] = useState(false);
  const others = agents.filter((a) => a.id !== member.id);
  const needs = stats.overdueLeads + stats.stuckDeals + stats.overdueTasks;
  const breakdown = [
    stats.overdueLeads ? `${stats.overdueLeads} לידים` : null,
    stats.overdueTasks ? `${stats.overdueTasks} משימות` : null,
    stats.stuckDeals ? `${stats.stuckDeals} עסקאות` : null,
  ].filter(Boolean).join(" · ");
  const attn = showAllAttn ? data.needsAttention : data.needsAttention.slice(0, 3);
  const agentPage = `/office/agents/${member.id}`;

  return (
    <div className="flex h-full flex-col">
      <Header member={member} accessLabel={data.accessLabel} onClose={onClose} closeRef={closeRef} />

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {/* Executive KPI strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi n={stats.activeProperties} label="נכסים" />
          <Kpi n={stats.openLeads} label="לידים" />
          <Kpi n={stats.activeDeals} label="עסקאות" />
          <Kpi n={stats.todayMeetings} label="היום" />
        </div>

        {/* Attention summary */}
        <div className="border-line flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-ink text-[13px] font-black">דורש תשומת לב</div>
            {needs > 0 && breakdown && <div className="text-muted truncate text-[11.5px]">{breakdown}</div>}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-black ${needs > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>{needs > 0 ? `${needs} פריטים` : "הכול תקין"}</span>
        </div>

        {/* Today */}
        <section>
          <SecHead title="היום" count={data.meetingsToday.length || undefined} />
          {data.meetingsToday.length === 0 ? <Empty text="אין פגישות נוספות להיום" /> : (
            <ul className="flex flex-col gap-1">
              {data.meetingsToday.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 py-1">
                  <span className="bg-brand-soft text-brand-strong shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-black tabular-nums">{m.time}</span>
                  <span className="min-w-0 flex-1"><span className="text-ink block truncate text-[13px] font-bold">{m.title}</span></span>
                  <span className="text-muted shrink-0 text-[11px]">{m.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Needs attention — prioritized, max 3 then expand-in-place */}
        <section>
          <SecHead title="דורש טיפול" count={data.needsAttention.length || undefined} />
          {data.needsAttention.length === 0 ? <Empty text="הכול מסודר כרגע ✓" /> : (
            <ul className="flex flex-col gap-1">
              {attn.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} onClick={onClose} className="hover:bg-card group flex items-start gap-2 rounded-lg px-1.5 py-1.5 transition">
                    <span className="bg-danger mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                    <span className="min-w-0 flex-1"><span className="text-ink block truncate text-[12.5px] font-bold">{n.label}</span><span className="text-muted block truncate text-[11px]">{n.sub}</span></span>
                    <span className="text-brand-strong shrink-0 self-center text-[11px] font-bold">פתח →</span>
                  </Link>
                </li>
              ))}
              {data.needsAttention.length > 3 && (
                <li><button type="button" onClick={() => setShowAllAttn((v) => !v)} className="text-brand-strong px-1.5 py-1 text-[11.5px] font-bold hover:underline">{showAllAttn ? "הצג פחות" : `הצג עוד ${data.needsAttention.length - 3}`}</button></li>
              )}
            </ul>
          )}
        </section>

        {/* Portfolio preview — with thumbnails */}
        <section>
          <SecHead title="נכסי הסוכן" count={stats.activeProperties || undefined} action={stats.activeProperties > 0 ? <More href={agentPage} label={`כל הנכסים (${stats.activeProperties}) →`} onClose={onClose} /> : undefined} />
          {data.properties.length === 0 ? <Empty text="אין נכסים משויכים לסוכן" /> : (
            <ul className="flex flex-col gap-2">
              {data.properties.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <Link href={p.href} onClick={onClose} className="border-line hover:bg-card flex items-stretch gap-2.5 overflow-hidden rounded-xl border transition">
                    <span className="bg-card relative aspect-square w-[76px] shrink-0 overflow-hidden">
                      {p.image ? <img src={p.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="text-muted grid h-full w-full place-items-center"><Icon name="Building" size={22} /></span>}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pe-2.5">
                      <span className="text-ink line-clamp-1 text-[13px] font-bold">{p.title}</span>
                      <span className="text-muted line-clamp-1 text-[11px]">{p.sub}</span>
                      <span className="flex items-center gap-2"><span className="text-ink text-[12.5px] font-black">{p.price}</span><span className="text-muted text-[10.5px]">{p.statusLabel}</span></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Leads preview */}
        <section>
          <SecHead title="לידים" count={stats.openLeads || undefined} action={stats.openLeads > 3 ? <More href={agentPage} label={`כל הלידים (${stats.openLeads}) →`} onClose={onClose} /> : undefined} />
          {data.leads.length === 0 ? <Empty text="אין לידים פתוחים" /> : (
            <ul className="flex flex-col gap-1">
              {data.leads.slice(0, 3).map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-0.5">
                  <Link href={`/leads/${l.id}`} onClick={onClose} className="min-w-0 flex-1"><span className="text-ink block truncate text-[13px] font-bold">{l.name}</span><span className="text-muted block truncate text-[11px]">{l.stage}</span></Link>
                  {l.hot && <span className="bg-warning-soft text-warning shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black">חם</span>}
                  {others.length > 0 && <AssignMemberPopover entityType="lead" entityId={l.id} agents={others} size="xs" label="העבר" />}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Deals preview */}
        <section>
          <SecHead title="עסקאות" count={stats.activeDeals || undefined} action={stats.activeDeals > 3 ? <More href={agentPage} label="כל העסקאות →" onClose={onClose} /> : undefined} />
          {data.deals.length === 0 ? <Empty text="אין עסקאות פעילות" /> : (
            <ul className="flex flex-col gap-1">
              {data.deals.slice(0, 3).map((d) => (
                <li key={d.id}>
                  <Link href={d.href} onClick={onClose} className="hover:bg-card flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 transition">
                    <span className="min-w-0"><span className="text-ink block truncate text-[13px] font-bold">{d.title}</span><span className="text-muted block truncate text-[11px]">{d.stage}{d.ageDays != null ? ` · ${d.ageDays} ימים` : ""}</span></span>
                    <span className="flex shrink-0 items-center gap-1.5">{d.stuck && <span className="bg-danger-soft text-danger rounded-full px-1.5 py-0.5 text-[10px] font-black">תקועה</span>}<span className="text-ink text-[12.5px] font-black">{ils(d.value)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent activity — light timeline, near the bottom */}
        {data.recentActivity.length > 0 && (
          <section>
            <SecHead title="פעילות אחרונה" />
            <ul className="flex flex-col gap-1.5 ps-1">
              {data.recentActivity.slice(0, 3).map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span className="bg-brand-light mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1"><span className="text-ink block truncate text-[12px]">{a.label}</span><span className="text-muted text-[10.5px]">{a.when}</span></span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Sticky quick actions */}
      <div className="border-line bg-surface flex items-center gap-2 border-t px-4 py-3">
        <Link href={agentPage} onClick={onClose} className="bg-brand text-white inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-bold transition hover:opacity-90"><Icon name="ArrowLeft" size={14} />פתח עמוד סוכן</Link>
        <Link href="/calendar" onClick={onClose} className="border-line hover:bg-card text-ink inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-bold transition"><Icon name="Calendar" size={14} className="text-brand-strong" />יומן</Link>
      </div>
    </div>
  );
}

function Kpi({ n, label }: { n: number; label: string }) {
  return (
    <div className="bg-card border-line rounded-xl border px-2 py-2 text-center">
      <div className="text-ink text-lg font-black leading-none tabular-nums">{n}</div>
      <div className="text-muted mt-1 text-[11px] font-semibold">{label}</div>
    </div>
  );
}

function Skeleton({ onClose, closeRef }: { onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <div className="flex h-full flex-col">
      <TopBar onClose={onClose} closeRef={closeRef} />
      <div className="flex flex-col gap-5 p-4">
        <div className="flex items-center gap-3"><div className="bg-black/10 h-16 w-16 animate-pulse rounded-full" /><div className="flex-1 space-y-2"><div className="bg-black/10 h-4 w-32 animate-pulse rounded" /><div className="bg-black/[0.06] h-3 w-24 animate-pulse rounded" /><div className="bg-black/[0.06] h-3 w-20 animate-pulse rounded" /></div></div>
        <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="bg-black/[0.06] h-14 animate-pulse rounded-xl" />)}</div>
        <div className="bg-black/[0.06] h-12 animate-pulse rounded-xl" />
        {[0, 1, 2].map((i) => <div key={i} className="bg-black/[0.05] h-16 animate-pulse rounded-xl" />)}
      </div>
    </div>
  );
}
