"use client";
// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph explorer view (RTL). PHASE 51.0.
// Org overview (counts by kind, most-connected entities, strongest edges) +
// drill into any entity's evidence-backed connections via the reusable panel.
// ============================================================================
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { EntityRelationshipsPanel } from "@/components/universal-graph/EntityRelationshipsPanel";
import type { UniversalGraphOverview } from "@/lib/universal-graph/types";

const confCls = (v: number) => (v >= 70 ? "bg-success-soft text-success" : v >= 45 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger");

export function RelationshipsExplorerView({ overview }: { overview: UniversalGraphOverview | null }) {
  const [sel, setSel] = useState<{ kind: string; id: string; name: string } | null>(null);

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO · גרף הידע האוניברסלי</p>
        <h1 className="text-ink mt-1 text-2xl font-black">🌐 גרף הקשרים</h1>
        <p className="text-muted mt-1 text-sm leading-relaxed">כל הישויות במערכת מחוברות בקשרים מבוססי ראיות — עם חוזק, ביטחון, טריות ואימות. בחר ישות כדי לראות את הקשרים שלה.</p>
      </div>

      {!overview || !overview.hasData ? (
        <div className="bg-card border-line mt-4 flex flex-col items-center gap-2 rounded-[20px] border p-8 text-center">
          <span className="bg-surface grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Route" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין קשרים מתועדים</p>
          <p className="text-muted max-w-sm text-sm">{overview?.notes[0] ?? "הקשרים ייבנו אוטומטית ככל שתירשם פעילות: שיחות, התאמות, פגישות, קמפיינים ופרסום."}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Counts */}
          <div className="bg-card border-line rounded-[20px] border p-4">
            <div className="mb-3 flex items-center gap-2"><span className="text-brand"><Icon name="Layers" size={16} /></span><h2 className="text-ink text-sm font-extrabold">היקף הגרף</h2></div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="ישויות" value={overview.counts.nodes} />
              <Stat label="קשרים" value={overview.counts.edges} />
            </div>
            {overview.counts.byKind.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {overview.counts.byKind.slice(0, 12).map((k) => <span key={k.kind} className="bg-surface text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">{k.kindHe} · {k.count}</span>)}
              </div>
            )}
          </div>

          {/* Most connected */}
          {overview.topConnected.length > 0 && (
            <div className="bg-card border-line rounded-[20px] border p-4">
              <div className="mb-3 flex items-center gap-2"><span className="text-brand"><Icon name="Star" size={16} /></span><h2 className="text-ink text-sm font-extrabold">הישויות המקושרות ביותר</h2></div>
              <div className="space-y-2">
                {overview.topConnected.map((n) => (
                  <button key={n.id} onClick={() => setSel({ kind: n.kind, id: n.id, name: n.name })} className={cn("bg-surface hover:border-brand-light border-line flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-right transition", sel?.id === n.id && "border-brand-light")}>
                    <div className="min-w-0"><p className="text-ink truncate text-[13px] font-bold">{n.name}</p><p className="text-muted text-[11px]">{n.kindHe}</p></div>
                    <span className="bg-brand-soft text-brand shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">{n.degree} קשרים</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Strongest edges */}
          {overview.strongestEdges.length > 0 && (
            <div className="bg-card border-line rounded-[20px] border p-4">
              <div className="mb-3 flex items-center gap-2"><span className="text-brand"><Icon name="TrendingUp" size={16} /></span><h2 className="text-ink text-sm font-extrabold">הקשרים החזקים ביותר</h2></div>
              <div className="space-y-2">
                {overview.strongestEdges.map((e, i) => (
                  <div key={i} className="bg-surface flex items-center justify-between gap-2 rounded-xl p-3">
                    <div className="min-w-0"><p className="text-ink truncate text-[13px] font-bold">{e.name} <span className="text-muted font-normal">· {e.kindHe}</span></p>{e.evidence[0] && <p className="text-muted truncate text-[11px]">📎 {e.evidence[0]}</p>}</div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", confCls(e.confidence))}>ביטחון {e.confidence}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {overview.notes.map((n, i) => <p key={i} className="text-muted text-[11px]">🔒 {n}</p>)}
        </div>
      )}

      {/* Drill-in panel (remounts per selection) */}
      {sel && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-ink text-sm font-extrabold">קשרים של {sel.name}</h2><button onClick={() => setSel(null)} className="text-muted hover:text-ink"><Icon name="X" size={18} /></button></div>
          <EntityRelationshipsPanel key={sel.id} entityType={sel.kind} entityId={sel.id} entityName={sel.name} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="bg-surface rounded-2xl p-3 text-center"><div className="text-brand text-xl font-black">{value}</div><div className="text-muted text-[11px] font-bold">{label}</div></div>;
}
