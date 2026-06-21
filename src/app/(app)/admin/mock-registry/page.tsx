import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { MOCK_REGISTRY } from "@/lib/mock-registry/registry";

export const dynamic = "force-dynamic";

export default function MockRegistryPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Admin · Mock Registry</p>
          <h1 className="text-ink mt-1 text-2xl font-black">רישום נתוני הדגמה</h1>
          <p className="text-muted mt-1 text-sm">שקיפות מלאה — כל מקום שבו המערכת משתמשת ב-mock/placeholder/עתידי, האם בטוח לפרודקשן, ומסלול ההחלפה. פרודקשן לעולם לא משתמש ב-mock בשקט.</p>
        </div>
        <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
      </div>

      <div className="flex flex-col gap-3">
        {MOCK_REGISTRY.map((m) => (
          <div key={m.id} className="bg-card border-line rounded-[16px] border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink text-sm font-extrabold">{m.area}</p>
              <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-black", m.productionSafe ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{m.productionSafe ? "בטוח לפרודקשן" : "סיכון בפרודקשן"}</span>
            </div>
            <p className="text-muted mt-1 font-mono text-[11px]" dir="ltr">{m.where}</p>
            <div className="mt-2 grid grid-cols-1 gap-1 text-[12px] sm:grid-cols-2">
              <p><span className="text-muted">סיבה: </span><span className="text-ink">{m.why}</span></p>
              <p><span className="text-muted">בטיחות: </span><span className="text-ink">{m.safeNote}</span></p>
              <p className="sm:col-span-2"><span className="text-muted">החלפה: </span><span className="text-brand-strong font-semibold">{m.replacement}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
