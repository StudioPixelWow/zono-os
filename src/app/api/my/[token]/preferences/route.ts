/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Buyer portal PREFERENCE-CHANGE REQUEST (POST, public + token-scoped).
// A customer requesting a change to their search preferences NEVER rewrites the
// canonical buyer requirement model from an anonymous token. Instead it creates a
// safe, idempotent agent-review task with the requested change (bounded free text)
// for the customer's OWN agent — pending review. No CRM requirement write here.
// ============================================================================
import { NextResponse } from "next/server";
import { verifyPortalToken } from "@/lib/customer-portal/portal-tokens";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = verifyPortalToken(token);
  if (!p) return NextResponse.redirect(new URL(`/my/${token}`, req.url), { status: 303 });

  let note = "";
  try { note = String((await req.formData()).get("note") ?? "").slice(0, 500).trim(); } catch { /* no body */ }
  if (!note) return NextResponse.redirect(new URL(`/my/${token}`, req.url), { status: 303 });

  const db: any = createServiceRoleClient();
  try {
    // Resolve the contact's owner (assignee) + confirm the relationship (org-scoped).
    const table = p.t === "buyer" ? "buyers" : "leads";
    const { data: contact } = await db.from(table).select("owner_id,full_name").eq("id", p.c).eq("org_id", p.o).maybeSingle();
    if (contact) {
      const source = `portal:pref_request:${p.t}:${p.c}`;
      const { data: existing } = await db.from("tasks").select("id")
        .eq("org_id", p.o).eq("intelligence_source", source).in("status", ["todo", "in_progress", "blocked"]).limit(1).maybeSingle();
      const row: any = {
        org_id: p.o, assignee_id: contact.owner_id ?? null,
        title: `בקשת עדכון העדפות מ${contact.full_name ?? "לקוח"}`, description: note,
        status: "todo", priority: "medium", intelligence_source: source, is_automatable: false,
      };
      if (p.t === "buyer") row.buyer_id = p.c; else row.lead_id = p.c;
      if (existing?.id) await db.from("tasks").update({ description: note, updated_at: new Date().toISOString() }).eq("id", existing.id);
      else await db.from("tasks").insert(row);
    }
  } catch { /* best-effort — never surface an error to the customer */ }

  return NextResponse.redirect(new URL(`/my/${token}?done=prefs`, req.url), { status: 303 });
}
