// ============================================================================
// ZI Interactive Learning™ — progress repository (Phase 25, SERVER-ONLY).
// Per-user learning progress, org-scoped via RLS. ZI never acts on business
// data — this only records which lessons a user viewed / completed / favorited.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { LearningProgress, LearningKind } from "./learning/types";

const COLS = "kind,slug,status,favorite,last_step,updated_at";

function toProgress(r: Record<string, unknown>): LearningProgress {
  return {
    kind: r.kind as LearningKind, slug: r.slug as string,
    status: (r.status as LearningProgress["status"]) ?? "viewed",
    favorite: Boolean(r.favorite), lastStep: (r.last_step as number) ?? 0,
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
  };
}

async function ids(): Promise<{ org: string; user: string }> {
  const { user, profile, state } = await getSessionContext();
  if (state !== "ready" || !profile?.org_id || !user) throw new Error("unauthorized");
  return { org: profile.org_id, user: user.id };
}

/** All of the current user's learning progress rows. */
export async function loadProgress(): Promise<LearningProgress[]> {
  try {
    const { org, user } = await ids();
    const db = await createClient();
    const { data } = await db.from("zi_learning_progress").select(COLS)
      .eq("organization_id", org).eq("user_id", user).order("updated_at", { ascending: false }).limit(500);
    return ((data as Record<string, unknown>[] | null) ?? []).map(toProgress);
  } catch { return []; }
}

export interface UpsertProgressInput {
  kind: LearningKind; slug: string;
  status?: LearningProgress["status"]; favorite?: boolean; lastStep?: number;
}

/** Record viewing / progress / completion / favorite for one lesson. */
export async function upsertProgress(input: UpsertProgressInput): Promise<void> {
  const { org, user } = await ids();
  const db = await createClient();
  const patch: Record<string, unknown> = { organization_id: org, user_id: user, kind: input.kind, slug: input.slug };
  if (input.status !== undefined) patch.status = input.status;
  if (input.favorite !== undefined) patch.favorite = input.favorite;
  if (input.lastStep !== undefined) patch.last_step = input.lastStep;
  const { error } = await db.from("zi_learning_progress").upsert(patch as never, { onConflict: "organization_id,user_id,kind,slug" });
  if (error) throw new Error(error.message);
}
