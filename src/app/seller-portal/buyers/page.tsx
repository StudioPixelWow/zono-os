// ============================================================================
// 🏷️ ZONO — Seller Portal — BUYER DEMAND. 32.4. Reuses Buyer Matching.
// Perfect / Emerging / Waiting buyers — anonymized (no buyer identity), each
// explaining WHY they fit the property.
// ============================================================================
import { getSellerBuyerDemand } from "@/lib/seller-portal";
import { PortalNav, BuyerCard, AuthGate, EmptyState } from "@/components/seller-portal/ui";

export const dynamic = "force-dynamic";

const SECTIONS: { key: "perfect" | "emerging" | "waiting"; label: string }[] = [
  { key: "perfect", label: "קונים מובילים" }, { key: "emerging", label: "קונים מתפתחים" }, { key: "waiting", label: "קונים בהמתנה" },
];

export default async function BuyersPage() {
  const r = await getSellerBuyerDemand();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const bd = r.data;

  return (
    <>
      <PortalNav active="/seller-portal/buyers" />
      <h1 className="text-2xl font-black text-slate-900">ביקוש הקונים לנכס שלכם</h1>
      <p className="mt-1 text-[13px] text-slate-600">{bd.total} קונים תואמים · פרטי הקונים חסויים; מוצג רק מידע מצרפי</p>
      {bd.total === 0 ? (
        <div className="mt-8"><EmptyState title="עדיין אין קונים תואמים" body="ברגע שיזוהו קונים שמחפשים נכס כמו שלכם, הם יופיעו כאן עם הסבר להתאמה." /></div>
      ) : SECTIONS.map((s) => bd[s.key].length > 0 && (
        <section key={s.key} className="mt-8">
          <h2 className="mb-3 text-xl font-black text-slate-800">{s.label} <span className="text-[13px] font-normal text-slate-400">({bd[s.key].length})</span></h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{bd[s.key].map((b) => <BuyerCard key={b.rank} {...b} />)}</div>
        </section>
      ))}
    </>
  );
}
