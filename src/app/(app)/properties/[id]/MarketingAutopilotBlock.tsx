// ============================================================================
// ZONO — Property Control Center · Marketing Autopilot block (server component).
// Compact: marketing state + the ONE recommended action (with a working CTA into
// the existing engine) + real evidence chips + a prepared-plan peek. All facts
// from getPropertyMarketingAutopilot — no fetching logic here, no fabricated
// metrics. RTL, design tokens. Every state has one clear next action.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPropertyMarketingAutopilot } from "@/lib/marketing-autopilot/autopilot";
import { getOpenPlanBadge } from "@/lib/marketing-autopilot/plan-view";
import { PLAN_STATUS_LABEL } from "@/lib/marketing-autopilot/plan-core";

function Chip({ tone, children }: { tone: "brand" | "success" | "warning" | "danger" | "muted"; children: React.ReactNode }) {
  const cls = tone === "success" ? "bg-success-soft text-success" : tone === "warning" ? "bg-warning-soft text-warning" : tone === "danger" ? "bg-danger-soft text-danger" : tone === "muted" ? "bg-surface text-muted" : "bg-brand-soft text-brand";
  return <span className={`${cls} rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap`}>{children}</span>;
}

export async function MarketingAutopilotBlock({ propertyId }: { propertyId: string }) {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return null;
  let isManager = false;
  try { const sb = await createClient(); const { data } = await sb.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* agent */ }

  const [a, planBadge] = await Promise.all([
    getPropertyMarketingAutopilot(orgId, propertyId, { isManager }),
    getOpenPlanBadge(orgId, propertyId),
  ]);
  if (!a) return null;

  const rec = a.recommendation;
  const planHref = `/distribution/marketing-plan/${propertyId}`;
  // State-aware primary CTA driven by the stateful plan (Phase 13).
  const planCta = planBadge
    ? planBadge.failedItems > 0 ? { label: "פעולה בתוכנית דורשת טיפול", tone: "danger" as const }
      : planBadge.status === "draft" ? { label: "המשך עריכת התוכנית", tone: "brand" as const }
      : planBadge.status === "approved" || planBadge.status === "activating" || planBadge.status === "active" ? { label: "צפה בתוכנית הפעילה", tone: "success" as const }
      : planBadge.status === "partially_completed" ? { label: "פעולה בתוכנית דורשת טיפול", tone: "danger" as const }
      : { label: "צפה בתוכנית", tone: "brand" as const }
    : { label: "הכן תוכנית שיווק", tone: "brand" as const };
  const naTone = rec.priority === "P0" ? "danger" : rec.priority === "P1" ? "brand" : "muted";
  const naCls = naTone === "danger" ? "bg-danger-soft border-danger/30" : naTone === "brand" ? "bg-brand-soft border-brand/30" : "bg-surface border-line";
  const ev = a.evidence;
  const planStatusTone: Record<string, "brand" | "success" | "warning" | "muted"> = { ready: "success", needs_approval: "brand", needs_content: "warning", blocked: "warning", suggested: "muted" };

  return (
    <div className="bg-card border-line rounded-[20px] border p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-ink text-sm font-extrabold">שיווק אוטומטי</p>
        <div className="flex items-center gap-2">
          {planBadge && <Chip tone={planCta.tone}>{PLAN_STATUS_LABEL[planBadge.status]}</Chip>}
          <Chip tone={a.state === "blocked" ? "danger" : a.state === "healthy" || a.state === "active" ? "success" : "warning"}>{a.stateLabel}</Chip>
        </div>
      </div>

      {/* State-aware plan CTA (stateful plan overrides the raw recommendation) */}
      <Link href={planHref} className={`mb-3 flex items-center justify-between gap-2 rounded-2xl border p-3 ${planCta.tone === "danger" ? "bg-danger-soft border-danger/30" : planCta.tone === "success" ? "bg-success-soft border-success/30" : "bg-brand-soft border-brand/30"}`}>
        <span className="text-ink text-sm font-extrabold">{planCta.label}</span>
        <span className="text-muted text-xs font-bold">{planBadge ? `${planBadge.itemCount} פעולות` : "→"}</span>
      </Link>

      {/* The one recommended action */}
      {rec.priority !== "none" ? (
        <div className={`${naCls} mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4`}>
          <div className="min-w-0">
            <p className="text-muted mb-1 text-xs font-bold">הפעולה הבאה · {rec.priority}</p>
            <p className="text-ink text-sm font-extrabold">{rec.title}</p>
            <p className="text-muted mt-0.5 text-xs">{rec.reason}</p>
          </div>
          <Link href={rec.href} className="bg-brand shrink-0 rounded-xl px-4 py-2 text-sm font-extrabold text-white">{rec.title}</Link>
        </div>
      ) : (
        <p className="text-muted mb-3 text-sm">{rec.reason}</p>
      )}

      {/* Real evidence chips */}
      <div className="mb-3 flex flex-wrap gap-2">
        <Chip tone="muted">{Number(ev.publications)} פרסומים</Chip>
        {Number(ev.failedPublications) > 0 && <Chip tone="danger">{Number(ev.failedPublications)} נכשלו</Chip>}
        <Chip tone={ev.nextScheduledAt ? "success" : "warning"}>{ev.nextScheduledAt ? "פרסום מתוזמן" : "אין פרסום עתידי"}</Chip>
        {Number(ev.unusedGroups) > 0 && <Chip tone="brand">{Number(ev.unusedGroups)} קבוצות חדשות</Chip>}
        {Number(ev.strongUnsent) > 0 && <Chip tone="brand">{Number(ev.strongUnsent)} התאמות שלא קיבלו</Chip>}
        {Number(ev.interestedNoViewing) > 0 && <Chip tone="warning">{Number(ev.interestedNoViewing)} מתעניינים ללא ביקור</Chip>}
      </div>

      {/* Prepared plan peek */}
      {a.plan.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-ink text-xs font-extrabold">תוכנית השבוע</p>
            <Link href={`/distribution/marketing-plan/${propertyId}`} className="text-brand text-xs font-bold hover:underline">תוכנית מלאה</Link>
          </div>
          <ul className="flex flex-col gap-1.5">
            {a.plan.slice(0, 4).map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="text-ink truncate text-sm">{it.title}</span>
                <Chip tone={planStatusTone[it.status] ?? "muted"}>{it.status === "ready" ? "מוכן" : it.status === "needs_approval" ? "לאישור" : it.status === "needs_content" ? "נדרש תוכן" : "מוצע"}</Chip>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
