"use client";
// ============================================================================
// ZONO — Launch Readiness dashboard (Phase 21, section 14). Production score by
// category + overall launch readiness, plus the deployment-validation gate
// (PASS/WARNING/FAIL per infra area). Read-only; refresh re-runs the probes.
// ============================================================================
import { useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { getProductionScoreAction, runDeploymentValidationAction } from "@/lib/launch/server/actions";
import type { ProductionScore, GateLevel } from "@/lib/launch";
import type { DeploymentValidation } from "@/lib/launch/server/deploy-validation";

const BAND_STYLE: Record<ProductionScore["band"], string> = {
  ready: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  caution: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  not_ready: "text-red-300 border-red-500/30 bg-red-500/10",
};
const BAND_LABEL: Record<ProductionScore["band"], string> = { ready: "מוכן להשקה", caution: "כמעט מוכן", not_ready: "לא מוכן" };
const GATE_STYLE: Record<GateLevel, string> = { PASS: "bg-emerald-500/15 text-emerald-300", WARNING: "bg-amber-500/15 text-amber-300", FAIL: "bg-red-500/15 text-red-300" };

function bar(p: number): string { return p >= 95 ? "bg-emerald-500" : p >= 80 ? "bg-amber-500" : "bg-red-500"; }

export function LaunchReadinessView({ score: s0, deploy: d0 }: { score: ProductionScore; deploy: DeploymentValidation | null }) {
  const [score, setScore] = useState(s0);
  const [deploy, setDeploy] = useState(d0);
  const [pending, start] = useTransition();

  function refresh() {
    start(async () => {
      const [s, d] = await Promise.all([getProductionScoreAction(), runDeploymentValidationAction()]);
      if (s.ok) setScore(s.data.score);
      if (d.ok) setDeploy(d.data);
    });
  }

  return (
    <div dir="rtl" className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-5">
        <div className="flex items-center gap-3">
          <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name="Activity" size={22} /></span>
          <div>
            <h1 className="text-ink text-lg font-black">מוכנות להשקה</h1>
            <p className="text-muted text-xs">Commercial Launch Platform™ · Production Readiness</p>
          </div>
        </div>
        <button onClick={refresh} disabled={pending} className="bg-surface text-ink border-line inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold disabled:opacity-50">
          <Icon name="RefreshCw" size={14} /> {pending ? "מרענן…" : "רענן"}
        </button>
      </div>

      {/* Overall launch readiness */}
      <div className={`flex flex-col items-center gap-2 rounded-[20px] border p-6 ${BAND_STYLE[score.band]}`}>
        <p className="text-xs font-bold opacity-80">Launch Readiness</p>
        <p className="text-5xl font-black">{score.launchReadinessPercent}%</p>
        <span className="rounded-full border border-current/30 px-3 py-0.5 text-sm font-bold">{BAND_LABEL[score.band]}</span>
      </div>

      {/* Category scores */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {score.categories.map((c) => (
          <div key={c.key} className="bg-card border-line rounded-2xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-ink text-sm font-extrabold">{c.label}</span>
              <span className="text-ink font-mono text-sm font-bold">{c.percent}%</span>
            </div>
            <div className="bg-surface h-2 w-full overflow-hidden rounded-full">
              <div className={`h-full rounded-full ${bar(c.percent)}`} style={{ width: `${c.percent}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Deployment validation gate */}
      {deploy && (
        <div className="bg-card border-line rounded-2xl border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-ink text-sm font-black">אימות פריסה (Deployment Validation)</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${GATE_STYLE[deploy.overall]}`}>{deploy.overall}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {deploy.gates.map((g) => (
              <div key={g.name} className="border-line flex items-center justify-between gap-2 border-b py-1.5 last:border-0">
                <span className="text-ink text-sm">{g.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted hidden text-xs sm:inline">{g.detail}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${GATE_STYLE[g.level]}`}>{g.level}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-muted text-center text-[11px]">
        כל החישובים דטרמיניסטיים; ה‑AI אינו משתתף בחישוב הציון. הריצו <code>npm run validate:deploy</code> לאימות בזמן בנייה.
      </p>
    </div>
  );
}
