import { JourneyBuilder } from "@/components/journey-automation/JourneyBuilder";
import { IntelligenceErrorBoundary } from "@/components/intelligence/IntelligenceErrorBoundary";

export const dynamic = "force-dynamic";

export default function JourneyBuilderRoute() {
  return <IntelligenceErrorBoundary title="בונה המסעות נכשל בטעינה"><JourneyBuilder /></IntelligenceErrorBoundary>;
}
