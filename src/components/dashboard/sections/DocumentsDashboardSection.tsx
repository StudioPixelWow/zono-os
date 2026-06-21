import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getDocumentsCommandCenter } from "@/lib/documents/service";

/** Documents & signature health on the home dashboard (server component). */
export async function DocumentsDashboardSection() {
  let cc;
  try { cc = await getDocumentsCommandCenter(); }
  catch (e) { console.error("[documents] dashboard failed:", e); return null; }
  if (cc.documents.length === 0 && cc.pendingSignatures === 0 && cc.blockedDeals === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Presentation" size={16} /></span>
          <h2 className="text-ink text-lg font-black">מסמכים וחתימות</h2>
        </div>
        <Link href="/documents" className="text-brand-strong text-sm font-bold hover:underline">למרכז המסמכים ←</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="ממתינים לחתימה" value={cc.pendingSignatures} tone="text-warning" />
        <Card label="עסקאות חסומות" value={cc.blockedDeals} tone="text-danger" />
        <Card label="מסמכים חסרים" value={cc.missingDocuments} tone="text-danger" />
        <Card label="פגי תוקף בקרוב" value={cc.expiringSoon} tone="text-warning" />
      </div>
      {cc.blockedDeals > 0 && (
        <Link href="/documents" className="bg-danger-soft text-danger flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="AlertTriangle" size={15} />{cc.blockedDeals} עסקאות חסומות בשל מסמכים חסרים
        </Link>
      )}
    </section>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-3 shadow-sm">
      <span className="text-muted text-[12px] font-bold">{label}</span>
      <span className={`text-2xl font-black ${tone}`}>{value}</span>
    </div>
  );
}
