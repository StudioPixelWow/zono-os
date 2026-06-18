import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { getDashboardContext } from "@/lib/dashboard/context";
import { DashboardDataProvider } from "@/components/dashboard/DashboardDataProvider";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

/**
 * Protected app shell. Enforces the session → onboarding → dashboard flow and
 * provides the real user/org context + app frame (sidebar/header) to every
 * page in the group.
 * - no session            → /login
 * - onboarding incomplete → /onboarding
 * - otherwise             → render the app within the shell
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { state } = await getSessionContext();
  if (state === "unauthenticated") redirect("/login");
  if (state === "onboarding") redirect("/onboarding");

  const dashboardData = await getDashboardContext();

  return (
    <DashboardDataProvider value={dashboardData}>
      <DashboardShell>{children}</DashboardShell>
    </DashboardDataProvider>
  );
}
