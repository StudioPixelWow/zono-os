// ZONO — Customer 360 · Support tab (P5.7). This org's active + resolved tickets,
// priorities, assignee, latest update + create-ticket (if support.manage). Does
// NOT modify CRM records. Tenancy: every ticket bound to org_id. Cap: support.read.
import { authorizePlatform, currentOperatorCan } from "@/lib/platform-admin/server/auth";
import { getOrgSupport } from "@/lib/platform-admin/server/support";
import { RestrictedPanel } from "@/components/platform-admin/customer360-ui";
import { PanelCard } from "@/components/platform-admin/ui";
import { TicketTable, SupportEmpty, SupportUnavailable } from "@/components/platform-admin/support-ui";
import { CreateTicketForm } from "@/components/platform-admin/CreateTicketForm";
import { isActive } from "@/lib/platform-admin/support/model";

export const dynamic = "force-dynamic";

export default async function Customer360SupportPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.support.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const inbox = await getOrgSupport(orgId);
  const canManage = await currentOperatorCan("platform.support.manage");

  const active = inbox.tickets.filter((t) => isActive(t.status));
  const resolved = inbox.tickets.filter((t) => !isActive(t.status));

  return (
    <div className="space-y-5">
      {!inbox.available && <SupportUnavailable />}

      {canManage && (
        <div className="flex items-center justify-between">
          <span className="text-muted text-[12px] font-semibold">פתיחת פנייה חדשה לארגון זה</span>
          <CreateTicketForm orgId={orgId} />
        </div>
      )}

      <PanelCard title={`פניות פעילות (${active.length})`} icon="Handshake">
        {active.length === 0 ? <SupportEmpty note="אין פניות פעילות לארגון זה" /> : <TicketTable tickets={active} />}
      </PanelCard>

      <PanelCard title={`היסטוריית תמיכה (${resolved.length})`} icon="Handshake">
        {resolved.length === 0 ? <SupportEmpty note="אין היסטוריית תמיכה" /> : <TicketTable tickets={resolved} />}
      </PanelCard>
    </div>
  );
}
