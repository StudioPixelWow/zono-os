// Internal server-only helper: resolve the current org id (RLS still enforces).
import "server-only";
import { getSessionContext } from "@/lib/auth/session";

export async function currentOrgId(): Promise<string> {
  const { profile, state } = await getSessionContext();
  if (state !== "ready" || !profile?.org_id) throw new Error("unauthorized");
  return profile.org_id;
}
