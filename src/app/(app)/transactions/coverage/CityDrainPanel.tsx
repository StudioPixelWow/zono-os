"use client";
// ============================================================================
// ZONO — "Pull all cities" live drain panel. Loops the small timeout-safe batch
// sync until no pending targets remain, showing live progress: what's been
// pulled, total transactions, and how many areas are left. User-controlled
// (start / stop). Real data only — each batch is a real GovMap pull.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { syncAllCitiesTransactionsAction, getCityCoverageProgressAction } from "@/lib/transactions/actions";
import type { CityCoverageProgress } from "@/lib/transactions/service";

export function CityDrainPanel() {
  const [progress, setProgress] = useState<CityCoverageProgress | null>(null);
  const [draining, setDraining] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPulled, setLastPulled] = useState<string[]>([]);
  const stopRef = useRef(false);

  const loadProgress = async () => {
    const p = await getCityCoverageProgressAction();
    if (p && !("error" in p)) setProgress(p);
  };
  useEffect(() => {
    let alive = true;
    getCityCoverageProgressAction().then((p) => { if (alive && p && !("error" in p)) setProgress(p); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const stop = () => { stopRef.current = true; setDraining(false); };

  const drain = async () => {
    setError(null); setNote(null); setDraining(true); stopRef.current = false;
    let guard = 0; // hard cap on iterations to avoid runaway
    while (!stopRef.current && guard < 60) {
      guard++;
      const r = await syncAllCitiesTransactionsAction();
      if (r.fatalError) { setError(r.fatalError); break; }
      if (r.needsConfig) { setError("נדרש להגדיר APIFY_TOKEN בסביבת השרת."); break; }
      if (r.citiesList?.length) setLastPulled(r.citiesList.slice(0, 6));
      setNote(`נמשכו ${r.targetsSynced} אזורים (${r.imported} עסקאות חדשות) · נותרו ${r.pendingRemaining}`);
      await loadProgress();
      if (r.pendingRemaining <= 0) { setNote("הסנכרון הושלם — כל הערים נמשכו ✓"); break; }
      await new Promise((res) => setTimeout(res, 800)); // breathe between batches
    }
    setDraining(false); stopRef.current = false;
  };

  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="border-line bg-gradient-to-bl from-brand-soft/40 to-card rounded-[20px] border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-brand">{draining ? <Icon name="Loader" size={20} className="animate-spin" /> : <Icon name="Building2" size={20} />}</span>
          <div>
            <p className="text-ink text-sm font-black">משיכת עסקאות לכל הערים</p>
            <p className="text-muted text-xs">מושך מנות קטנות עד שכל הערים מכוסות — אפשר לעצור בכל רגע.</p>
          </div>
        </div>
        {draining
          ? <button onClick={stop} className="border-line bg-card text-danger inline-flex h-10 items-center gap-1.5 rounded-xl border px-4 text-sm font-bold hover:shadow"><Icon name="X" size={15} /> עצור</button>
          : <button onClick={drain} className="btn-zono-primary zono-focus-ring inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold"><Icon name="Sparkles" size={16} /> משוך הכל אוטומטית</button>}
      </div>

      {progress && (
        <>
          <div className="mt-4">
            <div className="text-muted mb-1 flex justify-between text-xs font-semibold">
              <span>{completed} מתוך {total} אזורים נמשכו{progress.pending ? ` · ${progress.pending} ממתינים` : ""}{progress.failed ? ` · ${progress.failed} נכשלו` : ""}</span>
              <span>{pct}%</span>
            </div>
            <div className="bg-line/50 h-2.5 w-full overflow-hidden rounded-full">
              <div className="zono-gradient-glow h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-4">
            <Stat label="עסקאות במאגר" value={progress.transactionsTotal.toLocaleString("he-IL")} accent />
            <Stat label="הושלמו" value={String(completed)} />
            <Stat label="ממתינים" value={String(progress.pending)} />
            <Stat label="נכשלו" value={String(progress.failed)} />
          </div>
          {(lastPulled.length > 0 || progress.recentCities.length > 0) && (
            <div className="mt-3">
              <p className="text-muted mb-1 text-[11px] font-bold">נמשכו לאחרונה</p>
              <div className="flex flex-wrap gap-1.5">
                {(progress.recentCities.length ? progress.recentCities.map((c) => `${c.city} (${c.found})`) : lastPulled).map((c) => (
                  <span key={c} className="bg-card text-ink rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold">{c}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {note && <p className="text-brand-strong mt-3 text-xs font-semibold">{note}</p>}
      {error && <p className="text-danger mt-3 text-xs font-semibold">{error}</p>}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-2", accent ? "border-brand bg-brand-soft" : "border-line/60 bg-card/70")}>
      <p className={cn("text-base font-black", accent ? "text-brand-strong" : "text-ink")}>{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
