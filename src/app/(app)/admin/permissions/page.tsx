import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { ACTIONS, ACTION_LABEL, NOT_APPLICABLE, RESOURCES, ROLES } from "@/lib/permissions/registry";

export const dynamic = "force-dynamic";

function minLabel(min: number): string {
  if (min === NOT_APPLICABLE) return "—";
  const r = [...ROLES].sort((a, b) => a.rank - b.rank).find((x) => x.rank >= min);
  return r?.label ?? `דרגה ${min}`;
}

export default function PermissionsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Admin · Permissions</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מטריצת הרשאות</h1>
          <p className="text-muted mt-1 text-sm">רישום הרשאות מרכזי — תפקיד מינימלי לכל פעולה ומשאב. תואם ל-RLS במסד הנתונים (has_min_role). אינו hardcoded בקוד.</p>
        </div>
        <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
      </div>

      <div className="bg-card border-line rounded-[18px] border p-4">
        <p className="text-ink mb-2 text-sm font-extrabold">תפקידים</p>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <span key={r.key} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold", r.seeded ? "bg-brand-soft text-brand-strong border-brand/30" : "bg-surface text-muted border-line")}>
              {r.label} · {r.rank}{!r.seeded && " (לא מוגדר עדיין)"}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-card border-line overflow-x-auto rounded-[20px] border">
        <table className="w-full text-right text-sm">
          <thead className="bg-surface text-muted text-[11px] font-bold">
            <tr>
              <th className="px-3 py-2">משאב</th>
              {ACTIONS.map((a) => <th key={a} className="px-3 py-2 whitespace-nowrap">{ACTION_LABEL[a]}</th>)}
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map((res) => (
              <tr key={res.resource} className="border-line border-t">
                <td className="text-ink px-3 py-2 font-semibold whitespace-nowrap">{res.label}</td>
                {ACTIONS.map((a) => {
                  const min = res.min[a];
                  return <td key={a} className={cn("px-3 py-2 text-[11px]", min === NOT_APPLICABLE ? "text-muted" : "text-ink font-bold")}>{minLabel(min)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted text-[11px]">הערך בכל תא = התפקיד המינימלי הנדרש לפעולה. ״—״ = לא רלוונטי למשאב.</p>
    </div>
  );
}
