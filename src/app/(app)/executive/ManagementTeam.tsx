"use client";
// ============================================================================
// Management cockpit — TEAM performance (client). A compact leaderboard (not a
// giant table) with a ביצועים / דורשים-תשומת-לב toggle. Clicking an agent opens
// the CANONICAL AgentManagerDrawer in-place (no navigation, no dashboard reload),
// reusing the existing office roster drawer + its cached detail loader. Ranking
// is precomputed server-side (two ordered lists passed in); this component only
// toggles which to show — no business scoring in React.
// ============================================================================
import { useMemo, useState } from "react";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { AgentManagerDrawer } from "@/app/(app)/office/AgentManagerDrawer";
import type { OfficeAgentCard, OfficeAgentOption } from "@/lib/office/management-board";
import type { OfficeAgentDetail } from "@/lib/office/agent-detail";
import type { TeamRow } from "@/lib/management/cockpit";

export function ManagementTeam({ performance, attention, cards, agentOptions, total }: {
  performance: TeamRow[]; attention: TeamRow[]; cards: OfficeAgentCard[]; agentOptions: OfficeAgentOption[]; total: number;
}) {
  const [mode, setMode] = useState<"performance" | "attention">("performance");
  const [openId, setOpenId] = useState<string | null>(null);
  const [cache] = useState(() => new Map<string, OfficeAgentDetail>());
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const rows = mode === "performance" ? performance : attention;
  const maxAct = Math.max(1, ...performance.map((r) => r.activityScore));

  return (
    <div className="border-line bg-card rounded-2xl border p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-ink text-base font-black tracking-tight sm:text-lg">ביצועי הצוות</h2>
          <p className="text-muted mt-0.5 text-xs">פעילות אמת (עסקאות · פגישות · לידים) — לא יעדים</p>
        </div>
        <div className="border-line flex overflow-hidden rounded-lg border text-xs">
          {(["performance", "attention"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1 font-bold transition ${mode === m ? "bg-brand text-white" : "bg-card text-muted hover:text-ink"}`}>{m === "performance" ? "ביצועים" : "דורשים תשומת לב"}</button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border-line text-muted rounded-xl border border-dashed p-5 text-center text-xs">אין סוכנים להצגה.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const card = cardById.get(r.id);
            return (
              <button key={r.id} onClick={() => card && setOpenId(r.id)} className="border-line hover:border-brand-light hover:bg-surface flex items-center gap-3 rounded-xl border p-2.5 text-right transition">
                <span className="text-muted w-4 shrink-0 text-center text-xs font-black tabular-nums">{i + 1}</span>
                <AgentAvatar name={r.name} url={r.avatarUrl} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm font-black">{r.name}</span>
                  <span className="text-muted block truncate text-[11px]">{r.activeDeals} עסקאות · {r.todayMeetings} פגישות · {r.openLeads} לידים</span>
                </span>
                {mode === "attention" && r.attention > 0
                  ? <span className="bg-danger-soft text-danger shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold">{r.attention} דורש טיפול</span>
                  : <span className="w-20 shrink-0"><span className="bg-surface block h-1.5 overflow-hidden rounded-full"><span className="bg-brand block h-full rounded-full" style={{ width: `${(r.activityScore / maxAct) * 100}%` }} /></span></span>}
              </button>
            );
          })}
          {total > rows.length && <p className="text-muted pt-1 text-center text-[11px]">מציג {rows.length} מתוך {total} סוכנים</p>}
        </div>
      )}

      <AgentManagerDrawer memberId={openId} card={openId ? cardById.get(openId) ?? null : null} agents={agentOptions} cache={cache} onClose={() => setOpenId(null)} />
    </div>
  );
}
