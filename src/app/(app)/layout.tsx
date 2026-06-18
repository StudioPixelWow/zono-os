import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Protected app shell. Enforces the session → onboarding → dashboard flow:
 * - no session            → /login
 * - onboarding incomplete → /onboarding
 * - otherwise             → render the app
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { state } = await getSessionContext();
  if (state === "unauthenticated") redirect("/login");
  if (state === "onboarding") redirect("/onboarding");

  return <>{children}</>;
}
