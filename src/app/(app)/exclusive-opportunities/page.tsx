import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getExclusiveDashboardAction } from "@/lib/exclusive-acquisition/actions";
import { ExclusiveOpportunitiesView } from "./ExclusiveOpportunitiesView";

export const dynamic = "force-dynamic";

export default async function ExclusiveOpportunitiesPage() {
  const res = await getExclusiveDashboardAction();
  if (!res.ok) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <span className="bg-surface text-muted grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Handshake" size={24} /></span>
        <p className="text-ink font-extrabold">לא ניתן לטעון את מנוע הבלעדיות</p>
        <p className="text-muted text-sm">{res.error}</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  return <ExclusiveOpportunitiesView initial={res.data} />;
}
