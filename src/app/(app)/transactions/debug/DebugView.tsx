"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { debugMadlanAction, debugTransactionsAction } from "@/lib/transactions/actions";

interface EnvStatus { apifyToken: boolean; govmapActorId: boolean; actorId: string; cronSecret: boolean }
interface MadlanEnv { apifyToken: boolean; madlanActorId: boolean; actorId: string }
type DebugResult = Awaited<ReturnType<typeof debugTransactionsAction>> | Awaited<ReturnType<typeof debugMadlanAction>>;

export function DebugView({ env, madlan }: { env: EnvStatus; madlan: MadlanEnv }) {
  const [city, setCity] = useState("קרית ביאליק");
  const [neighborhood, setNeighborhood] = useState("");
  const [result, setResult] = useState<DebugResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const runDebug = () => { setError(null); setResult(null); start(async () => { try { setResult(await debugTransactionsAction(city.trim(), neighborhood.trim() || null)); } catch (e) { setError(e instanceof Error ? e.message : "שגיאה"); } }); };
  const runMadlan = () => { setError(null); setResult(null); start(async () => { try { setResult(await debugMadlanAction(city.trim(), neighborhood.trim() || null)); } catch (e) { setError(e instanceof Error ? e.message : "שגיאה"); } }); };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Transactions · Debug (Admin)</p>
          <h1 className="text-ink mt-1 text-2xl font-black">בדיקת Actor ודאטה</h1>
          <p className="text-muted mt-1 text-sm">בדיקה לא-הרסנית של חיבור Apify והמבנה האמיתי של העסקאות. APIFY_TOKEN נשמר בצד שרת בלבד ולעולם לא נחשף.</p>
        </div>
        <Link href="/transactions" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />עסקאות</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <EnvTile label="APIFY_TOKEN" ok={env.apifyToken} />
        <EnvTile label="MADLAN_ACTOR_ID" ok={madlan.madlanActorId} />
        <EnvTile label="GOVMAP_ACTOR_ID" ok={env.govmapActorId} />
        <EnvTile label="CRON_SECRET" ok={env.cronSecret} />
        <div className="bg-card border-line rounded-2xl border p-3 sm:col-span-2">
          <p className="text-muted text-[11px] font-bold">Madlan Actor</p>
          <p className="text-ink truncate text-sm font-black">{madlan.actorId}</p>
        </div>
        <div className="bg-card border-line rounded-2xl border p-3 sm:col-span-2">
          <p className="text-muted text-[11px] font-bold">GovMap Actor</p>
          <p className="text-ink truncate text-sm font-black">{env.actorId}</p>
        </div>
      </div>

      <div className="bg-card border-line rounded-[20px] border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm"><span className="text-muted text-[11px] font-bold">עיר</span><input value={city} onChange={(e) => setCity(e.target.value)} className="border-line rounded-xl border px-3 py-2" /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-muted text-[11px] font-bold">שכונה (אופציונלי)</span><input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="border-line rounded-xl border px-3 py-2" /></label>
          <Button onClick={runMadlan} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>{pending ? "מריץ…" : "בדוק מדלן"}</Button>
          <Button variant="secondary" onClick={runDebug} disabled={pending} leadingIcon={<Icon name="Landmark" size={15} />}>בדוק GovMap</Button>
        </div>
        {!env.apifyToken && <p className="text-warning mt-2 text-[11px]">APIFY_TOKEN לא מוגדר — הבדיקה תחזיר NO_TOKEN. הגדר טוקן כדי לבחון את מבנה הדאטה האמיתי.</p>}
      </div>

      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {result && (
        <div className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <Info label="סטטוס" value={result.runStatus} />
            <Info label="פריטים" value={String(result.datasetItems)} />
            <Info label={"dealsFound" in result ? "עסקאות שנמצאו" : "Actor"} value={"dealsFound" in result ? String(result.dealsFound) : result.actorId} />
            <Info label="שגיאה" value={result.error ?? "—"} />
          </div>
          {"missingFields" in result && result.missingFields.length > 0 && <p className="text-warning text-[11px]">שדות חסרים בדגימה: {result.missingFields.join(", ")}</p>}
          {"recordKeys" in result && result.recordKeys.length > 0 && <p className="text-muted text-[11px]">מפתחות רשומת עיר: {result.recordKeys.join(", ")}</p>}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Block title="קלט שנשלח" obj={result.inputSent} />
            <Block title="דגימה גולמית" obj={result.rawSample} />
            <Block title="דגימה מנורמלת" obj={result.normalizedSample} />
          </div>
        </div>
      )}
    </div>
  );
}

function EnvTile({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <p className="text-muted text-[11px] font-bold">{label}</p>
      <p className={ok ? "text-success text-sm font-black" : "text-danger text-sm font-black"}>{ok ? "מוגדר ✓" : "חסר ✗"}</p>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-muted text-[11px] font-bold">{label}</p><p className="text-ink truncate font-semibold">{value}</p></div>;
}
function Block({ title, obj }: { title: string; obj: unknown }) {
  return (
    <div className="bg-surface rounded-xl p-3">
      <p className="text-muted mb-1 text-[11px] font-bold">{title}</p>
      <pre dir="ltr" className="text-ink max-h-64 overflow-auto text-[10px] leading-relaxed">{obj ? JSON.stringify(obj, null, 2) : "—"}</pre>
    </div>
  );
}
