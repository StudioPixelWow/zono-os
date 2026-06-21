import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getConfiguration, type ConfigStatus } from "@/lib/configuration/service";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ConfigStatus, string> = { configured: "מוגדר", partial: "חלקי", missing: "חסר" };
const STATUS_TONE: Record<ConfigStatus, string> = { configured: "bg-success-soft text-success", partial: "bg-warning-soft text-warning", missing: "bg-surface text-muted" };

export default function ConfigurationPage() {
  const items = getConfiguration();
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Admin · Configuration</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מרכז תצורה</h1>
          <p className="text-muted mt-1 text-sm">מצב ההגדרה של כל אינטגרציה. סטטוס בלבד — סודות לעולם אינם נחשפים.</p>
        </div>
        <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((c) => (
          <div key={c.key} className="bg-card border-line flex items-start justify-between gap-3 rounded-[16px] border p-4">
            <div className="min-w-0">
              <p className="text-ink text-sm font-extrabold">{c.label}</p>
              <p className="text-muted mt-0.5 text-[12px]">{c.note}</p>
            </div>
            <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-black", STATUS_TONE[c.status])}>{STATUS_LABEL[c.status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
