import "server-only";
import { getSessionContext } from "@/lib/auth/session";

/** Current org + reviewer id for the Resolution Center (RLS still enforces org). */
export async function reviewerContext(): Promise<{ orgId: string; userId: string | null }> {
  const { profile, state } = await getSessionContext();
  if (state !== "ready" || !profile?.org_id) throw new Error("unauthorized");
  return { orgId: profile.org_id, userId: profile.id ?? null };
}
