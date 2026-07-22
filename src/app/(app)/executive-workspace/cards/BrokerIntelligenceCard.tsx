// 🏛️ Broker Intelligence Summary card — REUSES the canonical queue panel
// (getBrokerIntelligenceQueue) verbatim. No new queue, no new projection: the
// same component /today and the Executive OS consume. Composition, not a copy.
import { BrokerIntelligenceQueuePanel } from "@/components/broker-intelligence/BrokerIntelligenceQueuePanel";

export async function BrokerIntelligenceCard() {
  return (
    <BrokerIntelligenceQueuePanel
      title="מודיעין מתווכים — תמצית"
      subtitle="תור ההמלצות הקנוני, מדורג ומאוחד"
      options={{ limit: 5 }}
    />
  );
}
