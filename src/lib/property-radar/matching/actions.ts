"use server";
// ============================================================================
// ZONO Property Radar™ — buyer-match server actions (org-scoped via session).
// Powers the Buyer Match Panel: list top matches for a shared property and let
// the agent record an outcome (viewed / contacted / dismissed / converted).
// Strictly org-scoped — orgId always comes from the session, never the client.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { createMatchingRepository } from "./repository";
import type { MatchStatus, StoredBuyerMatch } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

async function orgId(): Promise<string> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  return profile.org_id;
}

const VALID_STATUSES: MatchStatus[] = ["new", "viewed", "contacted", "dismissed", "converted"];

export async function getBuyerMatchesForSourceAction(
  marketPropertySourceId: string,
  limit = 20,
): Promise<Result<StoredBuyerMatch[]>> {
  try {
    const org = await orgId();
    const repo = createMatchingRepository();
    const data = await repo.getTopMatchesForSource(org, marketPropertySourceId, limit);
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function updateBuyerMatchStatusAction(
  matchId: string,
  status: MatchStatus,
): Promise<Result<{ matchId: string; status: MatchStatus }>> {
  try {
    if (!VALID_STATUSES.includes(status)) throw new Error("סטטוס לא תקין.");
    const org = await orgId();
    const repo = createMatchingRepository();
    await repo.updateMatchStatus(org, matchId, status);
    return { ok: true, data: { matchId, status } };
  } catch (e) {
    return fail(e);
  }
}
