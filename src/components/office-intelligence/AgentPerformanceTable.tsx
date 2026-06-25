"use client";
import { useState } from "react";
import type { AgentMetrics } from "@/lib/office-intelligence/types";

type SortKey = "leaderboardScore" | "meetings" | "calls" | "conversionRate" | "overdueTasks" | "exclusivesSigned";
const COLS: { key: SortKey; label: string }[] = [
  { key: "leaderboardScore", label: "ציון" }, { key: "exclusivesSigned", label: "בלעדיות" },
  { key: "meetings", label: "פגישות" }, { key: "calls", label: "שיחות" },
  { key: "conversionRate", label: "המרה" }, { key: "overdueTasks", label: "באיחור" },
];

export function AgentPerformanceTable({ agents }: { agents: AgentMetrics[] }) {
  const [sort, setSort] = useState<SortKey>("leaderboardScore");
  const [q, setQ] = useState("");
  const rows = agents
    .filter((a) => !q || a.name.includes(q))
    .sort((x, y) => (y[sort] as number) - (x[sort] as number));

  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-ink">ביצועי סוכנים</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש סוכן…" className="w-40 rounded-lg border border-black/10 px-2 py-1 text-xs font-semibold" />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין נתוני סוכנים פעילים היום.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[12px]">
            <thead>
              <tr className="text-ink/55">
                <th className="px-2 py-1 font-bold">סוכן</th>
                {COLS.map((c) => (
                  <th key={c.key} className="cursor-pointer px-2 py-1 font-bold hover:text-brand-strong" onClick={() => setSort(c.key)}>
                    {c.label}{sort === c.key ? " ▾" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.agentId} className="border-t border-black/5">
                  <td className="px-2 py-1.5 font-bold text-ink">{a.name}</td>
                  <td className="px-2 py-1.5 font-black text-brand-strong">{a.leaderboardScore}</td>
                  <td className="px-2 py-1.5">{a.exclusivesSigned}</td>
                  <td className="px-2 py-1.5">{a.meetings}</td>
                  <td className="px-2 py-1.5">{a.calls}</td>
                  <td className="px-2 py-1.5">{Math.round(a.conversionRate * 100)}%</td>
                  <td className={`px-2 py-1.5 ${a.overdueTasks > 0 ? "font-bold text-red-600" : ""}`}>{a.overdueTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
