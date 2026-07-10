// ============================================================================
// 🌱 ZONO — Lead Intelligence Workspace (/leads/[id]). SCREEN 11.
// A premium Lead Command Center built entirely on the EXISTING Lead Twin read
// model + the generic Communication / Calendar / Approval / Relationship
// sections + the approval-gated StartWorkflowButton. Reuse-only: no new engine,
// no new business logic, no schema. Sections fold into cockpit tabs (no stacking).
// ============================================================================
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getLeadTwinById } from "@/lib/digital-twin/leads/service";
import { LeadDetailView, type LeadLite } from "./LeadDetailView";
import { CommunicationSection } from "@/components/communication/CommunicationSection";
import { EntityCalendarSection } from "@/components/calendar/EntityCalendarSection";
import { ApprovalBundleSection } from "@/components/approval-bundle/ApprovalBundleSection";
import { RelationshipSection } from "@/components/graph/RelationshipSection";
import { EntityTimelineSection } from "@/components/activity/EntityTimelineSection";
import { EntityAIContextSection } from "@/components/ai-context/EntityAIContextSection";
import { canonicalFactsFor } from "@/lib/ai-context";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sc = await getSessionContext();
  const orgId = sc.profile?.org_id ?? sc.organization?.id ?? null;

  const db = await createClient();
  let q = db.from("leads").select("id,full_name,phone,email,source,stage,score,message,property_id,created_at").eq("id", id);
  if (orgId) q = q.eq("org_id", orgId);
  const { data } = await q.maybeSingle();
  const row = data as Row | null;
  if (!row) notFound();

  const twin = await getLeadTwinById(orgId, id).catch(() => null);

  const lead: LeadLite = {
    id,
    name: s(row.full_name) ?? "ליד",
    phone: s(row.phone),
    email: s(row.email),
    source: s(row.source),
    stage: s(row.stage) ?? "new",
    score: num(row.score),
    message: s(row.message),
    propertyId: s(row.property_id),
  };

  // Reused generic sections (already lead-aware) → passed as cockpit slots.
  const communicationSlot = <CommunicationSection entityType="lead" entityId={id} />;
  const calendarSlot = <EntityCalendarSection kind="lead" id={id} name={lead.name} />;
  const approvalSlot = <ApprovalBundleSection entityType="lead" entityId={id} />;
  const graphSlot = (
    <div className="flex flex-col gap-3">
      <EntityAIContextSection entityType="lead" entityId={id} canonicalTruth={canonicalFactsFor("lead", row)} />
      <RelationshipSection entityType="lead" entityId={id} />
    </div>
  );
  const timelineSlot = <EntityTimelineSection entityType="lead" entityId={id} title="ציר זמן הליד" />;

  return (
    <LeadDetailView
      lead={lead}
      twin={twin}
      communicationSlot={communicationSlot}
      calendarSlot={calendarSlot}
      approvalSlot={approvalSlot}
      graphSlot={graphSlot}
      timelineSlot={timelineSlot}
    />
  );
}
