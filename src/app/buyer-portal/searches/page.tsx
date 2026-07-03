// ============================================================================
// 🛒 ZONO — Buyer Portal — SAVED SEARCHES. 32.3. Derived from your own criteria.
// ============================================================================
import { getBuyerDashboard } from "@/lib/buyer-portal";
import { PortalNav, Glass, AuthGate, EmptyState } from "@/components/buyer-portal/ui";

export const dynamic = "force-dynamic";

export default async function SearchesPage() {
  const r = await getBuyerDashboard();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const searches = r.data.dashboard.savedSearches;

  return (
    <>
      <PortalNav active="/buyer-portal/searches" />
      <h1 className="text-2xl font-black text-slate-900">החיפושים השמורים שלי</h1>
      {searches.length === 0 ? (
        <div className="mt-8"><EmptyState title="אין חיפושים שמורים" body="הגדירו העדפות בפרופיל — תקציב, אזורים וסוג נכס — וניצור עבורכם חיפוש חכם." /></div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {searches.map((sc, i) => (
            <Glass key={i} className="p-5">
              <h2 className="text-[15px] font-black text-slate-800">🔍 {sc.label}</h2>
              <p className="mt-1 text-[13px] text-slate-600">{sc.criteria}</p>
              <p className="mt-2 text-[11px] text-slate-400">מתעדכן אוטומטית — התאמות חדשות יופיעו בעמוד הנכסים.</p>
            </Glass>
          ))}
        </div>
      )}
    </>
  );
}
