// ============================================================================
// 🗺️ מפת שוק חיה — Live Market Map (PLACEHOLDER, structure only).
// ----------------------------------------------------------------------------
// Per spec: create the navigation entry and page structure ONLY. Do not
// implement map intelligence yet. This is a scaffold under the Market
// Intelligence workspace — no data fetching, no engines, no map rendering.
// ============================================================================
import Link from "next/link";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";

export const dynamic = "force-dynamic";

export default function LiveMarketMapPage() {
  return (
    <div dir="rtl" className="flex flex-col gap-6">
      <WorkspaceHeader
        emoji="🗺️" scope="market" title="מפת שוק חיה"
        subtitle="תצוגת מפה חיה של מודיעין השוק — בפיתוח. שכבות המפה ייחשפו בשלב הבא."
        action={
          <Link href="/market-intelligence" className="border-line bg-card hover:border-brand-light rounded-xl border px-3 py-2 text-sm font-bold transition">
            ← חזרה למודיעין שוק
          </Link>
        }
      />

      <section className="border-line bg-card grid min-h-[55vh] place-items-center rounded-3xl border border-dashed p-8 text-center">
        <div className="max-w-md">
          <span className="text-5xl" aria-hidden>🗺️</span>
          <h2 className="text-ink mt-4 text-xl font-black">מפת השוק החיה בדרך</h2>
          <p className="text-muted mt-2 text-sm">
            כאן תוצג מפה אינטראקטיבית בזמן אמת: נכסים חדשים, ירידות מחיר, אזורים מתחממים ותובנות AI — הכול על גבי מפה אחת.
            המבנה מוכן; אינטליגנציית המפה תתווסף בשלב הבא ללא שינוי בנתונים הקיימים.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/property-radar" className="bg-brand-soft text-brand-strong rounded-xl px-3 py-2 text-sm font-bold">📡 רדאר נכסים — חי</Link>
            <Link href="/market" className="border-line bg-surface text-ink rounded-xl border px-3 py-2 text-sm font-bold">🔥 מפת חום שוק</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
