"use client";
import { Trophy, TrendingUp, AlertTriangle } from "lucide-react";
import type { LeaderboardBuckets, AgentMetrics } from "@/lib/office-intelligence/types";

function List({ title, icon, agents, tone }: { title: string; icon: React.ReactNode; agents: AgentMetrics[]; tone: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3">
      <h3 className={`mb-2 flex items-center gap-1.5 text-[13px] font-black ${tone}`}>{icon} {title}</h3>
      {agents.length === 0 ? <p className="text-[12px] text-ink/40">—</p> : (
        <ol className="flex flex-col gap-1">
          {agents.map((a, i) => (
            <li key={a.agentId} className="flex items-center gap-2 text-[12px]">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-soft text-[10px] font-black text-brand-strong">{i + 1}</span>
              <span className="truncate font-bold text-ink">{a.name}</span>
              <span className="ms-auto font-black text-brand-strong">{a.leaderboardScore}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function OfficeLeaderboard({ leaderboard }: { leaderboard: LeaderboardBuckets }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-black text-ink">לוח מובילים</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        <List title="מצטיינים" icon={<Trophy size={14} />} agents={leaderboard.topPerformers} tone="text-amber-600" />
        <List title="במגמת עלייה" icon={<TrendingUp size={14} />} agents={leaderboard.risingAgents} tone="text-emerald-600" />
        <List title="דורשים תשומת לב" icon={<AlertTriangle size={14} />} agents={leaderboard.needingAttention} tone="text-red-600" />
      </div>
    </section>
  );
}
