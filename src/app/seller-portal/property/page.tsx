/* eslint-disable @next/next/no-img-element -- external CDN listing photos; next/image would require remotePatterns config */
// ============================================================================
// 🏷️ ZONO — Seller Portal — PROPERTY. 32.4. Reuses the Listing Agent / AI
// Brokerage Website framework property view + the seller's performance overlay.
// Always the seller's OWN listing (no client id).
// ============================================================================
import { getSellerProperty } from "@/lib/seller-portal";
import { PortalNav, Glass, Stat, AuthGate, EmptyState } from "@/components/seller-portal/ui";
import AskSeller from "@/components/seller-portal/AskSeller";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const TRUST_HE = { verified: "מאומת ✓", reviewed: "נבדק", listed: "רשום" } as const;
const POS_HE = { below: "מתחת לשוק", within: "בתוך טווח השוק", above: "מעל השוק", unknown: "—" } as const;

export default async function PropertyPage() {
  const r = await getSellerProperty();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  if (!r.data) return (<><PortalNav active="/seller-portal/property" /><div className="mt-6"><EmptyState title="הנכס טרם עלה לשיווק" body="ברגע שהנכס יעלה לשיווק, כל נתוני הביצועים וההערכה יופיעו כאן." /></div></>);
  const { property: p, performance: perf } = r.data;
  const b = p.badges;

  return (
    <>
      <PortalNav active="/seller-portal/property" />

      <div className="overflow-hidden rounded-3xl bg-slate-100 shadow-xl">
        <div className="relative aspect-[16/9]">
          {p.image ? <img src={p.image} alt={p.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-6xl text-slate-300">🏠</div>}
        </div>
        {p.gallery.length > 1 && <div className="flex gap-1 overflow-x-auto p-1">{p.gallery.slice(0, 8).map((g, i) => <img key={i} src={g} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" loading="lazy" />)}</div>}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{p.title}</h1>
          <p className="text-[13px] text-slate-600">{[p.neighborhood, p.city].filter(Boolean).join(", ")}{p.rooms ? ` · ${p.rooms} חדרים` : ""}{p.area ? ` · ${p.area} מ״ר` : ""}</p>
        </div>
        <div className="text-2xl font-black" style={{ color: "var(--sp-accent)" }}>{fmt(perf.askingPrice)}</div>
      </div>

      {/* Valuation + market performance */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="מחיר מבוקש" value={fmt(perf.askingPrice)} />
        <Stat label="הערכת שווי" value={fmt(perf.estimatedValue)} sub={POS_HE[perf.valuationPosition]} />
        <Stat label="פער מחיר" value={perf.priceGapPct != null ? `${perf.priceGapPct > 0 ? "+" : ""}${perf.priceGapPct}%` : "—"} />
        <Stat label="ביצועי שוק" value={perf.marketScore != null ? `${perf.marketScore}/100` : "—"} />
        <Stat label="ביקוש קונים" value={perf.buyerDemandScore != null ? `${perf.buyerDemandScore}/100` : "—"} />
        <Stat label="תחרות" value={perf.competitionPressure != null ? `${perf.competitionPressure}/100` : "—"} />
        <Stat label="ימים בשוק" value={perf.daysOnMarket != null ? `${perf.daysOnMarket}` : "—"} />
        <Stat label="אמון נתונים" value={TRUST_HE[perf.truthTier]} />
      </section>

      {/* Intelligence badges */}
      <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
        <span className="rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-800">{TRUST_HE[b.trust]}</span>
        {b.pricePosition !== "unknown" && <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800">מחיר {POS_HE[b.pricePosition]}</span>}
        {perf.campaignActive && <span className="rounded-full bg-sky-100 px-3 py-1 font-bold text-sky-800">שיווק פעיל</span>}
        {perf.strategyLabel !== "—" && <span className="rounded-full bg-slate-200 px-3 py-1 font-bold text-slate-700">אסטרטגיה: {perf.strategyLabel}</span>}
      </div>

      {/* AI summary */}
      <Glass className="mt-5 p-5">
        <h2 className="text-lg font-black text-slate-800">סיכום AI</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-700">{p.aiSummary}</p>
        {p.highlights.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">{p.highlights.map((h, i) => <li key={i} className="rounded-lg bg-white/70 px-2.5 py-1 text-[12px] font-semibold text-slate-700">• {h}</li>)}</ul>}
      </Glass>

      {/* Nearby competition (related listings from the framework) */}
      {p.related.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-black text-slate-800">תחרות בסביבה</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {p.related.map((x) => (
              <div key={x.id} className="rounded-2xl border border-white/40 bg-white/60 p-3 text-[12px] shadow-sm">
                <div className="line-clamp-1 font-bold text-slate-800">{x.title}</div>
                <div className="font-black" style={{ color: "var(--sp-accent)" }}>{fmt(x.price)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6"><AskSeller suggestions={["האם המחיר תחרותי?", "כמה קונים מתאימים?", "מה מצב התחרות בסביבה?"]} /></section>
    </>
  );
}
