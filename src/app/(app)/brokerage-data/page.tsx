import { getBrokerageCommandCenter, type BrokerageCommandCenter } from "@/lib/brokerage-data/service";
import { BrokerageDataView } from "./BrokerageDataView";
import { KnowledgeView } from "./KnowledgeView";
import { EvolutionView } from "./EvolutionView";

export const dynamic = "force-dynamic";

export default async function BrokerageDataPage() {
  let cc: BrokerageCommandCenter | null = null;
  try {
    cc = await getBrokerageCommandCenter();
  } catch (e) {
    console.error("[brokerage-data] page load failed:", e);
  }

  if (!cc) {
    return (
      <div dir="rtl" className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#160c2e] to-[#0f0720] p-8 text-center text-white/70">
        <h1 className="mb-2 text-2xl font-black text-white">דאטה משרדי תיווך</h1>
        <p>לא ניתן לטעון את הנתונים כעת. נסה שוב מאוחר יותר.</p>
      </div>
    );
  }

  return (
    // The brokerage views use a dark "intelligence terminal" theme (white text on
    // translucent surfaces). Wrap them in a solid dark canvas so that theme reads
    // correctly on the app's light background (otherwise white-on-light = invisible).
    <div dir="rtl" className="flex flex-col gap-8 rounded-3xl bg-gradient-to-b from-[#160c2e] to-[#0f0720] p-4 sm:p-6">
      <BrokerageDataView cc={cc} />
      <KnowledgeView />
      <EvolutionView />
    </div>
  );
}
