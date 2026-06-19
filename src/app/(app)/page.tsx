import { Suspense } from "react";
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
import { CommunicationDashboardSection } from "@/components/dashboard/sections/CommunicationDashboardSection";

// Reads live data on the server (Properties strip), so render per-request.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
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
      <Suspense fallback={null}>
        <CommunicationDashboardSection />
      </Suspense>
      <CommandSection />
    </>
  );
}
