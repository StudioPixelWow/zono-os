import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getTeamAdmin, type TeamAdmin } from "@/lib/team-admin/service";
import { AgentsView } from "./AgentsView";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  let data: TeamAdmin | null = null;
  try { data = await getTeamAdmin(); } catch (e) { console.error("[team-admin] load failed:", e); }

  if (!data || !data.isManager) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <span className="bg-surface text-muted grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Lock" size={24} /></span>
        <p className="text-ink font-extrabold">ניהול סוכנים זמין למנהל/בעלים בלבד</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  return <AgentsView data={data} />;
}
