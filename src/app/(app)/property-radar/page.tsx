import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getPropertyRadarLiveDataAction } from "@/lib/property-radar/live/actions";
import { PropertyRadarLiveView } from "./PropertyRadarLiveView";

export const dynamic = "force-dynamic";

export default async function PropertyRadarLivePage() {
  const res = await getPropertyRadarLiveDataAction();
  if (!res.ok) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <span className="bg-surface text-muted grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Activity" size={24} /></span>
        <p className="text-ink font-extrabold">לא ניתן לטעון את מרכז הפיקוד</p>
        <p className="text-muted text-sm">{res.error}</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  return <PropertyRadarLiveView initial={res.data} />;
}
