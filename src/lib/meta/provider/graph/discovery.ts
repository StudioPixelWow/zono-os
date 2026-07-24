// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH ASSET DISCOVERY. Phase 1.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: Graph discovery edges (/me/businesses, /me/accounts, linked IG)
// live here. Returns discovery DTOs carrying an OPAQUE Meta id (`externalId`) +
// safe display fields. A Page's own credential is returned once as `tokenPlain`
// so the connection engine can encrypt it immediately — it is never logged and
// never surfaced beyond the engine. Raw Graph field names never leave this dir.
// ============================================================================
import { graphEndpoint, GRAPH_EDGES, normalizeVerificationStatus } from "./compat";
import { graphJson, type GraphFetch } from "./client";
import type { GraphBusinessNode, GraphInstagramNode, GraphPageNode } from "./types";

export interface DiscoveredBusiness {
  externalId: string;
  name: string;
  verificationStatus: "verified" | "not_verified" | "pending" | "unknown";
}

export interface DiscoveredPage {
  externalId: string;
  name: string;
  category: string | null;
  /** The Page's own credential (plaintext) — engine encrypts immediately. */
  tokenPlain: string | null;
  permittedTasks: readonly string[];
  /** Linked IG Professional account's Meta id, when present. */
  instagramExternalId: string | null;
}

export interface DiscoveredInstagram {
  externalId: string;
  username: string;
  accountType: "business" | "creator" | "unknown";
  followers: number | null;
  /** The Page (Meta id) this IG account is linked through. */
  pageExternalId: string;
}

/** Canonical permitted-task mapping (raw Graph task → canonical task key). */
function normalizeTasks(tasks: readonly string[] | undefined): string[] {
  const MAP: Record<string, string> = {
    MANAGE: "manage", CREATE_CONTENT: "create_content", MODERATE: "moderate",
    ADVERTISE: "advertise", ANALYZE: "analyze", MESSAGING: "messaging",
  };
  return (tasks ?? []).map((t) => MAP[t] ?? t.toLowerCase());
}

function accountType(raw: string | undefined): "business" | "creator" | "unknown" {
  const v = (raw || "").toUpperCase();
  if (v === "BUSINESS") return "business";
  if (v === "MEDIA_CREATOR" || v === "CREATOR") return "creator";
  return "unknown";
}

/** Discover Business Portfolios for a token. */
export async function fetchBusinesses(token: string, fetchImpl?: GraphFetch): Promise<DiscoveredBusiness[]> {
  const url = graphEndpoint(GRAPH_EDGES.businesses) + "?" + new URLSearchParams({ fields: "id,name,verification_status", access_token: token, limit: "100" }).toString();
  const json = await graphJson<{ data?: GraphBusinessNode[] }>(url, { fetchImpl });
  return (json.data ?? []).filter((b) => b.id).map((b) => ({
    externalId: b.id, name: b.name ?? "", verificationStatus: normalizeVerificationStatus(b.verification_status),
  }));
}

/** Discover Facebook Pages (with linked IG id + the Page credential). */
export async function fetchPages(token: string, fetchImpl?: GraphFetch): Promise<DiscoveredPage[]> {
  const url = graphEndpoint(GRAPH_EDGES.accounts) + "?" + new URLSearchParams({
    fields: "id,name,category,access_token,tasks,instagram_business_account{id}", access_token: token, limit: "100",
  }).toString();
  const json = await graphJson<{ data?: GraphPageNode[] }>(url, { fetchImpl });
  return (json.data ?? []).filter((p) => p.id).map((p) => ({
    externalId: p.id,
    name: p.name ?? "",
    category: p.category ?? null,
    tokenPlain: p.access_token ?? null,
    permittedTasks: normalizeTasks(p.tasks),
    instagramExternalId: p.instagram_business_account?.id ?? null,
  }));
}

/** Fetch details for a linked IG Professional account (using a Page token). */
export async function fetchInstagram(igExternalId: string, pageToken: string, pageExternalId: string, fetchImpl?: GraphFetch): Promise<DiscoveredInstagram | null> {
  const url = graphEndpoint(`/${igExternalId}`) + "?" + new URLSearchParams({ fields: "username,account_type,followers_count", access_token: pageToken }).toString();
  try {
    const json = await graphJson<GraphInstagramNode>(url, { fetchImpl });
    if (!json.id && !igExternalId) return null;
    return {
      externalId: igExternalId,
      username: json.username ?? "",
      accountType: accountType(json.account_type),
      followers: typeof json.followers_count === "number" ? json.followers_count : null,
      pageExternalId,
    };
  } catch {
    return null;
  }
}
