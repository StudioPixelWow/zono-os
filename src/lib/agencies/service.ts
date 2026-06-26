// ============================================================================
// ZONO — AgencyService (Phase 26.0, SERVER-ONLY). Orchestrates the agency entity:
// create/update (with timeline events), search, duplicate detection + merge, and
// composite reads. No AI, no scraping — infrastructure foundation for 26.1+.
// ============================================================================
import "server-only";
import {
  createAgency as repoCreate, updateAgency as repoUpdate, getAgencyById,
  findByNormalizedName as repoFindNormalized, searchAgencies as repoSearch,
  listAgencies as repoList, deactivateAgency,
} from "./agencyRepository";
import { listBranches } from "./branchRepository";
import { getProfile } from "./profileRepository";
import { addTimelineEvent } from "./timelineRepository";
import { normalizeAgencyName } from "./normalize";
import { duplicateScore } from "./duplicate-detection";
import type {
  Agency, AgencyBranch, AgencyProfile, CreateAgencyInput, UpdateAgencyInput,
} from "./types";

export interface CreateAgencyResult {
  agency: Agency;
  /** Possible duplicates found at creation time (does NOT block creation). */
  possibleDuplicates: { agency: Agency; confidence: number; reasons: string[] }[];
}

export const AgencyService = {
  /** Create an agency, log a timeline event, and surface possible duplicates. */
  async createAgency(input: CreateAgencyInput): Promise<CreateAgencyResult> {
    const normalized = normalizeAgencyName(input.name);
    const existing = normalized ? await repoFindNormalized(normalized) : [];
    const agency = await repoCreate(input);

    const possibleDuplicates = existing
      .filter((e) => e.id !== agency.id)
      .map((e) => {
        const s = duplicateScore(agency, e);
        return { agency: e, confidence: s.confidence, reasons: s.reasons };
      })
      .filter((d) => d.confidence >= 0.6)
      .sort((a, b) => b.confidence - a.confidence);

    await addTimelineEvent({
      agencyId: agency.id, eventType: "created", title: "הסוכנות נוצרה",
      description: agency.name, metadata: { normalizedName: agency.normalizedName },
    }).catch(() => {});

    return { agency, possibleDuplicates };
  },

  /** Update an agency and record what changed in the timeline. */
  async updateAgency(id: string, patch: UpdateAgencyInput): Promise<Agency> {
    const agency = await repoUpdate(id, patch);
    await addTimelineEvent({
      agencyId: id, eventType: "updated", title: "הסוכנות עודכנה",
      metadata: { fields: Object.keys(patch) },
    }).catch(() => {});
    return agency;
  },

  getAgency(id: string): Promise<Agency | null> { return getAgencyById(id); },

  /** Find by id; returns null if missing / not in org. */
  async findAgency(id: string): Promise<Agency | null> { return getAgencyById(id); },

  findByNormalizedName(name: string): Promise<Agency[]> {
    return repoFindNormalized(normalizeAgencyName(name));
  },

  search(query: string, limit = 25): Promise<Agency[]> { return repoSearch(query, limit); },

  list(limit = 200): Promise<Agency[]> { return repoList(limit); },

  getBranches(agencyId: string): Promise<AgencyBranch[]> { return listBranches(agencyId); },

  getProfile(agencyId: string): Promise<AgencyProfile | null> { return getProfile(agencyId); },

  /**
   * Merge a duplicate agency into a primary one. Deactivates the duplicate and
   * records the merge on both timelines. Conservative: never deletes data.
   */
  async mergeDuplicateAgencies(primaryId: string, duplicateId: string): Promise<Agency | null> {
    if (primaryId === duplicateId) return getAgencyById(primaryId);
    const [primary, dup] = await Promise.all([getAgencyById(primaryId), getAgencyById(duplicateId)]);
    if (!primary || !dup) return null;

    // Backfill empty primary fields from the duplicate (no overwrite of real data).
    const patch: UpdateAgencyInput = {};
    if (!primary.website && dup.website) patch.website = dup.website;
    if (!primary.phone && dup.phone) patch.phone = dup.phone;
    if (!primary.email && dup.email) patch.email = dup.email;
    if (!primary.googlePlaceId && dup.googlePlaceId) patch.googlePlaceId = dup.googlePlaceId;
    if (!primary.logoUrl && dup.logoUrl) patch.logoUrl = dup.logoUrl;
    const merged = Object.keys(patch).length ? await repoUpdate(primaryId, patch) : primary;

    await deactivateAgency(duplicateId);
    await Promise.all([
      addTimelineEvent({ agencyId: primaryId, eventType: "merged", title: "מוזגה סוכנות כפולה", description: dup.name, metadata: { mergedFrom: duplicateId } }).catch(() => {}),
      addTimelineEvent({ agencyId: duplicateId, eventType: "merged_into", title: "מוזגה לתוך סוכנות אחרת", description: primary.name, metadata: { mergedInto: primaryId } }).catch(() => {}),
    ]);
    return merged;
  },
};
