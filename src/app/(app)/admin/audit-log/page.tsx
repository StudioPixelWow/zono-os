import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getAuditLog } from "@/lib/audit/service";

export const dynamic = "force-dynamic";

const CATEGORIES: { key: string; label: string }[] = [
  { key: "", label: "הכל" },
  { key: "area", label: "אזורי פעילות" },
  { key: "system", label: "מערכת" },
  { key: "deal", label: "עסקאות" },
  { key: "assignment", label: "שיוכים" },
  { key: "approval", label: "אישורים" },
  { key: "pricing", label: "תמחור" },
  { key: "permission", label: "הרשאות" },
  { key: "configuration", label: "תצורה" },
];
const fmt = (s: string) => new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const rows = await getAuditLog({ category: category || undefined, limit: 150 }).catch(() => []);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Admin · Audit Log</p>
          <h1 className="text-ink mt-1 text-2xl font-black">יומן ביקורת</h1>
          <p className="text-muted mt-1 text-sm">תיעוד מרכזי של פעולות רגישות — מי עשה מה ומתי. ניתן לסינון לפי קטגוריה.</p>
        </div>
        <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Link key={c.key} href={c.key ? `/admin/audit-log?category=${c.key}` : "/admin/audit-log"}
            className={cn("rounded-full border px-3 py-1 text-[12px] font-bold", (category ?? "") === c.key ? "bg-brand text-white border-brand" : "bg-card text-muted border-line")}>
            {c.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-card border-line rounded-[20px] border p-10 text-center">
          <p className="text-muted text-sm">אין רשומות ביומן (או שאין לך הרשאת מנהל לצפייה).</p>
        </div>
      ) : (
        <div className="bg-card border-line overflow-hidden rounded-[20px] border">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface text-muted text-[11px] font-bold">
              <tr>{["זמן", "מבצע", "פעולה", "תיאור", "קטגוריה"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-line border-t">
                  <td className="text-muted px-3 py-2 whitespace-nowrap text-[11px]">{fmt(r.created_at)}</td>
                  <td className="text-ink px-3 py-2 text-[12px] font-semibold">{r.actor_name ?? "—"}</td>
                  <td className="text-muted px-3 py-2 font-mono text-[11px]" dir="ltr">{r.action}</td>
                  <td className="text-ink px-3 py-2 text-[12px]">{r.summary ?? "—"}</td>
                  <td className="text-muted px-3 py-2 text-[11px]">{r.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
