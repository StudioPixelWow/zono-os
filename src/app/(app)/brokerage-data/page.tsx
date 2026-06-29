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
      <div dir="rtl" className="border-line bg-card rounded-3xl border p-8 text-center text-muted">
        <h1 className="mb-2 text-ink text-2xl font-black">דאטה משרדי תיווך</h1>
        <p>לא ניתן לטעון את הנתונים כעת. נסה שוב מאוחר יותר.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <BrokerageDataView cc={cc} />
      <KnowledgeView />
      <EvolutionView />
    </div>
  );
}
