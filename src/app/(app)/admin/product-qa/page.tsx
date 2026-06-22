import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { QA_ITEMS, QA_SUMMARY, type QaStatus } from "@/lib/product-qa/status";

export const dynamic = "force-dynamic";

const STATUS_META: Record<QaStatus, { label: string; tone: string; icon: string }> = {
  pass: { label: "עובר", tone: "bg-success-soft text-success", icon: "Check" },
  partial: { label: "חלקי", tone: "bg-warning-soft text-warning", icon: "AlertTriangle" },
  fail: { label: "ממתין", tone: "bg-danger-soft text-danger", icon: "Minus" },
};

export default function ProductQaPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Admin · Product QA</p>
          <h1 className="text-ink mt-1 text-2xl font-black">דוח QA מוצר</h1>
          <p className="text-muted mt-1 text-sm">מצב חבילת התיקונים הקריטיים — מה מוכן לפרודקשן, מה חלקי ומה ממתין.</p>
        </div>
        <div className="flex gap-2">
          <Pill label="עובר" value={QA_SUMMARY.pass} tone="bg-success-soft text-success" />
          <Pill label="חלקי" value={QA_SUMMARY.partial} tone="bg-warning-soft text-warning" />
          <Pill label="ממתין" value={QA_SUMMARY.fail} tone="bg-danger-soft text-danger" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {QA_ITEMS.map((item) => {
          const m = STATUS_META[item.status];
          return (
            <div key={item.id} className="bg-card border-line flex items-start gap-3 rounded-2xl border p-4 shadow-sm">
              <span className="bg-surface text-muted grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black">{item.id}</span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-ink text-sm font-extrabold">{item.title}</h2>
                  <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", m.tone)}>
                    <Icon name={m.icon} size={11} />{m.label}
                  </span>
                </div>
                <p className="text-muted mt-1 text-[13px] leading-relaxed">{item.notes}</p>
              </div>
              <span className="text-muted shrink-0 text-[11px] font-semibold">{item.lastChecked}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-bold", tone)}>
      {value} {label}
    </span>
  );
}
