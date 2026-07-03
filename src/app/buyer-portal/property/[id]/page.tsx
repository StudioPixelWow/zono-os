/* eslint-disable @next/next/no-img-element -- external CDN listing photos; next/image would require remotePatterns config */
// ============================================================================
// 🛒 ZONO — Buyer Portal — PROPERTY page. 32.3. Reuses the Listing Agent /
// AI Brokerage Website framework property view + a personal Buyer Match overlay.
// ============================================================================
import { notFound } from "next/navigation";
import { getBuyerProperty } from "@/lib/buyer-portal";
import { PortalNav, Glass, AuthGate } from "@/components/buyer-portal/ui";
import AskBuyer from "@/components/buyer-portal/AskBuyer";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const TRUST_HE = { verified: "מאומת ✓", reviewed: "נבדק", listed: "רשום" } as const;
const DEMAND_HE = { high: "ביקוש גבוה", medium: "ביקוש בינוני", low: "ביקוש נמוך" } as const;
const POS_HE = { below: "מתחת לשוק", within: "בתוך טווח השוק", above: "מעל השוק", unknown: "—" } as const;
const TIER_HE: Record<string, string> = { perfect: "התאמה מושלמת", emerging: "מתפתחת", hidden: "נסתרת", future: "עתידית" };

export default async function PortalPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getBuyerProperty(id);
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  if (!r.data) notFound();
  const { property: p, match } = r.data;
  const b = p.badges;

  return (
    <>
      <PortalNav active="/buyer-portal/properties" />

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
        <div className="text-2xl font-black" style={{ color: "var(--bp-accent)" }}>{fmt(p.price)}</div>
      </div>

      {/* Buyer match overlay */}
      {match && (
        <Glass className="mt-4 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full px-3 py-1 text-[12px] font-bold text-white" style={{ background: "var(--bp-gradient)" }}>{match.tier ? TIER_HE[match.tier] : "התאמה"} · ציון {match.score}</span>
            <h2 className="text-[15px] font-black text-slate-800">למה זה מתאים לכם</h2>
          </div>
          {match.why.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{match.why.map((w, i) => <li key={i} className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-800">✓ {w}</li>)}</ul>}
        </Glass>
      )}

      {/* Market intelligence badges */}
      <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
        <span className="rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-800">{TRUST_HE[b.trust]}</span>
        <span className="rounded-full bg-sky-100 px-3 py-1 font-bold text-sky-800">{DEMAND_HE[b.demand]}</span>
        {b.marketScore != null && <span className="rounded-full bg-indigo-100 px-3 py-1 font-bold text-indigo-800">ביצועי שוק {b.marketScore}/100</span>}
        {b.pricePosition !== "unknown" && <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800">מחיר {POS_HE[b.pricePosition]}</span>}
      </div>

      {/* AI summary + highlights */}
      <Glass className="mt-5 p-5">
        <h2 className="text-lg font-black text-slate-800">סיכום AI</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-700">{p.aiSummary}</p>
        {p.highlights.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">{p.highlights.map((h, i) => <li key={i} className="rounded-lg bg-white/70 px-2.5 py-1 text-[12px] font-semibold text-slate-700">• {h}</li>)}</ul>}
      </Glass>

      {/* Actions (approval-gated — nothing auto-sent) */}
      <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
        <span className="rounded-xl bg-emerald-600 px-5 py-2.5 text-white">📅 בקשת צפייה</span>
        <span className="rounded-xl border border-slate-300 px-5 py-2.5 text-slate-700">❤️ שמירה</span>
        <span className="rounded-xl border border-slate-300 px-5 py-2.5 text-slate-700">⚖️ השוואה</span>
        <span className="rounded-xl border border-slate-300 px-5 py-2.5 text-slate-700">↗︎ שיתוף</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">פעולות מתבצעות רק לאחר אישורכם ובתיאום עם הברוקר.</p>

      <section className="mt-6"><AskBuyer suggestions={[`ספרו לי עוד על ${p.title}`, "האם המחיר תחרותי?", "מה יש בסביבה?", "כמה נכסים דומים יש?"]} /></section>
    </>
  );
}
