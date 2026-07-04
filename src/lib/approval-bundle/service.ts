// ============================================================================
// 🎁 ZONO — Autonomous Office™ · Approval Bundle service (server-only). 44.0.
// Composes bundles from EXISTING engine reads (dedup vs missions/workflows) and
// routes APPROVED actions to EXISTING approval-gated creators (createMission,
// startPersistentWorkflow, createDraft, notification). Booking/marketing/FB/
// landing stay proposals — NEVER auto-sent, published or booked. Bundles are
// stateless (deterministic id, recomputed on demand); only rejection is cached.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getCache, setCache } from "@/lib/platform-persistence/compute-cache";
import { buildBundle, applyApproval, explainWhy, explainWhatIfApprove, mostUrgent } from "./builder";
import type { ApprovalBundle, BundleEventType, BundleEntityType, BundleSignals, ActionType } from "./types";
import { createMission } from "@/lib/mission-engine/service";
import { startPersistentWorkflow } from "@/lib/workflow-builder/persist";
import { listEntityMissions } from "@/lib/mission-engine/service";
import { listEntityActiveWorkflows } from "@/lib/workflow-builder/repository";
import { createDraftAction } from "@/lib/whatsapp/actions";
import { getLeadAgentScorecards } from "@/lib/lead-agent/service";
import { getSellerAgentScorecards } from "@/lib/seller-agent/service";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const rows = (d: unknown): Row[] => (Array.isArray(d) ? (d as Row[]) : []);
async function ctx() { const sc = await getSessionContext(); return { orgId: sc.profile?.org_id ?? sc.organization?.id ?? null, userId: sc.user?.id ?? null }; }

const NAME_TABLE: Record<BundleEntityType, { table: string; col: string } | null> = {
  lead: { table: "leads", col: "full_name" }, buyer: { table: "buyers", col: "full_name" },
  seller: { table: "sellers", col: "full_name" }, property: { table: "properties", col: "title" },
  territory: null, campaign: null, office: null,
};
const PRIMARY_EVENT: Record<BundleEntityType, BundleEventType> = {
  lead: "new_lead", buyer: "new_buyer", seller: "new_seller", property: "new_property",
  territory: "territory_opportunity", campaign: "campaign_underperforming", office: "workflow_completed",
};

async function loadSignals(entityType: BundleEntityType, entityId: string, orgId: string | null): Promise<BundleSignals> {
  const db = await createClient();
  let name: string | null = null;
  const nt = NAME_TABLE[entityType];
  if (nt) { try { const { data } = await db.from(nt.table as never).select(`${nt.col}` as never).eq("id" as never, entityId as never).limit(1).maybeSingle(); name = s((data as Row | null)?.[nt.col]); } catch { /* none */ } }
  const [missions, wf] = await Promise.all([
    listEntityMissions(entityType, entityId, orgId).catch(() => []),
    listEntityActiveWorkflows(orgId, entityType, entityId).catch(() => ({ rows: [] as Row[], migrationRequired: false })),
  ]);
  return {
    name,
    existingMissionTypes: (missions as Row[]).map((m) => s(m.missionType) ?? s(m.mission_type)).filter((x): x is string => !!x),
    existingWorkflowTemplates: rows((wf as { rows?: unknown }).rows).map((r) => s(r.template_id) ?? s(r.templateId)).filter((x): x is string => !!x),
  };
}

async function isRejected(orgId: string | null, bundleId: string): Promise<boolean> {
  if (!orgId) return false;
  const hit = await getCache<{ rejected: boolean }>(orgId, "bundle_reject", [bundleId]).catch(() => null);
  return hit?.value?.rejected === true;
}

/** Build the bundle for a specific event (read-only; nothing executes). */
export async function buildBundleForEvent(eventType: BundleEventType, entityType: BundleEntityType, entityId: string, extra?: BundleSignals): Promise<ApprovalBundle> {
  const { orgId } = await ctx();
  const base = await loadSignals(entityType, entityId, orgId);
  const bundle = buildBundle({ eventType, entityType, entityId, orgId, signals: { ...base, ...extra } });
  if (await isRejected(orgId, bundle.bundleId)) bundle.status = "rejected";
  return bundle;
}

/** The prepared bundle(s) for an entity (surfaced on entity pages). */
export async function getEntityBundles(entityType: BundleEntityType, entityId: string): Promise<ApprovalBundle[]> {
  return [await buildBundleForEvent(PRIMARY_EVENT[entityType], entityType, entityId)];
}

/** Inbox bundles across the org (Daily OS / Broker Workspace / Agent inbox). */
export async function getInboxBundles(): Promise<ApprovalBundle[]> {
  const { orgId } = await ctx();
  const [leads, sellers] = await Promise.all([
    getLeadAgentScorecards(orgId).catch(() => null),
    getSellerAgentScorecards(orgId).catch(() => null),
  ]);
  const out: ApprovalBundle[] = [];
  const cards = (o: unknown): Row[] => rows((o as { scorecards?: unknown })?.scorecards);
  for (const c of cards(leads).slice(0, 3)) { const id = s(c.id); if (id) out.push(await buildBundleForEvent("new_lead", "lead", id, { name: s(c.name) })); }
  for (const c of cards(sellers).slice(0, 3)) { const id = s(c.id); if (id) out.push(await buildBundleForEvent("seller_at_risk", "seller", id, { name: s(c.name), risk: 80 })); }
  return out.filter((b) => b.status !== "rejected").sort((a, b) => b.priority - a.priority);
}

// ── Approval executor — routes APPROVED actions to existing creators ─────────
export interface ApproveResult { ok: boolean; created: { type: ActionType; ok: boolean; note: string }[]; bundle: ApprovalBundle }
export async function approveBundle(bundleId: string, which: ActionType | "all"): Promise<ApproveResult> {
  const { orgId, userId } = await ctx();
  const [eventType, entityType, entityId] = bundleId.split(":") as [BundleEventType, BundleEntityType, string];
  if (!eventType || !entityType || !entityId) return { ok: false, created: [], bundle: null as unknown as ApprovalBundle };
  const base = await loadSignals(entityType, entityId, orgId);
  let bundle = buildBundle({ eventType, entityType, entityId, orgId, signals: base });
  bundle = applyApproval(bundle, which);

  const created: ApproveResult["created"] = [];
  for (const a of bundle.actions.filter((x) => x.status === "approved")) {
    if (!a.canExecute) { created.push({ type: a.type, ok: true, note: "הצעה — נפתחת ידנית, לא בוצעה אוטומטית." }); continue; }
    try {
      if (a.type === "mission") {
        const r = await createMission({ organizationId: orgId, entityType, entityId, entityName: base.name ?? undefined, missionType: String(a.payload.missionType), reason: a.reason, evidence: a.evidence, confidence: bundle.confidence, businessImpact: bundle.priority >= 75 ? "high" : "medium" });
        created.push({ type: a.type, ok: r.ok, note: r.ok ? "משימה נוצרה (ממתינה לאישור בשלבים)." : (r.error ?? "כשל") });
      } else if (a.type === "workflow") {
        const r = await startPersistentWorkflow(orgId, String(a.payload.workflowTemplate), { entityKind: entityType as never, entityId, entityName: base.name ?? entityId }, userId);
        created.push({ type: a.type, ok: r.ok, note: r.duplicate ? "תהליך כבר פעיל (נמנעה כפילות)." : r.ok ? "תהליך הופעל (שלבים דורשים אישור)." : (r.error ?? "כשל") });
      } else if (a.type === "whatsapp_draft" || a.type === "email_draft") {
        const r = await createDraftAction({ body: String(a.payload.body), kind: String(a.payload.kind ?? "bundle") });
        created.push({ type: a.type, ok: !("error" in r && r.error), note: "טיוטה נוצרה — לא נשלחת אוטומטית." });
      } else if (a.type === "notification") {
        await insertNotification(orgId, userId, String(a.payload.title));
        created.push({ type: a.type, ok: true, note: "התראה נוצרה." });
      }
    } catch (e) { created.push({ type: a.type, ok: false, note: e instanceof Error ? e.message : "כשל" }); }
  }
  return { ok: true, created, bundle };
}

export async function rejectBundle(bundleId: string): Promise<{ ok: boolean }> {
  const { orgId } = await ctx();
  if (orgId) await setCache(orgId, "bundle_reject", [bundleId], { rejected: true } as unknown as Parameters<typeof setCache>[3], { ttlSeconds: 60 * 60 * 24 * 30 });
  return { ok: true };
}

async function insertNotification(orgId: string | null, userId: string | null, title: string): Promise<void> {
  if (!orgId) return;
  const db = await createClient();
  let uid = userId;
  if (!uid) { const { data } = await db.from("users").select("id").eq("org_id", orgId).limit(1).maybeSingle(); uid = s((data as Row | null)?.id); }
  if (!uid) return;
  await db.from("notifications").insert({ org_id: orgId, user_id: uid, level: "info", category: "system", title, body: "באנדל פעולות מומלץ ממתין לאישור.", href: "/today" }).select("id").maybeSingle();
}

// ── Ask ZONO explanations ────────────────────────────────────────────────────
export interface BundleAsk { answer: string }
export async function answerBundleWhy(bundleId: string): Promise<BundleAsk> { const b = await rebuild(bundleId); return { answer: b ? explainWhy(b) : "לא נמצא באנדל." }; }
export async function answerBundleWhatIf(bundleId: string): Promise<BundleAsk> { const b = await rebuild(bundleId); return { answer: b ? explainWhatIfApprove(b) : "לא נמצא באנדל." }; }
export async function answerMostUrgent(): Promise<BundleAsk> { const u = mostUrgent(await getInboxBundles()); return { answer: u ? `הכי דחוף עכשיו: "${u.title}" (עדיפות ${u.priority}). ${explainWhy(u)}` : "אין באנדלים דחופים כרגע." }; }
async function rebuild(bundleId: string): Promise<ApprovalBundle | null> {
  const [eventType, entityType, entityId] = bundleId.split(":") as [BundleEventType, BundleEntityType, string];
  if (!eventType || !entityType || !entityId) return null;
  return buildBundleForEvent(eventType, entityType, entityId);
}
