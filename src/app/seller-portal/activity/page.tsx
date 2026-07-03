// ============================================================================
// 🏷️ ZONO — Seller Portal — ACTIVITY timeline. 32.4. Chronological, public-safe.
// ============================================================================
import { getSellerActivity } from "@/lib/seller-portal";
import { PortalNav, Glass, AuthGate, EmptyState } from "@/components/seller-portal/ui";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = { view: "👁️", favorite: "❤️", inquiry: "📩", appointment: "📅", message: "💬", price: "🏷️", recommendation: "✨", marketing: "📣" };

export default async function ActivityPage() {
  const r = await getSellerActivity();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const { activity } = r.data;

  return (
    <>
      <PortalNav active="/seller-portal/activity" />
      <h1 className="text-2xl font-black text-slate-900">פעילות הנכס</h1>
      {activity.length === 0 ? (
        <div className="mt-8"><EmptyState title="אין עדיין פעילות" body="צפיות, פניות, פגישות והמלצות יופיעו כאן לפי סדר כרונולוגי." /></div>
      ) : (
        <Glass className="mt-6 p-5">
          <ol className="relative space-y-4 border-r border-slate-200 pr-4">
            {activity.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -right-[25px] top-0.5 grid h-6 w-6 place-items-center rounded-full bg-white text-[12px] shadow">{ICON[e.kind] ?? "•"}</span>
                <div className="text-[14px] font-bold text-slate-800">{e.title}</div>
                <div className="text-[11px] text-slate-400">{e.detail} · {new Date(e.at).toLocaleString("he-IL")}</div>
              </li>
            ))}
          </ol>
        </Glass>
      )}
    </>
  );
}
