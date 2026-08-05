"use server";
// ============================================================================
// 📇 ZONO — CRM Lead creation (Command Center quick action).
// Reuses the EXISTING `leads` table + session org/owner scoping (mirrors the
// public-intake insert). No new lead model, no auto-workflows. RLS enforces
// authorization; org_id + owner_id come from the verified session.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
// A "use server" module may export ONLY async functions — the picker options
// live in ./options and are imported (never re-exported) from here.

export interface NewLeadInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  source: string;
  intent?: string;
  area?: string | null;
  budget?: string | null;
  propertyId?: string | null;
  notes?: string | null;
}

export async function createLeadAction(input: NewLeadInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  const name = input.fullName?.trim();
  if (!name) return { ok: false, error: "יש להזין שם." };
  if (!input.phone?.trim() && !input.email?.trim()) return { ok: false, error: "יש להזין טלפון או אימייל." };

  const message = [input.notes?.trim(), input.budget?.trim() ? `תקציב: ${input.budget.trim()}` : null, input.area?.trim() ? `אזור: ${input.area.trim()}` : null]
    .filter(Boolean).join(" · ") || null;

  const db = await createClient();
  const { data, error } = await db.from("leads").insert({
    org_id: profile.org_id,
    owner_id: user.id,
    full_name: name,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    source: input.source,
    intent: input.intent || "unknown",
    stage: "new",
    message,
    property_id: input.propertyId || null,
  } as never).select("id").single();

  if (error || !data) return { ok: false, error: error?.message ?? "יצירת הליד נכשלה." };
  const leadId = (data as { id: string }).id;
  // Stage 0.5: put lead creation on the unified timeline (was previously silent).
  try {
    const { logActivityEvent } = await import("@/lib/activity/service");
    await logActivityEvent({ eventType: "lead.created", entityType: "lead", entityId: leadId, title: `ליד חדש: ${name}` });
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({ type: DOMAIN_EVENTS.leadCreated, entityType: "lead", entityId: leadId, payload: { source: input.source, intent: input.intent ?? "unknown" } });
  } catch (e) { console.error("[leads] activity log failed:", e); }
  return { ok: true, id: leadId };
}

// ── Bulk operations (Epic 3 hardening · Part 15) ─────────────────────────────
// Production-grade bulk action over selected leads: validates each record,
// applies the existing lifecycle service per row, and returns PER-ROW results
// so partial failures are surfaced (never reported as full success).
import { setLeadStage, markLeadContacted, assignLead, LEAD_STAGES, type LeadStage } from "./service";
import { revalidatePath } from "next/cache";

export type BulkLeadOp = "mark_contacted" | "assign_me" | `stage:${string}`;
export interface BulkLeadResult {
  ok: boolean; error?: string;
  results: { id: string; ok: boolean; error?: string }[];
  succeeded: number; failed: number;
}

export async function bulkLeadAction(ids: string[], op: BulkLeadOp): Promise<BulkLeadResult> {
  const clean = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (!clean.length) return { ok: false, error: "לא נבחרו לידים", results: [], succeeded: 0, failed: 0 };
  let ownerId: string | null = null;
  if (op === "assign_me") {
    const { user } = await getSessionContext();
    if (!user) return { ok: false, error: "לא מחובר/ת", results: [], succeeded: 0, failed: 0 };
    ownerId = user.id;
  }
  const stage = op.startsWith("stage:") ? op.slice("stage:".length) : null;
  if (stage && !(LEAD_STAGES as readonly string[]).includes(stage)) {
    return { ok: false, error: "שלב לא חוקי", results: [], succeeded: 0, failed: 0 };
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of clean) {
    try {
      const r = op === "mark_contacted" ? await markLeadContacted(id)
        : op === "assign_me" ? await assignLead(id, ownerId as string)
        : await setLeadStage(id, stage as LeadStage);
      results.push({ id, ok: r.ok, error: r.error });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : "שגיאה" });
    }
  }
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  try { revalidatePath("/leads"); } catch { /* noop */ }
  return { ok: succeeded > 0, results, succeeded, failed };
}
