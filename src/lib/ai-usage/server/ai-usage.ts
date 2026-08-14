// ============================================================================
// ZONO — P6.1 AI Usage & Cost · server read layer (server-only).
// Bounded, honest aggregates over ai_usage_costs for /platform/product/ai-costs,
// Customer 360, and Owner Intelligence. Reads only. NEVER selects prompt/
// completion/content columns (they do not exist in the table by design). Cost is
// shown only when authoritative (cost_basis='provider_reported'); otherwise the
// UI states cost is unavailable — never a fabricated number. Gracefully degrades
// to an empty state when the table is absent (pre-migration) or unpopulated.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeProvider, featureLabel } from "../model";

const WINDOW = 30_000;
const HORIZON_DAYS = 35;

type Row = {
  organization_id: string | null; user_id: string | null; feature_key: string;
  provider: string; model: string; status: string; cost_basis: string;
  input_tokens: number | null; output_tokens: number | null; total_tokens: number | null;
  cost_amount: number | null; currency: string; created_at: string;
};

async function readRows(orgId?: string): Promise<{ rows: Row[]; tableMissing: boolean }> {
  try {
    const db = createServiceRoleClient();
    const since = new Date(Date.now() - HORIZON_DAYS * 86_400_000).toISOString();
    let q = db.from("ai_usage_costs" as never)
      .select("organization_id,user_id,feature_key,provider,model,status,cost_basis,input_tokens,output_tokens,total_tokens,cost_amount,currency,created_at")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(WINDOW) as unknown as Promise<{ data: unknown; error: unknown }> & { eq: (c: string, v: unknown) => typeof q };
    if (orgId) q = (q as unknown as { eq: (c: string, v: unknown) => typeof q }).eq("organization_id", orgId);
    const { data, error } = await (q as unknown as Promise<{ data: unknown; error: { message?: string } | null }>);
    if (error) {
      const missing = /relation .*ai_usage_costs.* does not exist|could not find the table/i.test(error.message ?? "");
      return { rows: [], tableMissing: missing };
    }
    return { rows: (data ?? []) as Row[], tableMissing: false };
  } catch {
    return { rows: [], tableMissing: false };
  }
}

function sumTokens(rows: Row[]): { input: number; output: number; total: number } {
  return rows.reduce((a, r) => ({ input: a.input + (r.input_tokens ?? 0), output: a.output + (r.output_tokens ?? 0), total: a.total + (r.total_tokens ?? 0) }), { input: 0, output: 0, total: 0 });
}
function costState(rows: Row[]): { available: boolean; amount: number | null; currency: string } {
  const authoritative = rows.filter((r) => r.cost_basis === "provider_reported" && r.cost_amount != null);
  if (authoritative.length === 0) return { available: false, amount: null, currency: "USD" };
  return { available: true, amount: authoritative.reduce((s, r) => s + Number(r.cost_amount), 0), currency: authoritative[0].currency || "USD" };
}
function tallyBy<T extends string>(rows: Row[], key: (r: Row) => T): { key: T; requests: number; tokens: number }[] {
  const m = new Map<T, { requests: number; tokens: number }>();
  for (const r of rows) { const k = key(r); const e = m.get(k) ?? { requests: 0, tokens: 0 }; e.requests++; e.tokens += r.total_tokens ?? 0; m.set(k, e); }
  return Array.from(m.entries()).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.requests - a.requests);
}

// ── Platform-wide AI usage overview ─────────────────────────────────────────
export interface AiUsageOverview {
  configured: boolean;          // table exists
  hasData: boolean;
  totalRequests: number;
  failures: number;
  tokens: { input: number; output: number; total: number };
  cost: { available: boolean; amount: number | null; currency: string };
  orgsUsingAi: number;
  byProvider: { key: string; requests: number; tokens: number }[];
  byModel: { key: string; requests: number; tokens: number }[];
  byFeature: { key: string; label: string; requests: number; tokens: number }[];
  topOrgs: { orgId: string; requests: number; tokens: number }[];
  newest: string | null;
  generatedAt: string;
  source: string;
}

export async function getAiUsageOverview(): Promise<AiUsageOverview> {
  const { rows, tableMissing } = await readRows();
  const cost = costState(rows);
  return {
    configured: !tableMissing,
    hasData: rows.length > 0,
    totalRequests: rows.length,
    failures: rows.filter((r) => r.status === "failed").length,
    tokens: sumTokens(rows),
    cost,
    orgsUsingAi: new Set(rows.map((r) => r.organization_id).filter(Boolean)).size,
    byProvider: tallyBy(rows, (r) => normalizeProvider(r.provider)),
    byModel: tallyBy(rows, (r) => r.model),
    byFeature: tallyBy(rows, (r) => r.feature_key).map((f) => ({ ...f, label: featureLabel(f.key) })),
    topOrgs: (() => {
      const m = new Map<string, { requests: number; tokens: number }>();
      for (const r of rows) { if (!r.organization_id) continue; const e = m.get(r.organization_id) ?? { requests: 0, tokens: 0 }; e.requests++; e.tokens += r.total_tokens ?? 0; m.set(r.organization_id, e); }
      return Array.from(m.entries()).map(([orgId, v]) => ({ orgId, ...v })).sort((a, b) => b.requests - a.requests).slice(0, 10);
    })(),
    newest: rows.map((r) => r.created_at).sort().at(-1) ?? null,
    generatedAt: new Date().toISOString(),
    source: "ai_usage_costs (כלכלת ספקי AI)",
  };
}

// ── Per-organization AI usage (Customer 360) ────────────────────────────────
export interface OrgAiUsage {
  configured: boolean; hasData: boolean;
  requests7d: number; requests30d: number; failures: number;
  tokens: { input: number; output: number; total: number };
  cost: { available: boolean; amount: number | null; currency: string };
  features: { key: string; label: string; requests: number }[];
  providers: string[]; models: string[];
  generatedAt: string; source: string;
}
export async function getOrgAiUsage(orgId: string): Promise<OrgAiUsage> {
  const { rows, tableMissing } = await readRows(orgId);
  const now = Date.now();
  const within = (r: Row, d: number) => new Date(r.created_at).getTime() >= now - d * 86_400_000;
  return {
    configured: !tableMissing, hasData: rows.length > 0,
    requests7d: rows.filter((r) => within(r, 7)).length,
    requests30d: rows.filter((r) => within(r, 30)).length,
    failures: rows.filter((r) => r.status === "failed").length,
    tokens: sumTokens(rows), cost: costState(rows),
    features: tallyBy(rows, (r) => r.feature_key).map((f) => ({ key: f.key, label: featureLabel(f.key), requests: f.requests })),
    providers: Array.from(new Set(rows.map((r) => normalizeProvider(r.provider)))),
    models: Array.from(new Set(rows.map((r) => r.model))),
    generatedAt: new Date().toISOString(), source: "ai_usage_costs",
  };
}
