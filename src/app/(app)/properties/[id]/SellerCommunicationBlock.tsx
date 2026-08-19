// ============================================================================
// ZONO — Property detail · compact "תקשורת עם בעל הנכס" block (server component).
// Shows the seller lifecycle state + a small, agent-facing communication summary
// (last update, reports sent, channel status, next step) from the canonical
// projection. NOT a dashboard. RTL, responsive (stacked rows, no desktop table),
// reuses the design tokens. Never exposes buyer data.
// ============================================================================
import { getSellerLifecycle, getSellerCommunicationSummary } from "@/lib/sellers/lifecycle";
import { getSessionContext } from "@/lib/auth/session";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-muted shrink-0 text-xs">{label}</span>
      <span className="text-ink text-end text-sm font-bold">{value}</span>
    </div>
  );
}

export async function SellerCommunicationBlock({ propertyId }: { propertyId: string }) {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return null;

  const [life, comm] = await Promise.all([
    getSellerLifecycle(orgId, propertyId).catch(() => null),
    getSellerCommunicationSummary(orgId, propertyId).catch(() => null),
  ]);

  if (!comm?.sellerId) {
    return (
      <div className="bg-card border-line rounded-[20px] border p-5">
        <p className="text-ink mb-1 text-sm font-extrabold">תקשורת עם בעל הנכס</p>
        <p className="text-muted text-sm">אין בעל נכס פעיל מקושר לקבלת עדכונים.</p>
      </div>
    );
  }

  const dt = (iso: string) => { try { return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }); } catch { return ""; } };
  const lastLabel = comm.lastUpdate ? `${comm.lastUpdate.kind} · ${dt(comm.lastUpdate.at)}` : "טרם נשלח עדכון";

  return (
    <div className="bg-card border-line rounded-[20px] border p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink text-sm font-extrabold">תקשורת עם בעל הנכס</p>
        {life && <span className="bg-brand-soft text-brand rounded-full px-3 py-1 text-xs font-bold">{life.stateLabel}</span>}
      </div>

      <div className="flex flex-col">
        <Row label="בעל הנכס" value={comm.sellerName ?? "—"} />
        <Row label="עדכון אחרון" value={lastLabel} />
        <Row label="דוחות שנשלחו" value={String(comm.reportsSent)} />
        <Row label="עדכונים ב-30 יום" value={String(comm.updatesLast30d)} />
        <Row label="דיווח במייל" value={comm.receivesReports ? "מנוי פעיל" : "כבוי"} />
        {life?.nextRecommendedAgentAction.label ? <Row label="הצעד הבא" value={life.nextRecommendedAgentAction.label} /> : null}
      </div>

      {life && life.attentionReasons.length > 0 && (
        <div className="bg-warning-soft text-warning mt-3 rounded-2xl px-3 py-2 text-xs font-bold">{life.attentionReasons[0]}</div>
      )}
    </div>
  );
}
