"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { setMatchStageAction, matchActionToTaskAction } from "@/lib/matching-intelligence/actions";
import { MATCH_STAGES, STAGE_LABELS, type MatchStage } from "@/lib/matching-intelligence/playbook";

export interface MatchBoardRow {
  id: string; buyerId: string; propertyId: string; buyerName: string; propertyName: string;
  stage: MatchStage; compatibility: number | null; closing: number | null; commission: number | null; risk: number | null;
}

// Operational pipeline columns (candidate is pre-pipeline; hidden by default).
const COLUMNS: MatchStage[] = MATCH_STAGES.filter((s) => s !== "candidate") as MatchStage[];
const ils = (n: number | null) => (n == null ? "" : `₪${n.toLocaleString("he-IL")}`);
const pct = (n: number | null) => (n == null ? "" : `${Math.round(n)}%`);

export function MatchesBoard({ rows }: { rows: MatchBoardRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bulkStage, setBulkStage] = useState<MatchStage>("file_sent");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.buyerName} ${r.propertyName}`.toLowerCase().includes(s)) : rows;
  }, [q, rows]);

  const byStage = useMemo(() => {
    const map = new Map<MatchStage, MatchBoardRow[]>();
    for (const col of COLUMNS) map.set(col, []);
    for (const r of filtered) { const arr = map.get(r.stage); if (arr) arr.push(r); }
    return map;
  }, [filtered]);

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSel = () => setSelected(new Set());

  const runBulk = async () => {
    if (!selected.size) return;
    setBusy(true); setNote(null);
    let ok = 0; const fails: string[] = [];
    for (const id of selected) {
      try { const res = await setMatchStageAction(id, bulkStage); if (res?.error) fails.push(res.error); else ok++; }
      catch (e) { fails.push(e instanceof Error ? e.message : "שגיאה"); }
    }
    setBusy(false); clearSel(); router.refresh();
    setNote(`${ok} עודכנו${fails.length ? ` · ${fails.length} נכשלו` : ""}`);
  };

  const advanceOne = async (id: string, stage: MatchStage) => {
    setBusy(true); setNote(null);
    try { const res = await setMatchStageAction(id, stage); if (res?.error) throw new Error(res.error); router.refresh(); setNote("השלב עודכן"); }
    catch (e) { setNote(e instanceof Error ? e.message : "העדכון נכשל"); }
    finally { setBusy(false); }
  };
  const makeTask = async (r: MatchBoardRow) => {
    setBusy(true); setNote(null);
    try { const res = await matchActionToTaskAction(r.id, r.buyerId, r.propertyId, `מעקב התאמה: ${r.buyerName} ← ${r.propertyName}`); if (res?.error) throw new Error(res.error); router.refresh(); setNote("נוצרה משימה"); }
    catch (e) { setNote(e instanceof Error ? e.message : "יצירת המשימה נכשלה"); }
    finally { setBusy(false); }
  };

  return (
    <section dir="rtl" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-lg"><Icon name="Layers" size={16} /></span>
          <h2 className="text-ink text-lg font-black">לוח התאמות</h2>
          <span className="text-muted text-[12px]">{filtered.length} התאמות</span>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש קונה / נכס" className="bg-surface border-line text-ink focus:border-brand-light h-9 w-56 rounded-xl border px-3 text-sm outline-none" />
      </div>

      {(selected.size > 0 || note) && (
        <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm">
          {selected.size > 0 && <>
            <span className="text-ink text-[13px] font-bold">{selected.size} נבחרו</span>
            <span className="text-muted text-[12px]">העבר לשלב:</span>
            <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value as MatchStage)} className="bg-surface border-line text-ink h-9 rounded-xl border px-2 text-sm outline-none">
              {COLUMNS.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <Button size="sm" loading={busy} onClick={runBulk}>החל על הנבחרים</Button>
            <Button size="sm" variant="ghost" onClick={clearSel}>נקה בחירה</Button>
          </>}
          {note && <span className="text-brand-strong text-[12px] font-bold">{note}</span>}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const items = byStage.get(col) ?? [];
          return (
            <div key={col} className="bg-surface/50 border-line flex min-w-[240px] max-w-[260px] shrink-0 flex-col gap-2 rounded-2xl border p-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-ink text-[13px] font-black">{STAGE_LABELS[col]}</span>
                <span className="text-muted text-[11px] font-bold">{items.length}</span>
              </div>
              {items.length === 0 ? <p className="text-muted px-1 py-2 text-[11px]">—</p> : items.map((r) => (
                <MatchCardBoard key={r.id} r={r} selected={selected.has(r.id)} onToggle={() => toggle(r.id)} busy={busy} onAdvance={advanceOne} onTask={() => makeTask(r)} />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MatchCardBoard({ r, selected, onToggle, busy, onAdvance, onTask }: {
  r: MatchBoardRow; selected: boolean; onToggle: () => void; busy: boolean;
  onAdvance: (id: string, stage: MatchStage) => void; onTask: () => void;
}) {
  return (
    <div className={`bg-card rounded-xl border p-2.5 shadow-sm ${selected ? "border-brand" : "border-line"}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <Link href={`/matches/${r.id}`} className="text-ink block truncate text-[12px] font-bold hover:underline">{r.buyerName} ← {r.propertyName}</Link>
          <p className="text-muted mt-0.5 text-[11px]">{pct(r.compatibility)}{r.closing != null ? ` · סגירה ${pct(r.closing)}` : ""}{r.commission ? ` · ${ils(r.commission)}` : ""}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <select defaultValue={r.stage} disabled={busy} onChange={(e) => onAdvance(r.id, e.target.value as MatchStage)} className="bg-surface border-line text-ink h-7 flex-1 rounded-lg border px-1 text-[11px] outline-none">
          {COLUMNS.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        <button onClick={onTask} disabled={busy} className="text-brand-strong text-[11px] font-bold disabled:opacity-50">+ משימה</button>
      </div>
    </div>
  );
}
