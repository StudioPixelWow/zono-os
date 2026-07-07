import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { getDashboardContext } from "@/lib/dashboard/context";
import { DashboardDataProvider } from "@/components/dashboard/DashboardDataProvider";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CreatedCelebration } from "@/components/ui/CreatedCelebration";
import { PropertyRadarAlertProvider } from "@/components/property-radar";
import { LaunchOverlay } from "@/components/launch/LaunchOverlay";
import { CarouselWheelScroll } from "@/components/ui/CarouselWheelScroll";
import { ZonoRealtimeProvider } from "@/components/realtime/ZonoRealtimeProvider";
import { StickySystemRefreshButton } from "@/components/orchestrator/StickySystemRefreshButton";
import { DailyGroupsPublishingProvider } from "@/components/daily-groups-publishing/DailyGroupsPublishingProvider";
import { PwaProvider } from "@/components/mobile/PwaProvider";

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
      <CreatedCelebration />
      <PropertyRadarAlertProvider />
      <LaunchOverlay />
      <CarouselWheelScroll />
      <ZonoRealtimeProvider />
      <StickySystemRefreshButton />
      <DailyGroupsPublishingProvider />
      <PwaProvider />
    </DashboardDataProvider>
  );
}
