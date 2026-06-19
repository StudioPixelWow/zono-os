"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { recalcMatchesAction } from "@/lib/matching-intelligence/actions";
import { STAGE_LABELS, type MatchStage } from "@/lib/matching-intelligence/playbook";
import type { MatchBoard, MatchBoardItem } from "@/lib/matching-intelligence/service";

export interface MatchRow {
  id: string;
  label: string;
  compatibility: number;
  closing: number;
  opportunity: number;
  risk: number;
  stage: string;
  commission: number | null;
}

const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-danger");

function BoardCard({ icon, title, items, accent }: { icon: string; title: string; items: MatchBoardItem[]; accent: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><span className={cn("grid h-9 w-9 place-items-center rounded-xl", accent)}><Icon name={icon} size={18} /></span><p className="text-ink text-sm font-extrabold">{title}</p></div>
        <span className="text-ink text-2xl font-black">{items.length}</span>
      </div>
      {items.length === 0 ? <p className="text-muted py-3 text-center text-xs">—</p> : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 4).map((it) => (
            <li key={it.matchId}><Link href={`/matches/${it.matchId}`} className="hover:bg-surface flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition"><span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">{it.title}</span><span className="text-muted shrink-0 text-[11px] font-semibold">{it.meta}</span></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MatchesView({ rows, board }: { rows: MatchRow[]; board: MatchBoard }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const recalc = () => { setError(null); start(async () => { const r = await recalcMatchesAction(); if (r?.error) setError(r.error); }); };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-brand text-xs font-bold tracking-wide">Matching Intelligence OS · מוח העסקאות</p>
          <h1 className="text-ink text-2xl font-black">התאמות ועסקאות</h1>
        </div>
        <Button onClick={recalc} disabled={pending} leadingIcon={<Icon name="Sparkles" size={18} />}>{pending ? "מחשב…" : "חשב התאמות מחדש"}</Button>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {/* Revenue pipeline */}
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] px-5 py-4">
        <div><p className="text-muted text-xs font-semibold">צנרת הכנסות (משוקללת בהסתברות)</p><p className="text-brand-strong text-3xl font-black">{formatShekels(board.revenuePipeline)}</p></div>
        <p className="text-muted text-sm">{board.total} התאמות פעילות</p>
      </div>

      {/* Board */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BoardCard icon="Sparkles" title="הזדמנויות חמות" items={board.bestOpportunities} accent="bg-success-soft text-success" />
        <BoardCard icon="TrendingUp" title="הסתברות סגירה גבוהה" items={board.highestClosing} accent="bg-brand-soft text-brand" />
        <BoardCard icon="AlertTriangle" title="עסקאות בסיכון" items={board.dealsAtRisk} accent="bg-danger-soft text-danger" />
        <BoardCard icon="Clock" title="התאמות תקועות" items={board.stalled} accent="bg-warning-soft text-warning" />
      </div>

      {rows.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Sparkles" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין התאמות עדיין</p>
          <p className="text-muted max-w-sm text-sm">לחיצה על ״חשב התאמות מחדש״ — ZONO יצליב בין קונים לנכסים פעילים וייצר עסקאות פוטנציאליות עם הסתברות סגירה.</p>
          <Button onClick={recalc} disabled={pending} leadingIcon={<Icon name="Sparkles" size={18} />}>חשב התאמות</Button>
        </div>
      ) : (
        <div className="bg-card border-line overflow-x-auto rounded-[20px] border">
          <table className="w-full min-w-[680px] text-start text-sm">
            <thead className="text-muted border-line border-b text-xs"><tr>{["התאמה", "שלב", "התאמה", "סגירה", "הזדמנות", "עמלה"].map((h) => <th key={h} className="px-4 py-3 text-start font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-line hover:bg-surface border-b last:border-0">
                  <td className="px-4 py-3"><Link href={`/matches/${m.id}`} className="text-ink hover:text-brand font-bold">{m.label}</Link></td>
                  <td className="text-muted px-4 py-3">{STAGE_LABELS[m.stage as MatchStage] ?? m.stage}</td>
                  <td className={cn("px-4 py-3 font-bold", tone(m.compatibility))}>{m.compatibility}</td>
                  <td className={cn("px-4 py-3 font-bold", tone(m.closing))}>{m.closing}%</td>
                  <td className={cn("px-4 py-3 font-bold", tone(m.opportunity))}>{m.opportunity}</td>
                  <td className="text-muted px-4 py-3">{m.commission ? formatShekels(m.commission) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
