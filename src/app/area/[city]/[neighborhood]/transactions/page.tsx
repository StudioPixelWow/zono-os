// ============================================================================
// 🌍 Area Portal — NEIGHBORHOOD transaction center. 32.5. Public deals only.
// ============================================================================
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNeighborhood, seoForNeighborhood, cityUrl, nbUrl } from "@/lib/area-portal";
import { JsonLd, Glass, Stat, Breadcrumbs } from "@/components/area-portal/ui";

export const revalidate = 900;
const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);

export async function generateMetadata({ params }: { params: Promise<{ city: string; neighborhood: string }> }): Promise<Metadata> {
  const { city, neighborhood } = await params;
  const v = await getNeighborhood(decodeURIComponent(city), decodeURIComponent(neighborhood));
  if (!v) return { title: "שכונה לא נמצאה" };
  return { title: `עסקאות ב${v.neighborhood}, ${v.city} | ZONO`, description: v.summary, alternates: { canonical: `${nbUrl("", v.city, v.neighborhood)}/transactions` } };
}

export default async function TransactionsPage({ params }: { params: Promise<{ city: string; neighborhood: string }> }) {
  const { city, neighborhood } = await params;
  const v = await getNeighborhood(decodeURIComponent(city), decodeURIComponent(neighborhood));
  if (!v) notFound();
  const seo = seoForNeighborhood(v, ""); const m = v.market;
  return (
    <main>
      <JsonLd data={seo.jsonLd} />
      <Breadcrumbs trail={[{ name: "אזורים", href: "/area" }, { name: v.city, href: cityUrl("", v.city) }, { name: v.neighborhood, href: nbUrl("", v.city, v.neighborhood) }, { name: "עסקאות" }]} />
      <h1 className="text-2xl font-black text-slate-900">עסקאות ב{v.neighborhood}</h1>
      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="עסקאות" value={`${m.transactions}`} />
        <Stat label="מחיר ממוצע" value={fmt(m.avgSoldPrice)} />
        <Stat label="מחיר למ״ר" value={m.pricePerSqm != null ? fmt(m.pricePerSqm) : "—"} />
        <Stat label="גודל ממוצע" value={m.avgSize != null ? `${m.avgSize} מ״ר` : "—"} />
      </section>
      {v.transactions.length === 0 ? <p className="mt-10 text-center text-slate-500">אין נתוני עסקאות ציבוריים לאזור זה כרגע.</p> : (
        <Glass className="mt-6 overflow-x-auto p-4">
          <table className="w-full text-right text-[13px]">
            <thead className="text-[11px] text-slate-500"><tr><th className="p-2">תאריך</th><th className="p-2">רחוב</th><th className="p-2">חדרים</th><th className="p-2">מ״ר</th><th className="p-2">מחיר</th><th className="p-2">₪/מ״ר</th></tr></thead>
            <tbody>{v.transactions.map((t, i) => (
              <tr key={i} className="border-t border-slate-100"><td className="p-2">{t.date ?? "—"}</td><td className="p-2">{t.street ?? "—"}</td><td className="p-2">{t.rooms ?? "—"}</td><td className="p-2">{t.area ?? "—"}</td><td className="p-2 font-bold">{fmt(t.price)}</td><td className="p-2">{fmt(t.pricePerSqm)}</td></tr>
            ))}</tbody>
          </table>
        </Glass>
      )}
      <p className="mt-3 text-[11px] text-slate-400">נתוני עסקאות ציבוריים. ZONO אינו מציג נתונים פרטיים או מזהים.</p>
    </main>
  );
}
