import { getBrokerageCommandCenter, type BrokerageCommandCenter } from "@/lib/brokerage-data/service";
import { BrokerageDataView } from "./BrokerageDataView";

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
      <div dir="rtl" className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
        <h1 className="mb-2 text-2xl font-black text-white">דאטה משרדי תיווך</h1>
        <p>לא ניתן לטעון את הנתונים כעת. נסה שוב מאוחר יותר.</p>
      </div>
    );
  }

  return <BrokerageDataView cc={cc} />;
}
