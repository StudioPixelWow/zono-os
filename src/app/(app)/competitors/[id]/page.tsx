import { notFound } from "next/navigation";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getCompetitorDetail } from "@/lib/competitor/service";

export const dynamic = "force-dynamic";
const scoreTone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

export default async function CompetitorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail = null;
  try { detail = await getCompetitorDetail(id); } catch (e) { console.error("[competitor] detail failed:", e); }
  if (!detail) notFound();
  const p = detail.profile;
  const tiles: { label: string; value: number }[] = [
    { label: "נתח שוק", value: p.market_share_score }, { label: "חוזק מלאי", value: p.inventory_strength_score },
    { label: "צמיחה", value: p.growth_score }, { label: "בלעדיות", value: p.exclusivity_score },
    { label: "כוח תמחור", value: p.pricing_power_score }, { label: "פעילות", value: p.activity_score },
    { label: "פגיעות", value: p.acquisition_risk_score }, { label: "הזדמנות", value: p.opportunity_score },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/competitors" className="text-muted hover:text-brand flex items-center gap-1 text-sm font-bold"><Icon name="ArrowLeft" size={15} /> חזרה למודיעין מתחרים</Link>
      <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <h1 className="text-ink text-2xl font-black">{p.display_name}</h1>
        <p className="text-muted mt-1 text-sm">{p.total_listings} מודעות · {p.active_localities} אזורים</p>
        <p className="text-ink mt-3 text-sm">{p.ai_summary}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => <div key={t.label} className="bg-surface rounded-xl p-2.5"><p className="text-muted text-[11px] font-bold">{t.label}</p><p className={cn("text-2xl font-black", scoreTone(t.value))}>{t.value}</p></div>)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="bg-card border-line rounded-[22px] border p-5">
          <h3 className="text-ink mb-3 text-sm font-extrabold">נוכחות לפי אזור</h3>
          {detail.positions.length === 0 ? <p className="text-muted text-sm">אין נתונים</p> : (
            <table className="w-full text-start text-sm">
              <thead className="text-muted border-line border-b text-xs"><tr>{["אזור", "מודעות", "נתח", "דירוג", "שינוי 30י׳"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-bold">{h}</th>)}</tr></thead>
              <tbody>{detail.positions.map((pos) => (
                <tr key={pos.id} className="border-line border-b last:border-0"><td className="text-ink px-2 py-1.5 font-semibold">{pos.locality}</td><td className="text-muted px-2 py-1.5">{pos.listings_count}</td><td className="text-muted px-2 py-1.5">{pos.market_share_percent}%</td><td className="text-muted px-2 py-1.5">#{pos.rank}</td><td className={cn("px-2 py-1.5 font-bold", pos.inventory_change_30d < 0 ? "text-danger" : "text-success")}>{pos.inventory_change_30d > 0 ? "+" : ""}{pos.inventory_change_30d}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <div className="bg-card border-line rounded-[22px] border p-5">
          <h3 className="text-ink mb-2 text-sm font-extrabold">סיכון והזדמנות</h3>
          <div className="bg-surface rounded-xl p-3"><p className="text-ink text-xs font-bold">סיכון תחרותי</p><p className="text-muted mt-1 text-[11px]">{p.ai_risk_summary}</p></div>
          <div className="bg-surface mt-2 rounded-xl p-3"><p className="text-ink text-xs font-bold">אסטרטגיית גיוס</p><p className="text-muted mt-1 text-[11px]">{p.ai_opportunity_summary}</p></div>
          <h3 className="text-ink mb-2 mt-4 text-sm font-extrabold">סיגנלים</h3>
          {detail.signals.length === 0 ? <p className="text-muted text-sm">—</p> : <ul className="flex flex-col gap-1">{detail.signals.map((s) => <li key={s.id} className="text-muted text-xs"><b className="text-ink">{s.title}</b> · {s.description}</li>)}</ul>}
        </div>
        <div className="bg-card border-line rounded-[22px] border p-5 lg:col-span-2">
          <h3 className="text-ink mb-2 text-sm font-extrabold">מודעות מקושרות ({detail.listings.length})</h3>
          {detail.listings.length === 0 ? <p className="text-muted text-sm">אין מודעות פעילות</p> : (
            <ul className="flex flex-col gap-1.5">{detail.listings.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/external-listings/${l.id}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{l.title ?? "מודעה"}{l.city ? ` · ${l.city}` : ""}</Link>
                <span className="text-muted text-[11px]">{l.price ? formatShekels(l.price) : "—"}</span>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    </div>
  );
}
