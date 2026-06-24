import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { MOCK_REGISTRY, MOCK_SUMMARY, type MockCategory } from "@/lib/mock-registry/registry";

export const dynamic = "force-dynamic";

const CATEGORY_TONE: Record<MockCategory, string> = {
  Mock: "bg-danger-soft text-danger",
  Stub: "bg-warning-soft text-warning",
  "Coming Soon": "bg-brand-soft text-brand-strong",
  "External Dependency": "bg-sky-100 text-sky-700",
  "Honest Manual Flow": "bg-success-soft text-success",
};
const CATEGORY_LABEL: Record<MockCategory, string> = {
  Mock: "Mock",
  Stub: "Stub",
  "Coming Soon": "בקרוב",
  "External Dependency": "תלות חיצונית",
  "Honest Manual Flow": "זרימה ידנית כנה",
};

export default function MockRegistryPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Admin · Mock Registry</p>
          <h1 className="text-ink mt-1 text-2xl font-black">רישום נתוני הדגמה</h1>
          <p className="text-muted mt-1 text-sm">מקור האמת לכל מה שעדיין לא חי במלואו — כל mock / stub / ״בקרוב״ / תלות חיצונית / זרימה ידנית כנה, עם איזור, route, סיבה, סטטוס ושלב יעד. רשימה זו מתוחזקת ידנית.</p>
        </div>
        <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="bg-card border-line rounded-2xl border px-3 py-2 text-sm font-bold">{MOCK_SUMMARY.total} פריטים</span>
        {Object.entries(MOCK_SUMMARY.byCategory).map(([cat, n]) => (
          <span key={cat} className={cn("rounded-2xl px-3 py-2 text-sm font-bold", CATEGORY_TONE[cat as MockCategory])}>{CATEGORY_LABEL[cat as MockCategory]}: {n}</span>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {MOCK_REGISTRY.map((m) => (
          <div key={m.id} className="bg-card border-line rounded-[16px] border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink text-sm font-extrabold">{m.area}</p>
              <div className="flex items-center gap-1.5">
                <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-black", CATEGORY_TONE[m.category])}>{CATEGORY_LABEL[m.category]}</span>
                <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-black", m.productionSafe ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{m.productionSafe ? "בטוח לפרודקשן" : "סיכון בפרודקשן"}</span>
              </div>
            </div>
            <div className="text-muted mt-1 flex flex-wrap items-center gap-2 text-[11px]">
              {m.route !== "—" && <span className="bg-surface rounded px-1.5 py-0.5 font-mono" dir="ltr">{m.route}</span>}
              <span className="font-mono" dir="ltr">{m.where}</span>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-1 text-[12px] sm:grid-cols-2">
              <p><span className="text-muted">סיבה: </span><span className="text-ink">{m.why}</span></p>
              <p><span className="text-muted">בטיחות: </span><span className="text-ink">{m.safeNote}</span></p>
              <p><span className="text-muted">החלפה: </span><span className="text-brand-strong font-semibold">{m.replacement}</span></p>
              <p><span className="text-muted">שלב יעד: </span><span className="text-ink font-semibold">{m.targetPhase}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
