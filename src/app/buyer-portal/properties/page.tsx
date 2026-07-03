// ============================================================================
// 🛒 ZONO — Buyer Portal — PROPERTIES (AI recommendations). 32.3.
// Perfect / Emerging / Hidden / Future matches — each explains WHY it fits you.
// ============================================================================
import { getBuyerRecommendations } from "@/lib/buyer-portal";
import { PortalNav, RecoCard, AuthGate, EmptyState } from "@/components/buyer-portal/ui";

export const dynamic = "force-dynamic";

const SECTIONS: { key: "perfect" | "emerging" | "hidden" | "future"; label: string }[] = [
  { key: "perfect", label: "התאמות מושלמות" }, { key: "emerging", label: "התאמות מתפתחות" },
  { key: "hidden", label: "הזדמנויות נסתרות" }, { key: "future", label: "התאמות עתידיות" },
];

export default async function PropertiesPage() {
  const r = await getBuyerRecommendations();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const rec = r.data;
  const total = rec.perfect.length + rec.emerging.length + rec.hidden.length + rec.future.length;

  return (
    <>
      <PortalNav active="/buyer-portal/properties" />
      <h1 className="text-2xl font-black text-slate-900">הנכסים שנבחרו עבורכם</h1>
      <p className="mt-1 text-[13px] text-slate-600">{total} התאמות · כל אחת מוסברת לפי ההעדפות שלכם</p>
      {total === 0 ? (
        <div className="mt-8"><EmptyState title="עוד אין התאמות" body="עדכנו העדפות בפרופיל — תקציב, אזורים וסוג נכס — ונמצא לכם נכסים מתאימים." /></div>
      ) : SECTIONS.map((s) => rec[s.key].length > 0 && (
        <section key={s.key} className="mt-8">
          <h2 className="mb-3 text-xl font-black text-slate-800">{s.label} <span className="text-[13px] font-normal text-slate-400">({rec[s.key].length})</span></h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{rec[s.key].map((p) => <RecoCard key={p.id} {...p} />)}</div>
        </section>
      ))}
    </>
  );
}
