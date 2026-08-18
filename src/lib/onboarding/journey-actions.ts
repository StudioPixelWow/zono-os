"use server";
// ============================================================================
// ZONO — onboarding journey actions. Persist a sensible "later" / "continue
// alone" deferral for a skippable journey group so skipping is resumable and
// never destroys orientation. Org-scoped; owner/manager not required (any org
// member may defer their own office's optional setup step).
// ============================================================================
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { JourneyGroupKey } from "@/lib/activation/activation";

const SKIPPABLE: JourneyGroupKey[] = ["team", "marketing", "ready"];

export async function skipOnboardingGroupAction(group: JourneyGroupKey): Promise<{ ok: boolean }> {
  if (!SKIPPABLE.includes(group)) return { ok: false };
  const { organization } = await getSessionContext();
  if (!organization) return { ok: false };
  const db = createServiceRoleClient();
  const { data } = await db
    .from("onboarding_progress" as never)
    .select("skipped")
    .eq("org_id" as never, organization.id as never)
    .maybeSingle();
  const cur = Array.isArray((data as { skipped?: unknown } | null)?.skipped)
    ? ((data as { skipped: string[] }).skipped)
    : [];
  const next = Array.from(new Set([...cur, group]));
  await db.from("onboarding_progress" as never).upsert(
    { org_id: organization.id, skipped: next } as never,
    { onConflict: "org_id" },
  );
  revalidatePath("/getting-started");
  revalidatePath("/");
  return { ok: true };
}

/** <form action> wrapper — returns void so it satisfies the form-action type. */
export async function skipOnboardingGroupFormAction(group: JourneyGroupKey): Promise<void> {
  await skipOnboardingGroupAction(group);
}

export async function unskipOnboardingGroupAction(group: JourneyGroupKey): Promise<{ ok: boolean }> {
  const { organization } = await getSessionContext();
  if (!organization) return { ok: false };
  const db = createServiceRoleClient();
  const { data } = await db
    .from("onboarding_progress" as never)
    .select("skipped")
    .eq("org_id" as never, organization.id as never)
    .maybeSingle();
  const cur = Array.isArray((data as { skipped?: unknown } | null)?.skipped)
    ? ((data as { skipped: string[] }).skipped)
    : [];
  const next = cur.filter((g) => g !== group);
  await db.from("onboarding_progress" as never).upsert(
    { org_id: organization.id, skipped: next } as never,
    { onConflict: "org_id" },
  );
  revalidatePath("/getting-started");
  revalidatePath("/");
  return { ok: true };
}
