// ============================================================================
// ZONO — /creative-lab flow logic, FREE of any Next.js/runtime import so it is
// executable headlessly (npx tsx) with the SAME lab runtime, CreativeContent
// service and fixtures the UI drives. The thin server actions (actions.ts) only
// read the test-session cookie and delegate here. Every rule enforced here is
// the REAL rule: role/active gating, approval, publish eligibility, idempotency,
// org isolation, bulk partial-failure and idempotent re-run.
// ============================================================================
import { getLabRuntime } from "./lab-runtime";
import { ALPHA, BETA } from "./fixtures";
import type { CreativeKind } from "../creative-studio/creative-kinds";
import { isKnownKind } from "../creative-studio/creative-kinds";
import type { OutputRecord } from "../content-orchestration/creative-content-service";

export interface LabSession { orgId: string | null; userId: string | null; role: string | null; active: boolean }
export interface LabOutputView {
  id: string; orgId: string; kind: string; state: string; assetRef: string;
  contentItemId: string | null; round: number | null; mode: string | null; createdAt: string;
}
export interface LabActionResult { ok: boolean; error?: string; output?: LabOutputView; outputs?: LabOutputView[] }
export interface BulkRowResult { propertyId: string; ok: boolean; outputId?: string; state?: string; error?: string; deduped?: boolean }
export interface BulkResult { ok: boolean; error?: string; total: number; succeeded: number; failed: number; rows: BulkRowResult[] }
export interface LabWorld { session: LabSession; orgName: string | null; properties: { id: string; title: string; city: string; price: number; valid: boolean }[] }

export function toView(o: OutputRecord): LabOutputView {
  return {
    id: o.id, orgId: o.orgId, kind: o.kind, state: o.state, assetRef: o.assetRef,
    contentItemId: o.contentItemId,
    round: o.lineage?.generationRound ?? null, mode: o.lineage?.mode ?? null,
    createdAt: o.createdAt,
  };
}

function requireActiveOrg(s: LabSession): { orgId: string; userId: string | null } {
  if (!s.orgId || !s.active) throw new Error("no active test session — sign in as a fixture user");
  return { orgId: s.orgId, userId: s.userId };
}

export function worldFor(session: LabSession): LabWorld {
  if (session.orgId === ALPHA.orgId) return { session, orgName: "Alpha · " + ALPHA.brand.agentName, properties: ALPHA.properties.map((p) => ({ id: p.id, title: p.title, city: p.city, price: p.price, valid: p.valid })) };
  if (session.orgId === BETA.orgId) return { session, orgName: "Beta · " + BETA.brand.agentName, properties: BETA.properties.map((p) => ({ id: p.id, title: p.title, city: p.city, price: p.price, valid: p.valid })) };
  return { session, orgName: null, properties: [] };
}

export function listOutputs(session: LabSession): LabActionResult {
  try {
    if (!session.orgId) return { ok: true, outputs: [] };
    return { ok: true, outputs: getLabRuntime().list(session.orgId).map(toView) };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function doGenerate(session: LabSession, input: { kind: string; prompt: string; contentItemId?: string | null; idempotencyKey?: string | null }): Promise<LabActionResult> {
  try {
    const ctx = requireActiveOrg(session);
    if (!isKnownKind(input.kind)) return { ok: false, error: `unknown creative kind: ${input.kind}` };
    if (!input.prompt?.trim()) return { ok: false, error: "prompt is required" };
    const lab = getLabRuntime();
    const key = input.idempotencyKey?.trim() || `${ctx.orgId}:${input.kind}:${input.prompt.trim()}`;
    const rec = await lab.runtime.service.generate(ctx, { idempotencyKey: key, contentItemId: input.contentItemId ?? null, kind: input.kind as CreativeKind, prompt: input.prompt.trim() });
    lab.record(rec);
    return { ok: true, output: toView(rec) };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function doTransition(session: LabSession, outputId: string, op: "approve" | "reject" | "schedule"): Promise<LabActionResult> {
  try {
    const ctx = requireActiveOrg(session);
    const lab = getLabRuntime();
    const rec = await lab.runtime.service[op](ctx, outputId);
    lab.record(rec);
    return { ok: true, output: toView(rec) };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function doPublish(session: LabSession, input: { outputId: string; platform: string; variantKey: string }): Promise<LabActionResult> {
  try {
    const ctx = requireActiveOrg(session);
    const lab = getLabRuntime();
    const { publication } = await lab.runtime.service.publish(ctx, input.outputId, input.platform, input.variantKey);
    const rec = lab.find(ctx.orgId, input.outputId);
    if (!rec) return { ok: true };
    const updated = { ...rec, state: publication.status === "published" ? ("published" as const) : rec.state };
    lab.record(updated);
    return { ok: true, output: toView(updated) };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/**
 * Bulk generator: org-scoped, bounded concurrency, per-row result, partial
 * failure tolerated, deterministic idempotency (no duplicates on re-run/resume).
 */
export async function doBulk(session: LabSession, input: { propertyIds: string[]; kind: string; concurrency?: number }): Promise<BulkResult> {
  try {
    const ctx = requireActiveOrg(session);
    if (!isKnownKind(input.kind)) return { ok: false, error: `unknown creative kind: ${input.kind}`, total: 0, succeeded: 0, failed: 0, rows: [] };
    const byId = new Map(worldFor(session).properties.map((p) => [p.id, p]));
    const lab = getLabRuntime();
    const ids = [...new Set(input.propertyIds)];
    const limit = Math.max(1, Math.min(input.concurrency ?? 4, 8));
    const rows: BulkRowResult[] = new Array(ids.length);
    let cursor = 0;
    async function worker() {
      while (cursor < ids.length) {
        const i = cursor++;
        const pid = ids[i];
        const prop = byId.get(pid);
        try {
          if (!prop) { rows[i] = { propertyId: pid, ok: false, error: "property not in org scope" }; continue; }
          if (!prop.valid) { rows[i] = { propertyId: pid, ok: false, error: "property missing required fields" }; continue; }
          const existedId = lab.list(ctx.orgId).find((o) => o.contentItemId === pid && o.kind === input.kind)?.id;
          const key = `${ctx.orgId}:bulk:${input.kind}:${pid}`;
          const rec = await lab.runtime.service.generate(ctx, { idempotencyKey: key, contentItemId: pid, kind: input.kind as CreativeKind, prompt: `${prop.title} · ${prop.city} · ₪${prop.price.toLocaleString("he-IL")}` });
          lab.record(rec);
          rows[i] = { propertyId: pid, ok: true, outputId: rec.id, state: rec.state, deduped: existedId === rec.id };
        } catch (e) { rows[i] = { propertyId: pid, ok: false, error: (e as Error).message }; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, () => worker()));
    const succeeded = rows.filter((r) => r.ok).length;
    return { ok: true, total: ids.length, succeeded, failed: ids.length - succeeded, rows };
  } catch (e) { return { ok: false, error: (e as Error).message, total: 0, succeeded: 0, failed: 0, rows: [] }; }
}
