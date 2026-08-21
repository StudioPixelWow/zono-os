"use client";
// ============================================================================
// Market cockpit — PRIMARY analytical chart (client). Switchable metric + period
// over a REAL daily series (new listings / price reductions). Metrics whose
// history the data can't honestly support (active inventory, median ₪/m²) render
// an explicit DATA_REQUIRED state — never a fabricated line. Dependency-free SVG
// (no chart lib in the repo); time reads left→right (chronological, not reversed
// for RTL) with a hover tooltip, current value and previous-period comparison.
// ============================================================================
import { useMemo, useState } from "react";
import type { MetricSeries } from "@/lib/market-intelligence/command-center";

const PERIODS: { days: 7 | 30 | 90; label: string }[] = [
  { days: 7, label: "7 ימים" }, { days: 30, label: "30 יום" }, { days: 90, label: "90 יום" },
];

export function MarketPrimaryChart({ series, initialMetric = "new_listings", initialPeriod = 30 }: { series: MetricSeries[]; initialMetric?: string; initialPeriod?: 7 | 30 | 90 }) {
  const [metric, setMetric] = useState(initialMetric);
  const [period, setPeriod] = useState<7 | 30 | 90>(initialPeriod);
  const [hover, setHover] = useState<number | null>(null);
  const sel = series.find((s) => s.key === metric) ?? series[0];

  const view = useMemo(() => {
    const pts = sel.points.slice(Math.max(0, sel.points.length - period));
    const cur = pts.reduce((a, p) => a + p.value, 0);
    const prevPts = sel.points.slice(Math.max(0, sel.points.length - 2 * period), Math.max(0, sel.points.length - period));
    const prev = prevPts.reduce((a, p) => a + p.value, 0);
    const deltaPct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
    return { pts, cur, prev, deltaPct };
  }, [sel, period]);

  return (
    <div className="border-line bg-card rounded-2xl border p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {series.map((s) => (
            <button key={s.key} onClick={() => setMetric(s.key)} className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${s.key === metric ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>
              {s.label}{s.status === "data_required" ? " •" : ""}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button key={p.days} onClick={() => setPeriod(p.days)} className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${p.days === period ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      {sel.status === "data_required" ? (
        <DataRequired note={sel.note} label={sel.label} />
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-ink text-3xl font-black tabular-nums">{view.cur.toLocaleString("he-IL")}</div>
              <p className="text-muted text-xs">{sel.label} · {period} ימים</p>
            </div>
            {view.deltaPct != null && (
              <span className={`rounded-lg px-2 py-1 text-xs font-bold ${view.deltaPct >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                {view.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(view.deltaPct)}% מהתקופה הקודמת
              </span>
            )}
          </div>
          <Chart pts={view.pts} hover={hover} setHover={setHover} />
        </>
      )}
    </div>
  );
}

function DataRequired({ note, label }: { note: string | null; label: string }) {
  return (
    <div className="border-line grid min-h-[180px] place-items-center rounded-xl border border-dashed p-6 text-center">
      <div>
        <span className="bg-warning-soft text-warning inline-flex rounded-md px-2 py-0.5 text-[11px] font-black">DATA_REQUIRED</span>
        <p className="text-ink mt-2 text-sm font-black">אין עדיין היסטוריה אמינה ל{label}</p>
        {note && <p className="text-muted mx-auto mt-1 max-w-md text-xs leading-relaxed">{note}</p>}
      </div>
    </div>
  );
}

function Chart({ pts, hover, setHover }: { pts: { date: string; value: number }[]; hover: number | null; setHover: (i: number | null) => void }) {
  const W = 720, H = 200, padX = 8, padY = 16;
  const n = pts.length;
  const max = Math.max(1, ...pts.map((p) => p.value));
  const x = (i: number) => padX + (n <= 1 ? 0 : (i / (n - 1)) * (W - padX * 2));
  const y = (v: number) => padY + (1 - v / max) * (H - padY * 2);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(n - 1).toFixed(1)} ${H - padY} L ${x(0).toFixed(1)} ${H - padY} Z`;
  const hp = hover != null ? pts[hover] : null;
  const ticks = [0, Math.floor(n / 2), n - 1].filter((i, idx, a) => a.indexOf(i) === idx && i >= 0 && i < n);
  return (
    <div dir="ltr" className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const rel = (e.clientX - r.left) / r.width * W;
          const i = Math.round(((rel - padX) / Math.max(1, W - padX * 2)) * (n - 1));
          setHover(Math.min(n - 1, Math.max(0, i)));
        }}>
        <defs><linearGradient id="mc-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c3aed" stopOpacity="0.22" /><stop offset="100%" stopColor="#7c3aed" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#mc-grad)" />
        <path d={line} fill="none" stroke="#7c3aed" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hp && <g><line x1={x(hover!)} y1={padY} x2={x(hover!)} y2={H - padY} stroke="#c4b5fd" strokeWidth={1} vectorEffect="non-scaling-stroke" /><circle cx={x(hover!)} cy={y(hp.value)} r={3.5} fill="#7c3aed" /></g>}
      </svg>
      <div dir="rtl" className="text-muted mt-1 flex justify-between text-[10px]">
        {ticks.map((i) => <span key={i}>{fmtDate(pts[i].date)}</span>)}
      </div>
      {hp && (
        <div className="border-line bg-card text-ink pointer-events-none absolute top-0 rounded-lg border px-2 py-1 text-[11px] font-bold shadow-sm" style={{ insetInlineStart: `${(x(hover!) / W) * 100}%`, transform: "translateX(-50%)" }}>
          {fmtDate(hp.date)} · {hp.value}
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}`;
}
