import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Public auth pages. Already-authenticated users are bounced onward. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { state } = await getSessionContext();
  if (state === "ready") redirect("/");
  if (state === "onboarding") redirect("/onboarding");

  // Guard only — each auth page renders its own chrome (login = full-screen
  // futuristic experience; signup = centered dark-glass card).
  return <>{children}</>;
}
