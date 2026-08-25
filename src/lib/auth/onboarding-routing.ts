// ============================================================================
// ZONO — canonical onboarding ROUTING decision (PURE, deterministic). 9.8.
// ONE truth decides login routing: the user's onboarding_completed flag (plus
// auth + blocked status). This module has NO subscription/billing input BY DESIGN
// — billing status must NEVER drive onboarding routing (a paid/grace/restricted/
// cancelled office is routed the same as any other; only the onboarding flag and
// account status matter). The three layout guards ((app)/(auth)/onboarding) all
// derive their redirect from `destinationForState`, so the matrix is loop-free by
// construction and single-sourced. No @/ imports / no server-only → unit-testable.
// ============================================================================

export type OnboardingState = "unauthenticated" | "onboarding" | "ready" | "suspended";

export interface OnboardingRoutingInputs {
  /** A Supabase auth user is present. */
  hasUser: boolean;
  /** The account status is blocked/suspended/disabled (checked BEFORE onboarding). */
  blocked: boolean;
  /** A users-table profile row exists for this auth user. */
  hasProfile: boolean;
  /** users.onboarding_completed — the SINGLE onboarding truth. */
  onboardingCompleted: boolean;
}

/**
 * The canonical onboarding state. Order matters: unauthenticated → suspended →
 * onboarding → ready. A blocked account can neither use the app nor (re)onboard.
 * NOTE: there is deliberately no subscription/billing parameter here.
 */
export function resolveOnboardingState(i: OnboardingRoutingInputs): OnboardingState {
  if (!i.hasUser) return "unauthenticated";
  if (i.blocked) return "suspended";
  if (!i.hasProfile || !i.onboardingCompleted) return "onboarding";
  return "ready";
}

/** What a layout guard should do for a state. "render" = show this route's children;
 *  "suspended-screen" = render the AccountSuspended screen; a "/path" = redirect. */
export type RoutingAction = "render" | "suspended-screen" | "/login" | "/" | "/onboarding";

/** Which layout group is asking. */
export type LayoutContext = "app" | "auth" | "onboarding";

/**
 * The single loop-free routing matrix. Each layout maps a state → action; the three
 * contexts are complementary so following any redirect terminates (proven in tests):
 *   - app:        unauth→/login · suspended→screen · onboarding→/onboarding · ready→render
 *   - auth:       ready→/ · onboarding→/onboarding · (unauth/suspended)→render (public pages)
 *   - onboarding: unauth→/login · ready→/ · suspended→screen · onboarding→render
 */
export function destinationForState(state: OnboardingState, ctx: LayoutContext): RoutingAction {
  if (ctx === "app") {
    if (state === "unauthenticated") return "/login";
    if (state === "suspended") return "suspended-screen";
    if (state === "onboarding") return "/onboarding";
    return "render";
  }
  if (ctx === "auth") {
    if (state === "ready") return "/";
    if (state === "onboarding") return "/onboarding";
    return "render"; // unauthenticated + suspended may view the public auth pages
  }
  // ctx === "onboarding"
  if (state === "unauthenticated") return "/login";
  if (state === "ready") return "/";
  if (state === "suspended") return "suspended-screen";
  return "render"; // state === "onboarding" → show the wizard
}
