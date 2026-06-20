"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { syncTransactionsAction, ensureCoverageTargetsAction, startMadlanSyncAction, pollMadlanSyncAction, finishMadlanSyncAction } from "@/lib/transactions/actions";
import type { TransactionsBoard } from "@/lib/transactions/service";

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const fmtNum = (n: number | null) => (n == null ? "—" : n.toLocaleString("he-IL"));

export function TransactionsView({ board }: { board: TransactionsBoard }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<{ status: string; elapsed: number } | null>(null);
  const run = (fn: () => Promise<unknown>) => { setError(null); setMsg(null); start(async () => { try { const r = await fn() as { mock?: boolean; needsConfig?: boolean; imported?: number; deals?: number; crossSource?: number; error?: string }; if (r?.needsConfig) setError("הגדר עיר/שכונות פעילות בפרופיל כדי לסנכרן עסקאות."); else if (r?.error) setError(r.error); else setMsg(`סונכרנו ${r?.imported ?? 0} עסקאות${r?.deals ? ` (מתוך ${r.deals})` : ""}${r?.crossSource ? ` · ${r.crossSource} חופפות ל-GovMap` : ""}${r?.mock ? " · נתוני הדגמה" : ""}.`); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "שגיאה"); } }); };

  // Non-blocking Madlan sync with live progress (avoids serverless timeout).
  const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const runMadlan = () => {
    setError(null); setMsg(null); setProgress(null);
    start(async () => {
      try {
        const s = await startMadlanSyncAction();
        if (s.needsConfig) { setError("הגדר עיר/שכונות פעילות בפרופיל כדי לסנכרן עסקאות."); return; }
        if (s.error || !s.runId) { setError(s.error ?? "כשל בהתחלת ריצת מדלן"); return; }
        const t0 = Date.now();
        let datasetId = s.datasetId; let status = "RUNNING";
        const TERMINAL = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];
        setProgress({ status: "RUNNING", elapsed: 0 });
        for (let i = 0; i < 160; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const p = await pollMadlanSyncAction(s.runId);
          status = p.status; if (p.datasetId) datasetId = p.datasetId;
          setProgress({ status, elapsed: Math.round((Date.now() - t0) / 1000) });
          if (TERMINAL.includes(status)) break;
        }
        if (status !== "SUCCEEDED") { setProgress(null); setError(`ריצת מדלן הסתיימה בסטטוס ${status}`); return; }
        setProgress({ status: "SAVING", elapsed: Math.round((Date.now() - t0) / 1000) });
        const r = await finishMadlanSyncAction(datasetId!);
        setProgress(null);
        if (r.error) setError(r.error);
        else setMsg(`סונכרנו ${r.imported} עסקאות${r.deals ? ` (מתוך ${r.deals})` : ""}${r.crossSource ? ` · ${r.crossSource} חופפות ל-GovMap` : ""}.`);
        router.refresh();
      } catch (e) { setProgress(null); setError(e instanceof Error ? e.message : "שגיאה"); }
    });
  };

  const { transactions, total, stats, needsConfig, agentCity, apifyConfigured } = board;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Transactions Intelligence OS</p>
          <h1 className="text-ink mt-1 text-2xl font-black">עסקאות בעיר שלי{agentCity ? ` · ${agentCity}` : ""}</h1>
          <p className="text-muted mt-1 text-sm">עסקאות אמת שנמכרו בעיר ובשכונות שלך — מחירי מכירה רשמיים. דטרמיניסטי, ללא נתונים מומצאים.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/transactions/coverage" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="Map" size={15} />כיסוי דאטה</Link>
          <Button size="sm" variant="secondary" onClick={() => run(syncTransactionsAction)} disabled={pending} leadingIcon={<Icon name="Landmark" size={15} />}>GovMap (גיבוי)</Button>
          <Button onClick={runMadlan} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מסנכרן…" : "סנכרן ממדלן"}</Button>
        </div>
      </div>
      {!apifyConfigured && <p className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-sm font-semibold">⚠ APIFY_TOKEN לא מוגדר — בסביבת פיתוח מוצגים נתוני הדגמה מסומנים. בפרודקשן יש להגדיר טוקן לקבלת עסקאות אמת.</p>}
      {progress && (
        <p className="bg-brand-soft text-brand-strong flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="Clock" size={15} />
          {progress.status === "SAVING" ? `מעבד ושומר עסקאות… (${fmtElapsed(progress.elapsed)})` : `מריץ את מדלן ומושך את עסקאות העיר… (${fmtElapsed(progress.elapsed)}) — זה לוקח כדקה-שתיים, אפשר להמשיך לעבוד`}
        </p>
      )}
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="סך עסקאות" value={fmtNum(total)} icon="BarChart3" />
        <Stat label="בתצוגה" value={fmtNum(stats.count)} icon="Filter" />
        <Stat label="חציון למ״ר" value={stats.medianPpsqm ? `${fmtNum(stats.medianPpsqm)}₪` : "—"} icon="TrendingUp" tone="text-success" />
        <Stat label="עסקה ממוצעת" value={stats.avgDeal ? formatShekels(stats.avgDeal) : "—"} icon="Building2" />
      </div>

      {needsConfig ? (
        <ConfigEmpty pending={pending} onEnsure={() => run(ensureCoverageTargetsAction)} />
      ) : transactions.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Map" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין עסקאות מסונכרנות</p>
          <p className="text-muted max-w-sm text-sm">לחץ ״סנכרן עסקאות״ כדי למשוך עסקאות אמת שנמכרו בעיר/שכונות שלך לפי אזורי הכיסוי שהוגדרו.</p>
        </div>
      ) : (
        <div className="bg-card border-line overflow-hidden rounded-[20px] border">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-surface text-muted text-[11px] font-bold">
                <tr>
                  {["תאריך", "כתובת", "שכונה", "מחיר עסקה", "מ״ר", "₪/מ״ר", "חדרים", "קומה", "נבנה", "תיווך", "מקור"].map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-line hover:bg-surface/60 border-t">
                    <td className="text-muted px-3 py-2 whitespace-nowrap">{fmtDate(t.deal_date)}</td>
                    <td className="text-ink px-3 py-2 font-semibold">{t.address ?? t.normalized_address ?? "—"}</td>
                    <td className="text-muted px-3 py-2 whitespace-nowrap">{t.neighborhood_name ?? "—"}</td>
                    <td className="text-ink px-3 py-2 font-bold whitespace-nowrap">{t.deal_amount ? formatShekels(t.deal_amount) : "—"}</td>
                    <td className="text-muted px-3 py-2">{fmtNum(t.area)}</td>
                    <td className="text-brand-strong px-3 py-2 font-bold whitespace-nowrap">{t.price_per_sqm ? `${fmtNum(t.price_per_sqm)}` : "—"}</td>
                    <td className="text-muted px-3 py-2">{t.rooms ?? "—"}</td>
                    <td className="text-muted px-3 py-2">{t.floor ?? "—"}</td>
                    <td className="text-muted px-3 py-2">{t.building_year ?? "—"}</td>
                    <td className="text-muted px-3 py-2 whitespace-nowrap text-[11px]">{t.mediation ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px]">
                      <span className={cn("rounded-md px-1.5 py-0.5 font-bold", t.source_platform === "madlan_transactions" ? "bg-brand-soft text-brand-strong" : "bg-surface text-muted")}>{t.source_platform === "madlan_transactions" ? "מדלן" : (t.raw_payload as { _mock?: boolean })?._mock ? "הדגמה" : "GovMap"}</span>
                      {t.duplicate_of && <span className="text-warning mr-1">⚠</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigEmpty({ pending, onEnsure }: { pending: boolean; onEnsure: () => void }) {
  return (
    <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
      <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="MapPin" size={26} /></span>
      <p className="text-ink text-lg font-extrabold">הגדר את אזור העבודה שלך</p>
      <p className="text-muted max-w-sm text-sm">כדי לחקור עסקאות אמת, הגדר עיר ושכונות פעילות בפרופיל. לאחר מכן ZONO ייצור אזורי כיסוי ויסנכרן עסקאות.</p>
      <Button onClick={onEnsure} disabled={pending} leadingIcon={<Icon name="Plus" size={15} />}>צור אזורי כיסוי</Button>
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: string; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-base font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
