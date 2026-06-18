/**
 * Session & onboarding service. Server-only. Used by layout guards to decide
 * between login / onboarding / dashboard.
 */
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, type UserProfile } from "@/lib/repositories/userRepository";
import {
  getOrganizationById,
  type Organization,
} from "@/lib/repositories/organizationRepository";

export type OnboardingState = "unauthenticated" | "onboarding" | "ready";

export interface SessionContext {
  user: User | null;
  profile: UserProfile | null;
  organization: Organization | null;
  state: OnboardingState;
}

/** The current Supabase auth user, or null. */
export async function getAuthUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/**
 * Resolve the full session context in one place:
 * - no auth user                       → "unauthenticated"
 * - auth user, no/incomplete profile   → "onboarding"
 * - auth user, completed profile       → "ready" (+ organization)
 */
export async function getSessionContext(): Promise<SessionContext> {
  const user = await getAuthUser();
  if (!user) {
    return { user: null, profile: null, organization: null, state: "unauthenticated" };
  }

  const profile = await getCurrentUserProfile();
  if (!profile || !profile.onboarding_completed) {
    return { user, profile: profile ?? null, organization: null, state: "onboarding" };
  }

  const organization = await getOrganizationById(profile.org_id);
  return { user, profile, organization, state: "ready" };
}

/** Convenience: just the onboarding state. */
export async function getOnboardingState(): Promise<OnboardingState> {
  return (await getSessionContext()).state;
}
