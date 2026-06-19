import { Suspense } from "react";
import { HeroSection } from "@/components/dashboard/sections/HeroSection";
import { PropertiesSectionContainer } from "@/components/dashboard/sections/PropertiesSectionContainer";
import { PropertiesSkeleton } from "@/components/dashboard/sections/PropertiesSkeleton";
import { HeatmapSection } from "@/components/dashboard/sections/HeatmapSection";
import { CommandSection } from "@/components/dashboard/sections/CommandSection";
import { CommunicationDashboardSection } from "@/components/dashboard/sections/CommunicationDashboardSection";
import {
  DealsSectionContainer, JourneysSectionContainer, MarketSectionContainer,
  MatchingSectionContainer, OpportunitiesSectionContainer,
} from "@/components/dashboard/sections/RealContainers";

// Reads live data on the server (Properties strip), so render per-request.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <HeroSection />
      <Suspense fallback={null}><OpportunitiesSectionContainer /></Suspense>
      <Suspense fallback={<PropertiesSkeleton />}>
        <PropertiesSectionContainer />
      </Suspense>
      <HeatmapSection />
      <Suspense fallback={null}><JourneysSectionContainer /></Suspense>
      <Suspense fallback={null}><MatchingSectionContainer /></Suspense>
      <Suspense fallback={null}><DealsSectionContainer /></Suspense>
      <Suspense fallback={null}><MarketSectionContainer /></Suspense>
      <Suspense fallback={null}>
        <CommunicationDashboardSection />
      </Suspense>
      <CommandSection />
    </>
  );
}
