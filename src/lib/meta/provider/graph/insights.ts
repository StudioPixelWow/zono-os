// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · GRAPH INSIGHTS (sealed, READ-ONLY). Phase 2.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: the ONLY place Graph insight endpoints + raw metric names exist.
// Read-only object (post/media) + account (Page/IG) metric reads, mapped to
// canonical, provider-neutral snapshots. RULES: insights are READ-ONLY (no write
// endpoint here); a transient failure is reported `ambiguous` (retried on a
// bounded cadence, never recorded as a zero); the Page/IG token is used server-
// side and never logged; NO raw Graph payload or metric name escapes. `fetchImpl`
// is injectable so QA runs offline.
// ============================================================================
import { graphEndpoint } from "./compat";
import { graphJson, type GraphFetch } from "./client";
import { isMetaProviderError, MetaProviderError, type MetaProviderErrorKind } from "../errors";
import type { InsightFetchRequest, InsightFetchResult, InsightFetchError, InsightsGateway } from "../../insights/provider-types";
import type { MetricKey, InsightSnapshot, InsightPeriod } from "../../insights/domain";

export interface InsightsDeps { fetchImpl?: GraphFetch }

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const errKind = (e: unknown): MetaProviderErrorKind => (isMetaProviderError(e) ? (e as MetaProviderError).meta.kind : "internal");
function safeError(e: unknown): InsightFetchError {
  if (isMetaProviderError(e)) { const m = (e as MetaProviderError).meta; return { kind: m.kind, safeMessage: m.safeMessage, providerCodeCategory: m.providerCodeCategory, retryClass: m.retryClass }; }
  return { kind: "internal", safeMessage: "insight fetch failed", providerCodeCategory: null, retryClass: "non_retryable" };
}
const AMBIGUOUS_KINDS: ReadonlySet<MetaProviderErrorKind> = new Set(["timeout", "network", "rate_limited", "transient_provider", "unavailable"]);

// Raw Graph metric name → canonical key (Graph specifics stay sealed here).
const FB_OBJECT: Record<string, MetricKey> = { post_impressions: "impressions", post_impressions_unique: "reach", post_engaged_users: "engagement", post_clicks: "clicks", post_video_views: "video_views", post_reactions_by_type_total: "reactions" };
const IG_OBJECT: Record<string, MetricKey> = { impressions: "impressions", reach: "reach", engagement: "engagement", saved: "saves", video_views: "video_views", likes: "likes", comments: "comments", shares: "shares" };
const FB_ACCOUNT: Record<string, MetricKey> = { page_impressions: "impressions", page_impressions_unique: "reach", page_fans: "followers", page_views_total: "profile_views" };
const IG_ACCOUNT: Record<string, MetricKey> = { impressions: "impressions", reach: "reach", follower_count: "followers", profile_views: "profile_views" };

interface RawMetric { name?: string; period?: string; values?: { value?: number | Record<string, number>; end_time?: string }[] }
interface RawInsights { data?: RawMetric[] }

function mapPeriod(p: string | undefined): InsightPeriod { return p === "day" ? "day" : p === "week" ? "week" : p === "days_28" ? "days_28" : "lifetime"; }
function scalar(v: number | Record<string, number> | undefined): number { if (typeof v === "number") return v; if (v && typeof v === "object") return Object.values(v).reduce((a, b) => a + (Number(b) || 0), 0); return 0; }

function toSnapshots(raw: RawInsights, map: Record<string, MetricKey>): InsightSnapshot[] {
  const out: InsightSnapshot[] = [];
  for (const m of raw.data ?? []) {
    const key = m.name ? map[m.name] : undefined;
    if (!key) continue;
    const last = (m.values ?? []).at(-1);
    out.push({ metricKey: key, period: mapPeriod(m.period), value: scalar(last?.value), observedAt: last?.end_time ?? "" });
  }
  return out;
}

async function fetchInsights(req: InsightFetchRequest, deps: InsightsDeps): Promise<InsightFetchResult> {
  try {
    if (req.subjectKind === "object") {
      if (!req.objectExternalId) return { ok: false, snapshots: [], observedAt: null, ambiguous: false, error: { kind: "invalid_request", safeMessage: "no object id", providerCodeCategory: null, retryClass: "non_retryable" }, warnings: [] };
      const map = req.platform === "instagram" ? IG_OBJECT : FB_OBJECT;
      const metrics = Object.keys(map).join(",");
      const raw = await graphJson<RawInsights>(graphEndpoint(`/${req.objectExternalId}/insights`) + "?" + q({ metric: metrics, access_token: req.tokenPlain }), { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
      return { ok: true, snapshots: toSnapshots(raw ?? {}, map), observedAt: null, ambiguous: false, error: null, warnings: [] };
    }
    const map = req.platform === "instagram" ? IG_ACCOUNT : FB_ACCOUNT;
    const metrics = Object.keys(map).join(",");
    const raw = await graphJson<RawInsights>(graphEndpoint(`/${req.assetExternalId}/insights`) + "?" + q({ metric: metrics, period: "day", access_token: req.tokenPlain }), { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
    return { ok: true, snapshots: toSnapshots(raw ?? {}, map), observedAt: null, ambiguous: false, error: null, warnings: [] };
  } catch (e) {
    return { ok: false, snapshots: [], observedAt: null, ambiguous: AMBIGUOUS_KINDS.has(errKind(e)), error: safeError(e), warnings: [] };
  }
}

/** Build the sealed insights gateway (server wiring supplies a real fetch). */
export function createInsightsGateway(deps: InsightsDeps = {}): InsightsGateway {
  return { fetchInsights: (req) => fetchInsights(req, deps) };
}
