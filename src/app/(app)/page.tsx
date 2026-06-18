import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { HeroSection } from "@/components/dashboard/sections/HeroSection";
import { OpportunitiesSection } from "@/components/dashboard/sections/OpportunitiesSection";
import { PropertiesSectionContainer } from "@/components/dashboard/sections/PropertiesSectionContainer";
import { PropertiesSkeleton } from "@/components/dashboard/sections/PropertiesSkeleton";
import { HeatmapSection } from "@/components/dashboard/sections/HeatmapSection";
import { JourneysSection } from "@/components/dashboard/sections/JourneysSection";
import { MatchingSection } from "@/components/dashboard/sections/MatchingSection";
import { DealsSection } from "@/components/dashboard/sections/DealsSection";
import { MarketSection } from "@/components/dashboard/sections/MarketSection";
import { CommandSection } from "@/components/dashboard/sections/CommandSection";

// The Properties strip reads live data on the server, so render per-request
// (avoids build-time prerendering the Supabase query).
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <DashboardShell>
      <HeroSection />
      <OpportunitiesSection />
      <Suspense fallback={<PropertiesSkeleton />}>
        <PropertiesSectionContainer />
      </Suspense>
      <HeatmapSection />
      <JourneysSection />
      <MatchingSection />
      <DealsSection />
      <MarketSection />
      <CommandSection />
    </DashboardShell>
  );
}
