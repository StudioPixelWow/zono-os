import Link from "next/link";
import { getPlanAction } from "@/lib/launch/server/actions";
import { PlanView } from "./PlanView";

export const dynamic = "force-dynamic";

export default async function PlanRoute() {
  const res = await getPlanAction();
  if (!res.ok) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <p className="text-ink font-extrabold">לא ניתן לטעון</p>
        <p className="text-muted text-sm">{res.error}</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  return <PlanView current={res.data} />;
}
