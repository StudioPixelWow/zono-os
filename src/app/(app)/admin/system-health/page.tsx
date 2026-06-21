import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getSystemHealth } from "@/lib/system/service";
import { SystemHealthView } from "./SystemHealthView";

export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  const health = await getSystemHealth().catch(() => null);
  if (!health) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <span className="bg-surface text-muted grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Shield" size={24} /></span>
        <p className="text-ink font-extrabold">אין הרשאה</p>
        <p className="text-muted text-sm">מרכז החישוב זמין למנהלים בלבד.</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  return <SystemHealthView health={health} />;
}
