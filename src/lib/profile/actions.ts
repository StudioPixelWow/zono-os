"use server";
// ============================================================================
// ZONO — current-user profile actions. Lets a user edit their own display
// details (name / title / photo) from the header avatar popup. RLS restricts
// writes to the user's own row.
// ============================================================================
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export interface UpdateProfileInput {
  fullName?: string;
  title?: string | null;
  avatarUrl?: string | null;
}

export type ProfileResult = { ok: true } | { ok: false; error: string };

/** Update the signed-in user's own profile (name / title / avatar). */
export async function updateMyProfileAction(input: UpdateProfileInput): Promise<ProfileResult> {
  try {
    const { user, profile, state } = await getSessionContext();
    if (state !== "ready" || !user || !profile) return { ok: false, error: "unauthorized" };

    const patch: Record<string, unknown> = {};
    if (input.fullName !== undefined) {
      const name = input.fullName.trim();
      if (!name) return { ok: false, error: "השם לא יכול להיות ריק" };
      patch.full_name = name;
    }
    if (input.title !== undefined) patch.title = input.title?.trim() || null;
    if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl?.trim() || null;
    if (Object.keys(patch).length === 0) return { ok: true };

    const db = await createClient();
    const { error } = await db.from("users").update(patch as never).eq("id", user.id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "update_failed" };
  }
}
