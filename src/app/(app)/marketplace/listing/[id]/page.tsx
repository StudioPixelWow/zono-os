// ============================================================================
// 🛒 ZONO — Marketplace listing detail (INTERNAL) (/marketplace/listing/[id]).
// PHASE 58.0. The internal-first destination for an external listing. Reuses the
// existing external-listings detail read. The original external URL is shown only
// as a SECONDARY link — never the primary click. Alerts remain approval-gated.
// ============================================================================
import Link from "next/link";
import { notFound } from "next/navigation";
import { getExternalListingDetailAction } from "@/lib/external-listings/actions";
import { sourceLabel } from "@/lib/marketplace-intelligence/registry";

export const dynamic = "force-dynamic";

type Rec = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const money = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);

export default async function MarketplaceListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getExternalListingDetailAction(id).catch(() => null);
  if (!detail) notFound();
  const L = detail.listing as unknown as Rec;
  const url = s(L.listing_url);
  const title = s(L.address) ?? s(L.city) ?? "נכס חיצוני";

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <Link href="/marketplace" className="text-muted hover:text-brand text-sm font-bold">← חזרה למרקטפלייס</Link>

      <div className="bg-card border-line mt-3 rounded-[22px] border p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="bg-brand-soft text-brand-strong rounded-lg px-2 py-0.5 text-xs font-bold">ליסטינג חיצוני · תצוגה פנימית</span>
          <span className="bg-surface text-ink rounded-lg px-2 py-0.5 text-[11px] font-bold">{sourceLabel(s(L.source))}</span>
          {detail.duplicate && <span className="bg-warning-soft text-warning rounded-lg px-2 py-0.5 text-[11px] font-bold">כפילות מזוהה</span>}
        </div>
        <h1 className="text-ink text-xl font-black">{title}</h1>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="מחיר" value={money(num(L.price))} />
          <Fact label="חדרים" value={num(L.rooms)?.toString() ?? "—"} />
          <Fact label='מ"ר' value={num(L.sqm)?.toString() ?? num(L.area_sqm)?.toString() ?? "—"} />
          <Fact label="ציון הזדמנות" value={num(L.opportunity_score)?.toString() ?? "—"} />
        </div>
      </div>

      {detail.whyItMatters.length > 0 && (
        <Section title="למה זה חשוב">
          <ul className="space-y-1">{detail.whyItMatters.map((w, i) => <li key={i} className="text-muted text-[13px]">• {w}</li>)}</ul>
        </Section>
      )}

      {detail.buyerMatches.length > 0 && (
        <Section title={`קונים מתאימים (${detail.buyerMatches.length})`}>
          <ul className="space-y-1">{detail.buyerMatches.slice(0, 8).map((b, i) => <li key={i} className="text-ink text-[13px] font-semibold">{b.name} · התאמה {b.matchScore}</li>)}</ul>
          <p className="text-muted mt-2 text-[11px]">יצירת התראה/טיוטה לסוכן דורשת אישור.</p>
        </Section>
      )}

      {/* External source — SECONDARY link only. */}
      <div className="mt-4">
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-muted text-[12px] font-bold underline">צפייה במקור החיצוני ({sourceLabel(s(L.source))}) — משני ↗</a> : <span className="text-muted text-[12px]">אין קישור מקור חיצוני.</span>}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="bg-surface rounded-xl px-3 py-2"><p className="text-muted text-[11px] font-bold">{label}</p><p className="text-ink mt-0.5 text-sm font-bold">{value}</p></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-card border-line mt-4 rounded-[20px] border p-4"><p className="text-ink mb-2 text-sm font-extrabold">{title}</p>{children}</div>;
}
