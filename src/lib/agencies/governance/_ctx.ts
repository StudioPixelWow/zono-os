import "server-only";
import { getSessionContext } from "@/lib/auth/session";

export async function govContext(): Promise<{ orgId: string; actorId: string | null }> {
  const { profile, state } = await getSessionContext();
  if (state !== "ready" || !profile?.org_id) throw new Error("unauthorized");
  return { orgId: profile.org_id, actorId: profile.id ?? null };
}
