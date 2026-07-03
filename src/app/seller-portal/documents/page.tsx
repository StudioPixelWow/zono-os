// ============================================================================
// 🏷️ ZONO — Seller Portal — DOCUMENTS. 32.4. Listing agreement, valuation,
// marketing material, guides + offer documents — only authorized files.
// ============================================================================
import { getSellerDocuments } from "@/lib/seller-portal";
import { PortalNav, Glass, AuthGate } from "@/components/seller-portal/ui";

export const dynamic = "force-dynamic";

const CAT_HE: Record<string, string> = { agreement: "הסכם", valuation: "הערכת שווי", marketing: "שיווק", guide: "מדריך", offer: "הצעה" };

export default async function DocumentsPage() {
  const r = await getSellerDocuments();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const { docs } = r.data;

  return (
    <>
      <PortalNav active="/seller-portal/documents" />
      <h1 className="text-2xl font-black text-slate-900">מסמכים ומדריכים</h1>
      <p className="mt-1 text-[13px] text-slate-600">מסמכי הנכס שלכם וחומרים שיעזרו לאורך המכירה. רק קבצים מורשים מוצגים.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {docs.map((d) => (
          <Glass key={d.id} className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-black text-slate-800">📄 {d.title}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{CAT_HE[d.category] ?? d.category}</span>
            </div>
            {d.body && <p className="mt-2 text-[13px] text-slate-600">{d.body}</p>}
            {d.url ? <a href={d.url} className="mt-2 inline-block text-[12px] font-bold" style={{ color: "var(--sp-accent)" }}>פתחו ←</a>
              : <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${d.available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{d.available ? "זמין" : "יתווסף בהמשך"}</span>}
          </Glass>
        ))}
      </div>
    </>
  );
}
