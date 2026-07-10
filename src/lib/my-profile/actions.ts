"use server";
// ============================================================================
// 👤 ZONO — Agent Personal Area actions. Thin wrappers that REUSE the existing
// agent_websites writer (single source of truth) and optionally sync the user's
// identity (name/title/avatar) into the `users` row. No new persistence. RLS on
// agent_websites already limits writes to the owner (or a manager). jsonb
// columns (theme / metadata) are MERGED, never clobbered.
// ============================================================================
import { revalidatePath } from "next/cache";
import { createOrGetAgentWebsite, updateAgentWebsite } from "@/lib/agent-website/service";
import { updateMyProfileAction } from "@/lib/profile/actions";

export interface SaveResult { ok: boolean; error?: string }

export interface SaveMyProfileInput {
  /** Direct agent_websites column patch (identity/branding/arrays/contact/social/testimonials/enabled_sections). */
  patch?: Record<string, unknown>;
  /** Sync these into the `users` row so sidebar/header stay consistent. */
  user?: { fullName?: string; title?: string | null; avatarUrl?: string | null };
  /** Merge into theme.preset without dropping other theme keys. */
  themePreset?: string;
  /** Merge into metadata.achievements without dropping other metadata keys. */
  achievements?: string[];
}

export async function saveMyProfileAction(input: SaveMyProfileInput): Promise<SaveResult> {
  try {
    const patch: Record<string, unknown> = { ...(input.patch ?? {}) };

    if (input.themePreset !== undefined || input.achievements !== undefined) {
      const row = (await createOrGetAgentWebsite()) as Record<string, unknown>;
      if (input.themePreset !== undefined) {
        const theme = (row.theme && typeof row.theme === "object" ? row.theme : {}) as Record<string, unknown>;
        patch.theme = { ...theme, preset: input.themePreset };
      }
      if (input.achievements !== undefined) {
        const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
        patch.metadata = { ...meta, achievements: input.achievements };
      }
    }

    if (Object.keys(patch).length > 0) await updateAgentWebsite(patch);

    if (input.user && (input.user.fullName || input.user.title !== undefined || input.user.avatarUrl !== undefined)) {
      const r = await updateMyProfileAction({
        ...(input.user.fullName ? { fullName: input.user.fullName } : {}),
        ...(input.user.title !== undefined ? { title: input.user.title ?? undefined } : {}),
        ...(input.user.avatarUrl !== undefined ? { avatarUrl: input.user.avatarUrl ?? undefined } : {}),
      });
      if (!r.ok) return { ok: false, error: r.error };
    }

    revalidatePath("/my-profile");
    revalidatePath("/agent-website");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "השמירה נכשלה" };
  }
}
