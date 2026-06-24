"use client";
// ============================================================================
// ZONO Buyer Demand Intelligence — command center (RTL, premium glass).
// Opportunity Center ("מה חסר לי במלאי?") · acquisition signals · demand
// clusters · demand heatmap data · full explainability. Real data only.
// ============================================================================
import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { recomputeDemandAction, dismissAcquisitionSignalAction } from "@/lib/demand/actions";
import { DEMAND_BAND_LABEL, GAP_BAND_LABEL } from "@/lib/demand/types";
import type { DemandCommandCenter, StoredCluster, StoredSignal } from "@/lib/demand/service";
import type { HeatmapCell } from "@/lib/demand/types";

const ils = (n: number | null | undefined) => (n == null ? "—" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M ₪` : `₪${Math.round(n).toLocaleString("he-IL")}`);
const gapColor = (band: string) => band === "critical" ? "text-red-600" : band === "very_high" ? "text-orange-600" : band === "high" ? "text-amber-600" : band === "medium" ? "text-yellow-600" : "text-emerald-600";
const gapBg = (band: string) => band === "critical" ? "bg-red-50 border-red-200" : band === "very_high" ? "bg-orange-50 border-orange-200" : band === "high" ? "bg-amber-50 border-amber-200" : band === "medium" ? "bg-yellow-50 border-yellow-200" : "bg-emerald-50 border-emerald-200";

export function DemandCommandCenterView({ data }: { data: DemandCommandCenter | null }) {
  const runner = useActionRunner();
  const [open, setOpen] = useState<string | null>(null);

  const recompute = () => runner.run(async () => {
    const r = await recomputeDemandAction();
    return { ok: r.ok, message: r.ok ? `נותחו ${r.data.buyers} קונים · ${r.data.clusters} אשכולות · ${r.data.signals} הזדמנויות` : r.error };
  }, { id: "recompute", pendingMessage: "מנתח ביקוש מנתוני אמת…", success: (r) => r.message });

  const recomputeBtn = (
    <button onClick={recompute} disabled={runner.busyId === "recompute"}
      className="btn-zono-primary zono-focus-ring inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-60">
      <Icon name="RefreshCw" size={15} className={runner.busyId === "recompute" ? "animate-spin" : ""} /> נתח ביקוש
    </button>
  );

  if (!data || data.empty) {
    return (
      <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-12 text-center">
        <span className="zono-gradient-glow mx-auto mb-4 grid h-14 w-14 place-items-center rounded-3xl text-white"><Icon name="Users" size={26} /></span>
        <h1 className="text-ink text-2xl font-black">מודיעין ביקוש קונים</h1>
        <p className="text-muted mx-auto mt-2 max-w-md">
          {data ? "אין עדיין קונים במערכת. הוסף קונים כדי שZONO יזהה ביקוש, חוסרי מלאי והזדמנויות גיוס — הכל מנתוני אמת בלבד." : "טעינת הנתונים נכשלה."}
        </p>
        {runner.error && <p className="mt-3 text-sm font-semibold text-red-600">{runner.error}</p>}
        <div className="mt-5 flex justify-center">{recomputeBtn}</div>
      </main>
    );
  }

  const t = data.totals;

  return (
    <main dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="zono-gradient-glow grid h-11 w-11 place-items-center rounded-2xl text-white"><Icon name="Flame" size={22} /></span>
          <div>
            <h1 className="text-ink text-2xl font-black">מודיעין ביקוש קונים</h1>
            <p className="text-muted text-sm">מה הקונים רוצים, איפה, ומה חסר במלאי — נכסים שצריכים להתקיים אך עדיין לא קיימים.</p>
          </div>
        </div>
        {recomputeBtn}
      </header>

      {(runner.note || runner.error) && (
        <div className={cn("mb-4 rounded-xl border px-4 py-2 text-sm font-semibold", runner.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
          {runner.error ?? runner.note}
        </div>
      )}

      {/* Totals */}
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="קונים" value={t.buyers} icon="Users" />
        <Stat label="פרופילי ביקוש" value={t.activeProfiles} icon="Fingerprint" />
        <Stat label="אשכולות ביקוש" value={t.clusters} icon="LayoutGrid" />
        <Stat label="הזדמנויות גיוס" value={t.openSignals} icon="Target" accent />
        <Stat label="חוסרים במלאי" value={t.missingTypes} icon="Flame" />
      </div>

      {/* Opportunity Center — "מה חסר לי במלאי?" */}
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="Flame" size={18} className="text-brand" />
          <h2 className="text-ink text-lg font-black">מה חסר לי במלאי?</h2>
          <span className="text-muted text-sm">— Top {Math.min(10, data.missingInventory.length)} ביקושים ללא מלאי תואם</span>
        </div>
        {data.missingInventory.length === 0 ? (
          <div className="border-line bg-card text-muted rounded-card border border-dashed p-8 text-center text-sm shadow-card">לא זוהו חוסרים משמעותיים — המלאי מכסה את הביקוש הקיים, או שאין מספיק קונים לזיהוי אשכול.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.missingInventory.map((c, idx) => (
              <div key={c.id} className={cn("rounded-card border p-4 shadow-card", gapBg(c.gapBand))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted text-lg font-black tabular-nums">{idx + 1}</span>
                    <div>
                      <p className="text-ink font-black leading-tight">{c.label}</p>
                      <p className={cn("text-xs font-bold", gapColor(c.gapBand))}>{GAP_BAND_LABEL[c.gapBand as keyof typeof GAP_BAND_LABEL] ?? c.gapBand} · ציון פער {c.gapScore}</p>
                    </div>
                  </div>
                  <span className="bg-card text-ink rounded-full border border-line px-2 py-0.5 text-xs font-bold">{c.activeBuyers} קונים</span>
                </div>
                <div className="text-muted mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <Mini label="קונים חמים" value={`${c.hotBuyers}`} />
                  <Mini label="מלאי זמין" value={`${c.inventoryCount}`} />
                  <Mini label="תקציב ממוצע" value={ils(c.avgBudget)} />
                </div>
                <button onClick={() => setOpen(open === c.id ? null : c.id)} className="text-brand mt-3 inline-flex items-center gap-1 text-xs font-bold">
                  <Icon name="Sparkles" size={12} /> {open === c.id ? "הסתר הסבר" : "למה?"}
                </button>
                {open === c.id && <Reasons reasons={c.reasons} />}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Acquisition signals */}
      <section className="mb-8">
        <h2 className="text-ink mb-3 flex items-center gap-2 text-lg font-black"><Icon name="Target" size={18} className="text-brand" /> אותות גיוס מלאי</h2>
        {data.signals.length === 0 ? (
          <div className="border-line bg-card text-muted rounded-card border border-dashed p-8 text-center text-sm shadow-card">אין אותות גיוס פעילים כרגע.</div>
        ) : (
          <div className="space-y-2.5">
            {data.signals.map((s) => <SignalRow key={s.id} s={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} onDismiss={() => runner.run(() => dismissAcquisitionSignalAction(s.id), { id: s.id, pendingMessage: "מסיר…", success: () => "האות הוסר." })} busy={runner.busyId === s.id} />)}
          </div>
        )}
      </section>

      {/* Demand clusters */}
      <section className="mb-8">
        <h2 className="text-ink mb-3 flex items-center gap-2 text-lg font-black"><Icon name="LayoutGrid" size={18} className="text-brand" /> אשכולות ביקוש</h2>
        {data.clusters.length === 0 ? (
          <div className="border-line bg-card text-muted rounded-card border border-dashed p-8 text-center text-sm shadow-card">לא זוהו אשכולות ביקוש (נדרשים לפחות 2 קונים תואמים לאשכול).</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.clusters.slice(0, 24).map((c) => <ClusterCard key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />)}
          </div>
        )}
      </section>

      {/* Heatmap data */}
      <section>
        <h2 className="text-ink mb-1 flex items-center gap-2 text-lg font-black"><Icon name="MapPin" size={18} className="text-brand" /> נתוני מפת ביקוש</h2>
        <p className="text-muted mb-3 text-xs">נתונים בלבד — מוכנים לשכבת מפה גאוגרפית עתידית. ללא מפה מזויפת וללא קואורדינטות מומצאות.</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <HeatColumn title="ביקוש לפי יישוב" cells={data.heatmap.locality} />
          <HeatColumn title="ביקוש לפי אזור+סוג" cells={data.heatmap.neighborhood} />
          <HeatColumn title="ביקוש לפי סוג נכס" cells={data.heatmap.propertyType} />
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, icon, accent }: { label: string; value: number; icon: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-card border p-4 shadow-card", accent ? "border-brand bg-brand-soft" : "border-line bg-card")}>
      <div className="flex items-center justify-between">
        <span className="text-muted text-xs font-bold">{label}</span>
        <Icon name={icon} size={16} className={accent ? "text-brand" : "text-muted"} />
      </div>
      <p className={cn("mt-1 text-2xl font-black", accent ? "text-brand-strong" : "text-ink")}>{value}</p>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="bg-card/70 rounded-lg border border-line/60 p-2"><p className="text-[10px] font-bold">{label}</p><p className="text-ink mt-0.5 text-sm font-black">{value}</p></div>;
}
function Reasons({ reasons }: { reasons: { label: string; detail: string }[] }) {
  return (
    <ul className="mt-2 space-y-1 border-t border-line/60 pt-2">
      {reasons.map((r, i) => (
        <li key={i} className="text-muted flex items-start justify-between gap-2 text-xs">
          <span className="text-ink font-bold">{r.label}</span><span className="text-left">{r.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function SignalRow({ s, open, onToggle, onDismiss, busy }: { s: StoredSignal; open: boolean; onToggle: () => void; onDismiss: () => void; busy: boolean }) {
  return (
    <div className="border-line bg-card rounded-card border p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl", s.strength >= 70 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600")}><Icon name="Target" size={18} /></span>
          <div>
            <p className="text-ink font-black leading-tight">{s.title}</p>
            <p className="text-muted mt-0.5 text-xs">{s.buyersCount} קונים ({s.hotBuyersCount} חמים) · {s.inventoryCount} נכסים במלאי · {s.competition} קונים לנכס</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-center">
            <p className="text-brand-strong text-xl font-black leading-none">{s.strength}</p>
            <p className="text-muted text-[10px] font-bold">עוצמה</p>
          </div>
          <button onClick={onDismiss} disabled={busy} className="text-muted hover:text-danger disabled:opacity-40" title="הסר"><Icon name="X" size={16} /></button>
        </div>
      </div>
      <button onClick={onToggle} className="text-brand mt-2 inline-flex items-center gap-1 text-xs font-bold"><Icon name="Sparkles" size={12} /> {open ? "הסתר" : "למה?"}</button>
      {open && <Reasons reasons={s.reasons} />}
    </div>
  );
}

function ClusterCard({ c, open, onToggle }: { c: StoredCluster; open: boolean; onToggle: () => void }) {
  const band = c.demandBand as keyof typeof DEMAND_BAND_LABEL;
  return (
    <div className="border-line bg-card rounded-card border p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink font-bold leading-tight">{c.label}</p>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", c.demandBand === "hot" ? "bg-red-100 text-red-600" : c.demandBand === "strong" ? "bg-orange-100 text-orange-600" : "bg-brand-soft text-brand-strong")}>
          {DEMAND_BAND_LABEL[band] ?? c.demandBand}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Gauge label="עוצמת ביקוש" value={c.demandStrength} />
        <Gauge label="ציון פער" value={c.gapScore} tone={gapColor(c.gapBand)} />
      </div>
      <div className="text-muted mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="bg-line/50 rounded px-1.5 py-0.5">{c.activeBuyers} קונים</span>
        <span className="bg-line/50 rounded px-1.5 py-0.5">{c.hotBuyers} חמים</span>
        <span className="bg-line/50 rounded px-1.5 py-0.5">{c.inventoryCount} במלאי</span>
        {c.avgBudget ? <span className="bg-line/50 rounded px-1.5 py-0.5">{ils(c.avgBudget)} ממוצע</span> : null}
      </div>
      <button onClick={onToggle} className="text-brand mt-2 inline-flex items-center gap-1 text-xs font-bold"><Icon name="Sparkles" size={12} /> {open ? "הסתר" : "למה?"}</button>
      {open && <Reasons reasons={c.reasons} />}
    </div>
  );
}

function Gauge({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex-1">
      <div className="text-muted flex justify-between text-[10px] font-bold"><span>{label}</span><span className={tone}>{value}</span></div>
      <div className="bg-line/50 mt-0.5 h-1.5 w-full overflow-hidden rounded-full"><div className="bg-brand h-1.5 rounded-full" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function HeatColumn({ title, cells }: { title: string; cells: HeatmapCell[] }) {
  const max = Math.max(1, ...cells.map((c) => c.buyersCount));
  return (
    <div className="border-line bg-card rounded-card border p-4 shadow-card">
      <p className="text-ink mb-3 text-sm font-black">{title}</p>
      {cells.length === 0 ? <p className="text-muted text-xs">—</p> : (
        <ul className="space-y-2">
          {cells.slice(0, 10).map((c) => (
            <li key={c.key}>
              <div className="text-muted flex items-center justify-between text-xs"><span className="text-ink font-bold">{c.label}</span><span>{c.buyersCount} קונים · {c.inventoryCount} מלאי</span></div>
              <div className="bg-line/40 mt-1 h-2 w-full overflow-hidden rounded-full">
                <div className="zono-gradient-glow h-2 rounded-full" style={{ width: `${Math.round((c.buyersCount / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
