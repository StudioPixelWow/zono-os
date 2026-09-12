import Link from "next/link";
import { getPlanAction } from "@/lib/launch/server/actions";
import { getSessionContext } from "@/lib/auth/session";
import { getOrgBillingOverview } from "@/lib/commercial/overview";
import { PlanView } from "./PlanView";
import { BillingActivationPanel } from "./BillingActivationPanel";

export const dynamic = "force-dynamic";

export default async function PlanRoute() {
  const res = await getPlanAction();
  // Billing overview (trial→paid activation surface) — best-effort; the plan tiers
  // still render if it can't load.
  let overview = null;
  try {
    const sc = await getSessionContext();
    if (sc.state === "ready" && sc.profile?.org_id) overview = await getOrgBillingOverview(sc.profile.org_id);
  } catch { /* non-fatal */ }
  if (!res.ok) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <p className="text-ink font-extrabold">לא ניתן לטעון</p>
        <p className="text-muted text-sm">{res.error}</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      {overview && <BillingActivationPanel overview={overview} />}
      <PlanView current={res.data} />
    </div>
  );
}
