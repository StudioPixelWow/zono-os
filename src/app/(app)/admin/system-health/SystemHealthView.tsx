"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { recomputeAllEnginesAction, recomputeEngineAction, recomputeWithDepsAction } from "@/lib/system/actions";
import type { SystemHealth, EngineState } from "@/lib/system/service";
import type { IntegrationStatus } from "@/lib/env-validation";

const STATE_LABEL: Record<EngineState, string> = { fresh: "עדכני", stale: "מיושן", error: "שגיאה", running: "רץ", never: "לא חושב", embedded: "משובץ" };
const STATE_TONE: Record<EngineState, string> = { fresh: "bg-success-soft text-success", stale: "bg-warning-soft text-warning", error: "bg-danger-soft text-danger", running: "bg-brand-soft text-brand-strong", never: "bg-surface text-muted", embedded: "bg-surface text-muted" };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const healthTone = (n: number) => (n >= 80 ? "text-success" : n >= 50 ? "text-warning" : "text-danger");

export function SystemHealthView({ health, integrations = [] }: { health: SystemHealth; integrations?: IntegrationStatus[] }) {
  const runner = useActionRunner();
  const { pending, busyId } = runner;
  const { engines, freshnessScore, counts, coverage } = health;

  // Last successful / last failed run, derived from the latest run per engine.
  const ran = engines.filter((e) => e.lastRunAt);
  const lastSuccess = ran
    .filter((e) => e.state === "fresh" || e.state === "stale")
    .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""))[0];
  const lastFailure = ran
    .filter((e) => e.state === "error")
    .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""))[0];

  const runAll = () => runner.run(recomputeAllEnginesAction, {
    id: "all", pendingMessage: "מריץ את כל המנועים לפי סדר התלויות…",
    success: (r) => `הורצו ${r.length} מנועים · ${r.filter((x) => x.ok).length} הצליחו · ${r.filter((x) => !x.ok).length} נכשלו.`,
  });
  const runEngine = (key: string, label: string) => runner.run(() => recomputeEngineAction(key), {
    id: key, pendingMessage: `מחשב מחדש: ${label}…`,
    success: (r) => r.ok ? `${label}: עובדו ${r.rows} פריטים (${(r.durationMs / 1000).toFixed(1)} ש׳).` : `${label}: שגיאה — ${r.error}`,
  });
  const runDeps = (key: string, label: string) => runner.run(() => recomputeWithDepsAction(key), {
    id: `${key}:deps`, pendingMessage: `מחשב ${label} + תלויות (לפי סדר)…`,
    success: (r) => `${label} + תלויות: הורצו ${r.length} מנועים · ${r.filter((x) => x.ok).length} הצליחו.`,
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Admin · System Health</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מנועי חישוב</h1>
          <p className="text-muted mt-1 text-sm">מצב כל מנועי המודיעין — מה עדכני, מה מיושן, מה נכשל. ניתן לחשב מחדש מנוע בודד, מנוע + תלויות, או הכל — תמיד לפי סדר התלויות הנכון.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
          <Button onClick={runAll} loading={busyId === "all"} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>חשב הכל</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="ציון רעננות" value={`${freshnessScore}`} tone={healthTone(freshnessScore)} icon="TrendingUp" />
        <Stat label="עדכניים" value={`${counts.fresh}/${counts.total}`} tone="text-success" icon="UserCheck" />
        <Stat label="מיושנים" value={String(counts.stale)} tone="text-warning" icon="Clock" />
        <Stat label="שגיאות" value={String(counts.error)} tone="text-danger" icon="AlertTriangle" />
        <Stat label="לא חושבו" value={String(counts.never)} tone="text-muted" icon="Minus" />
        <Stat label="עסקאות" value={coverage.transactions.toLocaleString("he-IL")} tone="text-brand-strong" icon="Building2" />
        <Stat label="שכונות" value={String(coverage.neighborhoods)} tone="text-brand-strong" icon="MapPin" />
      </div>

      <ActionFeedback runner={runner} />

      {/* Last successful / last failed run (real, from engine_runs latest-per-engine). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-card border-line rounded-2xl border p-4">
          <p className="text-muted text-[11px] font-bold">ריצה מוצלחת אחרונה</p>
          {lastSuccess ? (
            <><p className="text-success text-lg font-black">{lastSuccess.label}</p><p className="text-muted text-[11px]">{fmt(lastSuccess.lastRunAt)}{lastSuccess.durationMs != null ? ` · ${(lastSuccess.durationMs / 1000).toFixed(1)} ש׳` : ""}</p></>
          ) : <p className="text-muted text-sm">—</p>}
        </div>
        <div className="bg-card border-line rounded-2xl border p-4">
          <p className="text-muted text-[11px] font-bold">כשל אחרון</p>
          {lastFailure ? (
            <><p className="text-danger text-lg font-black">{lastFailure.label}</p><p className="text-muted text-[11px]">{fmt(lastFailure.lastRunAt)}{lastFailure.error ? ` · ${lastFailure.error}` : ""}</p></>
          ) : <p className="text-success text-sm font-semibold">אין כשלים אחרונים ✓</p>}
        </div>
        <div className="bg-card border-line rounded-2xl border p-4">
          <p className="text-muted text-[11px] font-bold">מנועים שהורצו</p>
          <p className="text-brand-strong text-lg font-black">{ran.length}/{counts.total}</p>
          <p className="text-muted text-[11px]">{counts.never} טרם הורצו</p>
        </div>
      </div>

      {/* Integration setup state (P1.3) — never crashes; shows what's configured. */}
      {integrations.length > 0 && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">אינטגרציות חיצוניות</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((i) => (
              <div key={i.key} className="border-line flex items-start gap-2 rounded-xl border p-2.5">
                <span className={cn("mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full", i.configured ? "bg-success" : "bg-line")} />
                <div className="min-w-0">
                  <p className="text-ink text-[13px] font-bold">{i.label} <span className={cn("text-[10px] font-bold", i.configured ? "text-success" : "text-muted")}>· {i.configured ? "מוגדר" : "לא מוגדר"}</span></p>
                  {!i.configured && <p className="text-muted text-[11px]">{i.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card border-line overflow-hidden rounded-[20px] border">
        <table className="w-full text-right text-sm">
          <thead className="bg-surface text-muted text-[11px] font-bold">
            <tr>{["מנוע", "סטטוס", "סנכרון אחרון", "משך", "פריטים", "תלוי ב", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {engines.map((e) => (
              <tr key={e.key} className="border-line border-t align-top">
                <td className="px-3 py-2">
                  <p className="text-ink font-semibold">{e.label}</p>
                  {e.note && <p className="text-muted text-[10px]">{e.note}</p>}
                  {e.error && e.state === "error" && <p className="text-danger text-[10px]">{e.error}</p>}
                </td>
                <td className="px-3 py-2"><span className={cn("rounded-md px-2 py-0.5 text-[10px] font-black", STATE_TONE[e.state])}>{STATE_LABEL[e.state]}</span></td>
                <td className="text-muted px-3 py-2 whitespace-nowrap text-[11px]">{fmt(e.lastRunAt)}</td>
                <td className="text-muted px-3 py-2 text-[11px]">{e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)} ש׳` : "—"}</td>
                <td className="text-ink px-3 py-2 text-[11px] font-bold">{e.rowsProcessed ?? "—"}</td>
                <td className="text-muted px-3 py-2 text-[10px]">{e.deps.length ? e.deps.join(" · ") : "—"}</td>
                <td className="px-3 py-2">
                  {e.runnable ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button disabled={pending} onClick={() => runEngine(e.key, e.label)} className="text-brand-strong text-[11px] font-bold disabled:opacity-50">{busyId === e.key ? "מחשב…" : "חשב"}</button>
                      {e.deps.length > 0 && <button disabled={pending} onClick={() => runDeps(e.key, e.label)} className="text-muted text-[11px] font-bold disabled:opacity-50">{busyId === `${e.key}:deps` ? "…" : "+ תלויות"}</button>}
                    </div>
                  ) : <span className="text-muted text-[10px]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: string; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className={cn("text-lg font-black", tone)}>{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
