// ============================================================================
// ZONO — Marketing Plan review ("תוכנית השיווק לשבוע"). ZONO PREPARES; the human
// approves + executes through the EXISTING engines. STATUS → WHY → THIS WEEK →
// (per-item) OPEN THE ENGINE. Every plan item deep-links into the real campaign
// wizard / Creative Studio / property flow where the actual approval + execution
// (with preview parity, readiness, consent, dedup) already lives. Nothing here
// publishes or messages by itself. Server component, RTL, image-led workboard.
// ============================================================================
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getPropertyMarketingAutopilot } from "@/lib/marketing-autopilot/autopilot";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ready: "מוכן להפעלה", needs_approval: "ממתין לאישור", needs_content: "נדרש תוכן", suggested: "מוצע", blocked: "חסום" };
const STATUS_CLS: Record<string, string> = { ready: "bg-success-soft text-success", needs_approval: "bg-brand-soft text-brand", needs_content: "bg-warning-soft text-warning", suggested: "bg-surface text-muted", blocked: "bg-danger-soft text-danger" };

export default async function MarketingPlanPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) notFound();
  let isManager = false;
  try { const sb = await createClient(); const { data } = await sb.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* agent */ }

  const a = await getPropertyMarketingAutopilot(orgId, propertyId, { isManager });
  if (!a) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <Link href={`/properties/${propertyId}`} className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
        <Icon name="ChevronRight" size={16} /> חזרה לנכס
      </Link>

      {/* STATUS hero */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border">
        <div className="flex flex-col sm:flex-row">
          {a.imageUrl ? (
            <div className="relative h-40 w-full shrink-0 sm:h-auto sm:w-56"><Image src={a.imageUrl} alt="" fill className="object-cover" sizes="224px" /></div>
          ) : null}
          <div className="flex flex-1 flex-col gap-2 p-5">
            <p className="text-brand text-xs font-extrabold">תוכנית השיווק לשבוע</p>
            <h1 className="text-ink text-2xl font-black">{a.title ?? "נכס"}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${a.state === "blocked" ? "bg-danger-soft text-danger" : a.state === "healthy" || a.state === "active" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{a.stateLabel}</span>
              {a.recommendation.priority !== "none" && <span className="bg-brand-soft text-brand rounded-full px-3 py-1 text-xs font-bold">{a.recommendation.priority}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* WHY */}
      {a.reasons.length > 0 && (
        <div className="bg-card border-line rounded-[20px] border p-5">
          <p className="text-ink mb-3 text-sm font-extrabold">למה זה חשוב</p>
          <ul className="flex flex-col gap-2">
            {a.reasons.map((r, i) => (
              <li key={i} className="text-ink flex items-start gap-2 text-sm"><span className="bg-warning mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* THIS WEEK — the prepared workboard */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-ink text-lg font-black">השבוע</h2>
          {a.recommendation.priority !== "none" && <Link href={a.recommendation.href} className="bg-brand rounded-xl px-5 py-2.5 text-sm font-extrabold text-white">{a.recommendation.title}</Link>}
        </div>

        {a.plan.length === 0 ? (
          <div className="bg-card border-line rounded-[20px] border p-6 text-center">
            <div className="text-3xl">✓</div>
            <p className="text-ink mt-2 text-base font-bold">{a.recommendation.reason}</p>
          </div>
        ) : (
          a.plan.map((it, i) => (
            <div key={i} className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="text-ink text-sm font-extrabold">{it.title}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLS[it.status] ?? "bg-surface text-muted"}`}>{STATUS_LABEL[it.status] ?? it.status}</span>
                  {it.requiresApproval && <span className="bg-surface text-muted rounded-full px-2.5 py-0.5 text-xs font-bold">דורש אישור</span>}
                </div>
                <p className="text-muted text-sm">{it.reason}</p>
                <p className="text-muted mt-1 text-xs">{it.channel} · {it.audience}</p>
              </div>
              <Link href={it.executionRoute} className="border-line text-ink shrink-0 rounded-xl border px-4 py-2 text-center text-sm font-bold hover:bg-surface">פתיחה במערכת</Link>
            </div>
          ))
        )}
      </div>

      <p className="text-muted text-center text-xs">כל פעולה מתבצעת דרך המערכת הקיימת (אשף הפרסום / Creative Studio / שליחה ללקוחות) עם האישור והתצוגה המקדימה שכבר קיימים. ZONO מכין — אתם מאשרים.</p>
    </div>
  );
}
