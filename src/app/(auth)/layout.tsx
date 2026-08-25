import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { destinationForState } from "@/lib/auth/onboarding-routing";

export const dynamic = "force-dynamic";

/** Public auth pages. Already-authenticated users are bounced onward. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { state } = await getSessionContext();
  // 9.8 — single loop-free routing matrix. In the auth context only "ready" → / and
  // "onboarding" → /onboarding redirect; unauth/suspended render the public pages.
  const action = destinationForState(state, "auth");
  if (action !== "render") redirect(action);

  // Guard only — each auth page renders its own chrome (login = full-screen
  // futuristic experience; signup = centered dark-glass card).
  return <>{children}</>;
}
