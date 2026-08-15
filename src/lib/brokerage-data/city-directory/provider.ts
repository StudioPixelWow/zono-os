// ============================================================================
// 🛰️ Madlan City Directory provider — SANCTIONED Apify adapter (server-only).
// ----------------------------------------------------------------------------
// This is the ONE place that talks to a directory source. It follows the exact
// external-listings provider pattern (ApifyClient + bounded runActor). It reads
// a DEDICATED directory actor id from APIFY_MADLAN_DIRECTORY_ACTOR_ID.
//
// PROVIDER REALITY (P9.2 audit): the existing Madlan actors are listings-only
// (`swerve/madlan-scraper`) and market-analytics-only (`swerve/madlan-analytics`).
// NEITHER exposes the office/agent directory. Until a sanctioned DIRECTORY actor
// is provisioned and its id set here, this provider reports
// `provider_not_configured` and returns ZERO entities — it NEVER scrapes Madlan
// directly, NEVER bypasses anti-bot, and NEVER fabricates directory records.
//
// When the actor is wired, the normalizer below is the single adaptation point
// (same defensive multi-key strategy as the listings provider's input adapter).
// ============================================================================
import "server-only";
import { ApifyClient } from "apify-client";
import { normalizeHebrewName, normalizeOfficeName, normalizeCity } from "../normalize";
import { normalizePhoneNumber } from "@/lib/broker/engine";
import { detectFranchise } from "../franchise";
import type {
  CityDirectoryProvider,
  CityDirectoryFetch,
  DirectoryOffice,
  DirectoryAgent,
  DirectoryRelationship,
} from "./types";

export const DIRECTORY_SOURCE = "madlan_directory";
const ACTOR_ENV = "APIFY_MADLAN_DIRECTORY_ACTOR_ID";
/** Bounded page cap so a runaway actor can never hang the refresh. */
const MAX_DIRECTORY_ITEMS = 2000;

type Raw = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v).trim() || null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const pick = (r: Raw, keys: string[]): unknown => {
  for (const k of keys) if (r[k] != null && r[k] !== "") return r[k];
  return null;
};
const now = () => new Date().toISOString();

function client(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN missing");
  return new ApifyClient({ token, maxRetries: 3 });
}

/** The dedicated directory actor id (env only — no default, so we can NEVER
 *  silently point the directory pipeline at a listings actor). */
export function directoryActorId(): string | null {
  return process.env[ACTOR_ENV] || null;
}

/** City sent under every common key a directory actor might read. */
function buildInput(locality: string): Record<string, unknown> {
  return {
    city: locality, cities: [locality], locality, location: locality, area: locality,
    settlement: locality, searchTerm: locality, query: locality, q: locality,
    // Directory intent hints — a directory actor reads one of these.
    mode: "directory", entity: "agents", target: "agents_office",
    includeOffices: true, includeAgents: true, includeRelationships: true,
    maxItems: MAX_DIRECTORY_ITEMS, limit: MAX_DIRECTORY_ITEMS,
  };
}

// ── Normalizers (single adaptation point when the actor is provisioned) ──────
function normOffice(r: Raw): DirectoryOffice | null {
  const displayName = s(pick(r, ["name", "officeName", "office_name", "title", "displayName"]));
  if (!displayName) return null;
  const fr = detectFranchise(displayName);
  return {
    sourceEntityId: s(pick(r, ["id", "officeId", "office_id", "entityId", "madlanId", "docId", "slug"])),
    displayName,
    normalizedName: normalizeOfficeName(displayName) || normalizeHebrewName(displayName),
    profileUrl: s(pick(r, ["url", "profileUrl", "officeUrl", "link", "href"])),
    city: s(pick(r, ["city", "cityName", "locality", "settlement"])),
    phone: normalizePhoneNumber(s(pick(r, ["phone", "primaryPhone", "phoneNumber", "tel"])) ?? "") || null,
    address: s(pick(r, ["address", "fullAddress", "streetAddress"])),
    website: s(pick(r, ["website", "websiteUrl", "domain", "site"])),
    brandNetwork: fr.matched ? fr.brandNetwork : s(pick(r, ["brand", "brandNetwork", "network", "franchise"])),
    sourceMetadata: pruneMeta(r),
  };
}

function normAgent(r: Raw): DirectoryAgent | null {
  const displayName = s(pick(r, ["name", "agentName", "agent_name", "fullName", "full_name", "title", "displayName"]));
  if (!displayName) return null;
  return {
    sourceEntityId: s(pick(r, ["id", "agentId", "agent_id", "entityId", "madlanId", "docId", "slug"])),
    displayName,
    normalizedName: normalizeHebrewName(displayName),
    profileUrl: s(pick(r, ["url", "profileUrl", "agentUrl", "link", "href"])),
    city: s(pick(r, ["city", "cityName", "locality", "settlement"])),
    phone: normalizePhoneNumber(s(pick(r, ["phone", "primaryPhone", "phoneNumber", "tel", "mobile"])) ?? "") || null,
    role: s(pick(r, ["role", "roleTitle", "title", "position"])),
    officeSourceEntityId: s(pick(r, ["officeId", "office_id", "officeEntityId", "officeSourceId", "parentOfficeId"])),
    sourceMetadata: pruneMeta(r),
  };
}

/** Keep only small, non-secret scalar hints for provenance (drop nested blobs). */
function pruneMeta(r: Raw): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (v == null) continue;
    if (typeof v === "string" && v.length <= 200) out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Split a mixed/typed dataset into offices, agents, relationships. Tolerates
 *  either a `{offices,agents,relationships}` envelope or a flat typed list. */
function partition(items: Raw[]): { offices: DirectoryOffice[]; agents: DirectoryAgent[]; relationships: DirectoryRelationship[] } {
  const offices: DirectoryOffice[] = [];
  const agents: DirectoryAgent[] = [];
  const relationships: DirectoryRelationship[] = [];
  const observedAt = now();

  const consume = (r: Raw) => {
    const type = (s(pick(r, ["type", "entityType", "kind", "recordType"])) ?? "").toLowerCase();
    const looksAgent = /agent|broker|מתווך/.test(type) || pick(r, ["agentName", "agent_name", "fullName"]) != null;
    const looksOffice = /office|agency|משרד/.test(type) || pick(r, ["officeName", "office_name"]) != null;
    if (looksOffice && !looksAgent) {
      const o = normOffice(r); if (o) offices.push(o);
    } else if (looksAgent) {
      const a = normAgent(r); if (a) {
        agents.push(a);
        if (a.officeSourceEntityId) {
          relationships.push({
            agentSourceEntityId: a.sourceEntityId, agentNormalizedName: a.normalizedName,
            officeSourceEntityId: a.officeSourceEntityId, officeNormalizedName: "",
            source: DIRECTORY_SOURCE, observedAt,
          });
        }
      }
    } else {
      // Ambiguous item — try office first, then agent (best-effort, never throws).
      const o = normOffice(r); if (o) { offices.push(o); return; }
      const a = normAgent(r); if (a) agents.push(a);
    }
  };

  for (const raw of items) {
    const envelope = obj(raw);
    if (envelope && (Array.isArray(envelope.offices) || Array.isArray(envelope.agents))) {
      for (const o of (envelope.offices as Raw[] | undefined) ?? []) { const n = normOffice(o); if (n) offices.push(n); }
      for (const a of (envelope.agents as Raw[] | undefined) ?? []) { const n = normAgent(a); if (n) agents.push(n); }
      for (const rel of (envelope.relationships as Raw[] | undefined) ?? []) {
        const agentId = s(pick(rel, ["agentId", "agent_id", "agentSourceEntityId"]));
        const officeId = s(pick(rel, ["officeId", "office_id", "officeSourceEntityId"]));
        if (officeId) relationships.push({
          agentSourceEntityId: agentId, agentNormalizedName: normalizeHebrewName(s(pick(rel, ["agentName"])) ?? ""),
          officeSourceEntityId: officeId, officeNormalizedName: normalizeOfficeName(s(pick(rel, ["officeName"])) ?? ""),
          source: DIRECTORY_SOURCE, observedAt,
        });
      }
      continue;
    }
    consume(raw);
  }
  return { offices, agents, relationships };
}

class MadlanDirectoryProvider implements CityDirectoryProvider {
  readonly source = DIRECTORY_SOURCE;

  isConfigured(): boolean {
    return !!process.env.APIFY_TOKEN && !!directoryActorId();
  }

  async fetchCityDirectory(locality: string): Promise<CityDirectoryFetch> {
    const base: Omit<CityDirectoryFetch, "status" | "offices" | "agents" | "relationships" | "reason"> = {
      source: this.source, locality,
      pagination: { pagesFetched: 0, exhausted: false, totalReported: null },
      observedAt: now(),
    };
    const empty = (status: CityDirectoryFetch["status"], reason: string | null): CityDirectoryFetch =>
      ({ ...base, status, reason, offices: [], agents: [], relationships: [] });

    const actorId = directoryActorId();
    if (!process.env.APIFY_TOKEN) {
      return empty("provider_not_configured", "APIFY_TOKEN missing — sanctioned directory access unavailable.");
    }
    if (!actorId) {
      return empty(
        "provider_not_configured",
        `${ACTOR_ENV} not set — no sanctioned Madlan DIRECTORY actor wired (listings/analytics actors do not expose the office/agent directory).`,
      );
    }

    try {
      const run = await client().actor(actorId).call(buildInput(locality), { timeout: 180, waitSecs: 170, memory: 1024 });
      if (run.status !== "SUCCEEDED") {
        return empty("error", `directory actor ${actorId} status=${run.status}`);
      }
      const datasetId = run.defaultDatasetId;
      if (!datasetId) return empty("partial", "directory actor returned no dataset");
      const { items, total } = await client().dataset(datasetId).listItems({ limit: MAX_DIRECTORY_ITEMS });
      const { offices, agents, relationships } = partition(items as Raw[]);
      const exhausted = typeof total === "number" ? total <= MAX_DIRECTORY_ITEMS : true;
      return {
        ...base,
        status: "success",
        reason: null,
        offices, agents, relationships,
        pagination: { pagesFetched: 1, exhausted, totalReported: typeof total === "number" ? total : null },
      };
    } catch (e) {
      return empty("error", e instanceof Error ? e.message : "directory fetch failed");
    }
  }
}

let _provider: CityDirectoryProvider | null = null;
export function getCityDirectoryProvider(): CityDirectoryProvider {
  if (!_provider) _provider = new MadlanDirectoryProvider();
  return _provider;
}

/** Presence-only env check for observability (never returns secret values). */
export function directoryEnvStatus(): { apifyToken: boolean; directoryActorId: boolean; actorId: string | null } {
  return { apifyToken: !!process.env.APIFY_TOKEN, directoryActorId: !!directoryActorId(), actorId: directoryActorId() };
}

// Re-export the city normalizer so the seeder shares one canonical implementation.
export { normalizeCity };
