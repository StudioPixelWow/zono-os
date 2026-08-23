// ============================================================================
// ZONO — Leads board · SERVER-PAGINATED query (real data only).
// ----------------------------------------------------------------------------
// Replaces the "load 400 leads to the client and filter in the browser" list.
// A bounded, org-scoped fetch is joined with the canonical follow-up state per
// lead (the leads' intelligence layer: urgency, overdue, unassigned, waiting) —
// no duplicate logic — then KPIs / attention / search / stage & attention
// filters / sort / TRUE offset pagination are computed SERVER-SIDE. Only one
// hydrated page (owner names + follow-up badges) reaches the client.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOfficeFollowUpStates } from "@/lib/follow-up/service";
import { LEAD_STAGE_HE, LEAD_SOURCE_HE } from "@/lib/i18n/labels";
import type {
  LeadAttentionKey, LeadSortKey, LeadBoardRow, LeadKpi, LeadsBoardParams, LeadsBoardPage,
} from "./board";

const SCOPE_CAP = 2000;

interface LeadScopeRow { id: string; full_name: string; phone: string | null; email: string | null; stage: string; score: number | null; source: string | null; created_at: string; owner_id: string | null }

const ATT_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  followup_overdue: "danger", unassigned: "danger", new_waiting: "warning", needs_action: "warning",
};
const ATT_MAP: Record<string, LeadAttentionKey> = {
  followup_overdue: "overdue", unassigned: "unassigned", new_waiting: "waiting", needs_action: "needs_action",
};

export async function queryLeadsBoard(params: LeadsBoardParams): Promise<LeadsBoardPage> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("לא מחובר/ת");
  const orgId = profile.org_id;
  const supabase = await createClient();

  // 1) Bounded, org-scoped fetch.
  const { data, error } = await supabase.from("leads").select("id,full_name,phone,email,stage,score,source,created_at,owner_id").eq("org_id", orgId).order("created_at", { ascending: false }).limit(SCOPE_CAP + 1);
  if (error) throw new Error(error.message);
  const rowsRaw = (data ?? []) as unknown as LeadScopeRow[];
  const truncated = rowsRaw.length > SCOPE_CAP;
  const rows = truncated ? rowsRaw.slice(0, SCOPE_CAP) : rowsRaw;

  // 2) Canonical follow-up state per lead (urgency + attention). Soft-fail.
  const fuByLead = new Map<string, { key: string; label: string; tone: "danger" | "warning" | "neutral"; att: LeadAttentionKey; urgency: number }>();
  try {
    const fu = await getOfficeFollowUpStates({ limit: SCOPE_CAP });
    for (const st of fu.states) {
      const att = ATT_MAP[st.state];
      if (!att) { // still capture urgency even if not an "attention" state
        if (!fuByLead.has(st.leadId)) fuByLead.set(st.leadId, { key: st.state, label: st.label, tone: "neutral", att: "needs_action", urgency: st.urgency });
        continue;
      }
      fuByLead.set(st.leadId, { key: st.state, label: st.label, tone: ATT_TONE[st.state] ?? "warning", att, urgency: st.urgency });
    }
  } catch (e) { console.error("[leads-board] follow-up failed:", e); }

  // 3) KPIs over the full set.
  const stageCount = (s: string) => rows.reduce((n, r) => n + (r.stage === s ? 1 : 0), 0);
  const overdue = rows.reduce((n, r) => n + (fuByLead.get(r.id)?.att === "overdue" ? 1 : 0), 0);
  const unassigned = rows.reduce((n, r) => n + (!r.owner_id ? 1 : 0), 0);
  const kpis: LeadKpi[] = [
    { key: "all", label: "כל הלידים", value: rows.length, tone: "brand" },
    { key: "new", label: "חדשים", value: stageCount("new"), tone: "brand" },
    { key: "qualified", label: "מוסמכים", value: stageCount("qualified"), tone: "success" },
    { key: "nurturing", label: "בטיפוח", value: stageCount("nurturing"), tone: "neutral" },
    { key: "unassigned", label: "ללא אחראי", value: unassigned, tone: "danger" },
    { key: "overdue", label: "פולואפ באיחור", value: overdue, tone: "warning" },
  ];

  // 4) Filters.
  const qRaw = (params.q ?? "").trim().toLowerCase();
  const qDigits = qRaw.replace(/\D/g, "");
  const stage = params.stage ?? null;
  const attention = params.attention ?? null;
  const filtered = rows.filter((r) => {
    if (stage && stage !== "all" && r.stage !== stage) return false;
    if (qRaw) {
      const hitName = (r.full_name ?? "").toLowerCase().includes(qRaw);
      const hitEmail = (r.email ?? "").toLowerCase().includes(qRaw);
      const hitPhone = qDigits.length > 0 && (r.phone ?? "").replace(/\D/g, "").includes(qDigits);
      if (!hitName && !hitEmail && !hitPhone) return false;
    }
    if (attention === "unassigned") { if (r.owner_id) return false; }
    else if (attention === "any") { if (!fuByLead.get(r.id) && r.owner_id) return false; }
    else if (attention) { if (fuByLead.get(r.id)?.att !== attention) return false; }
    return true;
  });

  // 5) Sort.
  const sort: LeadSortKey = params.sort ?? "urgency";
  const urgencyOf = (id: string) => fuByLead.get(id)?.urgency ?? 0;
  filtered.sort((a, b) => {
    switch (sort) {
      case "name": return (a.full_name ?? "").localeCompare(b.full_name ?? "", "he");
      case "score": return (b.score ?? 0) - (a.score ?? 0);
      case "recent": return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      case "urgency":
      default: { const d = urgencyOf(b.id) - urgencyOf(a.id); return d !== 0 ? d : (b.created_at ?? "").localeCompare(a.created_at ?? ""); }
    }
  });

  // 6) Pagination.
  const total = filtered.length;
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 10), 100);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(params.page ?? 1, 1), pageCount);
  const slice = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  // 7) Hydrate ONLY this page — owner names.
  const ownerIds = new Set<string>();
  for (const r of slice) if (r.owner_id) ownerIds.add(r.owner_id);
  const nameByOwner = new Map<string, string>();
  if (ownerIds.size) {
    try {
      const { data: us } = await supabase.from("users").select("id,full_name").eq("org_id", orgId).in("id", Array.from(ownerIds));
      for (const u of (us ?? []) as { id: string; full_name: string | null }[]) nameByOwner.set(u.id, u.full_name || "סוכן");
    } catch { /* names best-effort */ }
  }

  const outRows: LeadBoardRow[] = slice.map((r) => {
    const fu = fuByLead.get(r.id);
    return {
      id: r.id, full_name: r.full_name, phone: r.phone, email: r.email,
      stage: r.stage, stageLabel: LEAD_STAGE_HE[r.stage] ?? r.stage, score: r.score,
      source: r.source, sourceLabel: r.source ? (LEAD_SOURCE_HE[r.source] ?? r.source) : null,
      createdAt: r.created_at, ownerId: r.owner_id, agentName: r.owner_id ? (nameByOwner.get(r.owner_id) ?? null) : null,
      followUp: fu ? { key: fu.key, label: fu.label, tone: fu.tone } : null,
      urgency: fu?.urgency ?? 0,
    };
  });

  // 8) One evidence-gated brief.
  const brief: { text: string; href: string }[] = [];
  if (unassigned > 0) brief.push({ text: `${unassigned} לידים ללא אחראי — שייך כדי שמישהו יטפל.`, href: "/leads?attention=unassigned" });
  else if (overdue > 0) brief.push({ text: `${overdue} לידים עם פולואפ באיחור. חזור אליהם היום.`, href: "/leads?attention=overdue" });

  return { rows: outRows, total, page, pageSize, pageCount, kpis, brief, truncated };
}
