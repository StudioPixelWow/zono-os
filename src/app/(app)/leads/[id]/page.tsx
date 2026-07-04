// ============================================================================
// 🌱 ZONO — CRM Lead detail (/leads/[id]). PHASE 42.0 launch hardening.
// Closes the dead link that Broker Workspace, Daily OS and the WhatsApp inbox
// already emit (`/leads/${id}`). Read-only, reuse-only: the lead row + the
// EXISTING Lead Twin read model + the EXISTING generic Communication /
// Relationship sections + StartWorkflowButton (all already accept "lead").
// No new engine, no new business logic, no schema.
// ============================================================================
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getLeadTwinById } from "@/lib/digital-twin/leads/service";
import StartWorkflowButton from "@/components/workflow-builder/StartWorkflowButton";
import { CommunicationSection } from "@/components/communication/CommunicationSection";
import { RelationshipSection } from "@/components/graph/RelationshipSection";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const STAGE_HE: Record<string, string> = {
  new: "חדש", contacted: "נוצר קשר", qualified: "מוסמך", nurturing: "בטיפוח", converted: "הומר", lost: "אבוד",
};
const SOURCE_HE: Record<string, string> = {
  facebook: "פייסבוק", facebook_group_comment: "תגובת קבוצת פייסבוק", yad2: "יד2", madlan: "מדלן",
  website: "אתר", referral: "הפניה", whatsapp: "וואטסאפ",
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-xl px-3 py-2">
      <p className="text-muted text-[11px] font-bold">{label}</p>
      <p className="text-ink mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sc = await getSessionContext();
  const orgId = sc.profile?.org_id ?? sc.organization?.id ?? null;

  const db = await createClient();
  let q = db.from("leads").select("id,full_name,phone,email,source,stage,score,message,property_id,created_at").eq("id", id);
  if (orgId) q = q.eq("org_id", orgId);
  const { data } = await q.maybeSingle();
  const lead = data as Row | null;
  if (!lead) notFound();

  const twin = await getLeadTwinById(orgId, id).catch(() => null);
  const name = s(lead.full_name) ?? "ליד";
  const stage = s(lead.stage) ?? "new";
  const source = s(lead.source);
  const score = num(lead.score);
  const nextBestAction = twin?.profile?.nextBestAction ?? null;
  const conversion = twin?.profile ? num(twin.profile.conversionProbability) : null;

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      <Link href="/my" className="text-muted hover:text-brand flex items-center gap-1 text-sm font-bold">← חזרה לשולחן העבודה</Link>

      {/* Header */}
      <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="bg-brand-soft text-brand-strong rounded-lg px-2 py-0.5 text-xs font-bold">ליד CRM</span>
              <span className="bg-surface text-ink rounded-lg px-2 py-0.5 text-[11px] font-bold">{STAGE_HE[stage] ?? stage}</span>
              {score != null && <span className="bg-success-soft text-success rounded-lg px-2 py-0.5 text-[11px] font-bold">ציון {score}</span>}
            </div>
            <h1 className="text-ink text-xl font-black">{name}</h1>
            {s(lead.message) && <p className="text-muted mt-1 max-w-2xl whitespace-pre-wrap text-sm">{s(lead.message)}</p>}
          </div>
          <StartWorkflowButton entityType="lead" entityId={id} entityName={name} suggestedTemplate="lead_qualification" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="טלפון" value={s(lead.phone) ?? "—"} />
          <Fact label="אימייל" value={s(lead.email) ?? "—"} />
          <Fact label="מקור" value={source ? (SOURCE_HE[source] ?? source) : "—"} />
          <Fact label="נכס משויך" value={s(lead.property_id) ? "מקושר" : "—"} />
        </div>

        {s(lead.property_id) && (
          <Link href={`/properties/${s(lead.property_id)}`} className="text-brand-strong mt-3 inline-block text-sm font-bold">← פתיחת הנכס המשויך</Link>
        )}
      </div>

      {/* AI summary (from the existing Lead Twin; degrades silently) */}
      {(nextBestAction || conversion != null) && (
        <div className="bg-brand-soft/40 border-brand-soft rounded-[18px] border p-4">
          <p className="text-brand-strong text-[11px] font-bold">המלצת ZONO</p>
          {nextBestAction && <p className="text-ink mt-1 text-sm font-bold">{nextBestAction}</p>}
          {conversion != null && <p className="text-muted mt-0.5 text-[11px] font-bold">סיכוי המרה משוער: {conversion}%</p>}
        </div>
      )}

      {/* Reused generic sections (already lead-aware) */}
      <CommunicationSection entityType="lead" entityId={id} />
      <RelationshipSection entityType="lead" entityId={id} />
    </div>
  );
}
