// ============================================================================
// 🛒 ZONO — Buyer Portal — DOCUMENTS. 32.3. Guides + educational material +
// public-safe documents only. No private files exposed.
// ============================================================================
import { getBuyerDocuments } from "@/lib/buyer-portal";
import { PortalNav, Glass, AuthGate } from "@/components/buyer-portal/ui";

export const dynamic = "force-dynamic";

const CAT_HE: Record<string, string> = { guide: "מדריך", education: "חומר לימודי", offer: "הצעה", document: "מסמך" };

export default async function DocumentsPage() {
  const r = await getBuyerDocuments();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const { docs } = r.data;

  return (
    <>
      <PortalNav active="/buyer-portal/documents" />
      <h1 className="text-2xl font-black text-slate-900">מסמכים ומדריכים</h1>
      <p className="mt-1 text-[13px] text-slate-600">חומרים שיעזרו לכם לאורך הדרך. מסמכי הצעה ורכישה יופיעו כאן כשישותפו על ידי הברוקר.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {docs.map((d) => (
          <Glass key={d.id} className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-black text-slate-800">📄 {d.title}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{CAT_HE[d.category] ?? d.category}</span>
            </div>
            {d.body && <p className="mt-2 text-[13px] text-slate-600">{d.body}</p>}
            {d.url && <a href={d.url} className="mt-2 inline-block text-[12px] font-bold" style={{ color: "var(--bp-accent)" }}>פתחו ←</a>}
          </Glass>
        ))}
      </div>
    </>
  );
}
