import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { getDataQualityReport, type DQCategory } from "@/lib/data-quality/service";

export const dynamic = "force-dynamic";

const tone = (n: number) => (n >= 80 ? "text-success" : n >= 50 ? "text-warning" : "text-danger");
const sevTone: Record<string, string> = { critical: "text-danger", high: "text-danger", medium: "text-warning", low: "text-muted" };

export default async function DataQualityPage() {
  const report = await getDataQualityReport().catch(() => null);
  if (!report) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <span className="bg-surface text-muted grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Shield" size={24} /></span>
        <p className="text-ink font-extrabold">לא ניתן לטעון את דוח איכות הדאטה</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Admin · Data Quality</p>
          <h1 className="text-ink mt-1 text-2xl font-black">איכות דאטה</h1>
          <p className="text-muted mt-1 text-sm">זיהוי דאטה שבורה או חסרה לפני שהיא פוגעת במודיעין. ציון בריאות לכל קטגוריה — ככל שגבוה יותר, נקי יותר.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className={cn("text-3xl font-black", tone(report.overallScore))}>{report.overallScore}</p>
            <p className="text-muted text-[11px] font-bold">ציון כולל</p>
          </div>
          <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {report.categories.map((c) => <CategoryCard key={c.key} c={c} />)}
      </div>
    </div>
  );
}

function CategoryCard({ c }: { c: DQCategory }) {
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[18px] border p-4">
      <div className="flex items-center justify-between">
        <p className="text-ink text-sm font-extrabold">{c.label} <span className="text-muted text-[11px] font-bold">· {c.total}</span></p>
        <span className={cn("text-lg font-black", tone(c.healthScore))}>{c.healthScore}</span>
      </div>
      {c.issues.length === 0 ? (
        <p className="text-success text-[12px] font-semibold">אין בעיות שזוהו ✓</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {c.issues.map((i) => (
            <li key={i.key} className="flex items-center justify-between text-[12px]">
              <span className="text-ink">{i.label}</span>
              <span className={cn("font-black", sevTone[i.severity])}>{i.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
