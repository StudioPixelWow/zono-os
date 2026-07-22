// ============================================================================
// ⌘ ZONO OS 2.0 — STAGE 6 · Batch 6.4 · COMMAND CENTER — provider (server).
//
// The ONE server entry the palette calls for entity search. It consumes ONLY
// the canonical omnisearch (globalSearchAction over the search_documents
// projection) — no SQL, no new search engine, isolation (broker/manager/
// cross-org) inherited from that frozen service. It maps the result into
// canonical command groups and returns [] on empty/failed (never fabricated).
// ============================================================================
"use server";
import { globalSearchAction } from "@/lib/search/actions";
import { mapEntityGroups } from "./search";
import type { CommandGroup } from "./types";

/** Aggregate entity search into canonical JUMP command groups. Provider search
 *  only — the search runs inside the frozen canonical service. */
export async function commandSearchAction(query: string): Promise<CommandGroup[]> {
  if (!query.trim()) return [];
  const groups = await globalSearchAction(query).catch(() => []);
  return mapEntityGroups(groups);
}
