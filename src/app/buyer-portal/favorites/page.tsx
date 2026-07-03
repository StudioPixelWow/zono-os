// ============================================================================
// 🛒 ZONO — Buyer Portal — FAVORITES. 32.3. Saved + recently viewed + updates.
// ============================================================================
import { getBuyerFavorites } from "@/lib/buyer-portal";
import { PortalNav, RecoCard, Glass, AuthGate, EmptyState } from "@/components/buyer-portal/ui";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const r = await getBuyerFavorites();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const f = r.data;

  return (
    <>
      <PortalNav active="/buyer-portal/favorites" />
      <h1 className="text-2xl font-black text-slate-900">המועדפים שלי</h1>

      {f.updates.length > 0 && (
        <Glass className="mt-4 p-4">
          <h2 className="text-[14px] font-black text-slate-800">עדכונים</h2>
          <ul className="mt-2 space-y-1 text-[13px] text-slate-700">{f.updates.map((u, i) => <li key={i}>{u.kind === "price_drop" ? "📉" : u.kind === "status" ? "🔴" : "✨"} {u.detail}</li>)}</ul>
        </Glass>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-xl font-black text-slate-800">נכסים שמורים</h2>
        {f.saved.length === 0 ? <EmptyState title="עוד לא שמרתם נכסים" body="סמנו נכסים בלב כדי לשמור אותם כאן ולעקוב אחרי עדכונים." /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{f.saved.map((p) => <RecoCard key={p.id} {...p} />)}</div>
        )}
      </section>

      {f.recentlyViewed.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-black text-slate-800">נצפו לאחרונה</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{f.recentlyViewed.map((p) => <RecoCard key={p.id} {...p} />)}</div>
        </section>
      )}
    </>
  );
}
