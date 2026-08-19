// ============================================================================
// ZONO — Marketing Plan review ("תוכנית השיווק לשבוע"). Autopilot 2.0: if an OPEN
// stateful plan exists we render the full editable WORKBOARD (review → edit → ONE
// approval → execution status); otherwise we show the deterministic recommendation
// and a single "הכן לי את השיווק לשבוע" CTA that prepares the draft. Every action
// still executes through the EXISTING engines with their own approval/consent/dedup.
// Server component, RTL, image-led. Nothing here publishes or messages by itself.
// ============================================================================
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPropertyMarketingAutopilot } from "@/lib/marketing-autopilot/autopilot";
import { getOpenPlanWorkboard } from "@/lib/marketing-autopilot/plan-view";
import { Icon } from "@/components/dashboard/Icon";
import { PlanWorkboardClient } from "./PlanWorkboardClient";
import { PreparePlanButton } from "./PreparePlanButton";

export const dynamic = "force-dynamic";

export default async function MarketingPlanPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) notFound();
  let isManager = false;
  try { const sb = await createClient(); const { data } = await sb.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* agent */ }

  // 1) Open stateful plan → full workboard.
  const wb = await getOpenPlanWorkboard(orgId, propertyId);
  if (wb) {
    return (
      <PlanWorkboardClient
        planId={wb.row.id} propertyId={propertyId} status={wb.row.status} snapshot={wb.snapshot}
        groups={wb.groups} creatives={wb.creatives} identity={wb.identity}
      />
    );
  }

  // 2) No plan yet → recommendation + prepare CTA.
  const a = await getPropertyMarketingAutopilot(orgId, propertyId, { isManager });
  if (!a) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <Link href={`/properties/${propertyId}`} className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
        <Icon name="ChevronRight" size={16} /> חזרה לנכס
      </Link>

      <div className="bg-card border-line overflow-hidden rounded-[24px] border">
        <div className="flex flex-col sm:flex-row">
          {a.imageUrl && <div className="relative h-40 w-full shrink-0 sm:h-auto sm:w-56"><Image src={a.imageUrl} alt="" fill className="object-cover" sizes="224px" /></div>}
          <div className="flex flex-1 flex-col gap-2 p-5">
            <p className="text-brand text-xs font-extrabold">שיווק לשבוע</p>
            <h1 className="text-ink text-2xl font-black">{a.title ?? "נכס"}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${a.state === "blocked" ? "bg-danger-soft text-danger" : a.state === "healthy" || a.state === "active" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{a.stateLabel}</span>
              {a.recommendation.priority !== "none" && <span className="bg-brand-soft text-brand rounded-full px-3 py-1 text-xs font-bold">{a.recommendation.priority}</span>}
            </div>
            <p className="text-muted mt-1 text-sm">{a.recommendation.reason}</p>
          </div>
        </div>
      </div>

      {a.reasons.length > 0 && (
        <div className="bg-card border-line rounded-[20px] border p-5">
          <p className="text-ink mb-3 text-sm font-extrabold">מה ZONO מזהה</p>
          <ul className="flex flex-col gap-2">
            {a.reasons.map((r, i) => <li key={i} className="text-ink flex items-start gap-2 text-sm"><span className="bg-warning mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />{r}</li>)}
          </ul>
        </div>
      )}

      <div className="bg-brand-soft border-brand/20 flex flex-col items-center gap-3 rounded-[20px] border p-6 text-center">
        <p className="text-ink text-base font-extrabold">ZONO תכין עבורך תוכנית שיווק מלאה לשבוע</p>
        <p className="text-muted text-sm">כתובית, מדיה, קבוצות, קהל לקוחות ופעולות המשך — הכל מוכן לעריכה ואישור אחד.</p>
        <PreparePlanButton propertyId={propertyId} />
      </div>

      <p className="text-muted text-center text-xs">כל פעולה מתבצעת דרך המערכת הקיימת (אשף הפרסום / Creative Studio / שליחה ללקוחות) עם האישור והתצוגה המקדימה שכבר קיימים. ZONO מכין — אתם מאשרים.</p>
    </div>
  );
}
