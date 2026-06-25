import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getProductionScoreAction, runDeploymentValidationAction } from "@/lib/launch/server/actions";
import { LaunchReadinessView } from "./LaunchReadinessView";

export const dynamic = "force-dynamic";

export default async function LaunchReadinessRoute() {
  const [scoreRes, deployRes] = await Promise.all([getProductionScoreAction(), runDeploymentValidationAction()]);
  if (!scoreRes.ok) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <span className="bg-surface text-muted grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Shield" size={24} /></span>
        <p className="text-ink font-extrabold">אין הרשאה</p>
        <p className="text-muted text-sm">{scoreRes.error}</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  return <LaunchReadinessView score={scoreRes.data.score} deploy={deployRes.ok ? deployRes.data : null} />;
}
