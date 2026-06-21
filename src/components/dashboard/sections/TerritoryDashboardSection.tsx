import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getTerritoryCommandCenter, type TerritoryRow } from "@/lib/territory/service";

const name = (t: TerritoryRow | null) => !t ? "—" : t.neighborhood_name ? `${t.city_name} · ${t.neighborhood_name}` : t.city_name ?? t.territory_key;

function Card({ label, t, score, tone }: { label: string; t: TerritoryRow | null; score: number; tone: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <p className="text-muted text-[11px] font-bold">{label}</p>
      <p className="text-ink mt-0.5 truncate text-sm font-extrabold">{name(t)}</p>
      <p className={`text-lg font-black ${tone}`}>{score}</p>
    </div>
  );
}

/** Real territory opportunities on the home dashboard (server component). */
export async function TerritoryDashboardSection() {
  let cc;
  try { cc = await getTerritoryCommandCenter(); }
  catch (e) { console.error("[territory] dashboard failed:", e); return null; }
  if (cc.total === 0) return null;

  const ws = cc.whiteSpace[0] ?? null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Map" size={16} /></span>
          <h2 className="text-ink text-lg font-black">הזדמנויות טריטוריה</h2>
        </div>
        <Link href="/territories" className="text-brand-strong text-sm font-bold hover:underline">למודיעין הטריטוריות ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="הטריטוריה החזקה" t={cc.strongest} score={cc.strongest?.territory_health_score ?? 0} tone="text-success" />
        <Card label="אזור צומח" t={cc.fastestGrowing} score={cc.fastestGrowing?.growth_score ?? 0} tone="text-brand-strong" />
        <Card label="מוקד גיוס" t={cc.highestAcquisition} score={cc.highestAcquisition?.acquisition_score ?? 0} tone="text-brand-strong" />
        <Card label="שטח לבן" t={ws} score={ws?.white_space_score ?? 0} tone="text-warning" />
      </div>
      {cc.biggestThreat && (
        <div className="bg-danger-soft text-danger flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="AlertTriangle" size={15} />איום: מתחרים חזקים ב{name(cc.biggestThreat)}
        </div>
      )}
    </section>
  );
}
