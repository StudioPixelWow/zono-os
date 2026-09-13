import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { destinationForState } from "@/lib/auth/onboarding-routing";
import { resolvePaymentGate, isPathAllowedWhenUnpaid } from "@/lib/commercial/access-gate";
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
import { AccountSuspended } from "@/components/auth/AccountSuspended";
import { TrialBanner } from "@/components/commercial/TrialBanner";

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
  const { state, organization } = await getSessionContext();
  // 9.8 — single loop-free routing matrix (never branches on billing).
  const action = destinationForState(state, "app");
  if (action === "suspended-screen") return <AccountSuspended />;
  if (action !== "render") redirect(action);

  // ── NO-TRIAL PAYMENT GATE (server-side) ──────────────────────────────────────
  // A new office is UNPAID until a verified Grow payment activates its subscription.
  // Enforced ONLY for orgs created on/after BILLING_ENFORCE_AFTER (existing orgs are
  // grandfathered; enforcement is off entirely when that env is unset). A blocked
  // org may still reach billing / account / support / pay — everything else routes
  // to the Payment-Required screen. This runs on the server for EVERY (app) page,
  // so a direct URL to /today, /claim, /properties, … cannot bypass it.
  let trialBanner: ReactNode = null;
  if (organization?.id) {
    const path = (await headers()).get("x-zono-path");
    const orgCreatedAt = (organization as { created_at?: string | null }).created_at ?? null;
    const gate = await resolvePaymentGate(organization.id, orgCreatedAt);
    // Blocked (unpaid + trial ended) → Payment Required, unless on an allowed path.
    if (gate.blocked && !isPathAllowedWhenUnpaid(path)) redirect("/payment-required");
    // On an active free trial → show the countdown banner to drive activation.
    if (gate.enforced && !gate.paid && gate.trialActive) {
      trialBanner = <TrialBanner daysLeft={gate.trialDaysLeft} />;
    }
  }

  const dashboardData = await getDashboardContext();

  return (
    <DashboardDataProvider value={dashboardData}>
      <DashboardShell>{trialBanner}{children}</DashboardShell>
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
