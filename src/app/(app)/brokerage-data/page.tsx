import { getBrokerageCommandCenter, type BrokerageCommandCenter } from "@/lib/brokerage-data/service";
import { WorkspaceView } from "./WorkspaceView";
import { BrokerageDataView } from "./BrokerageDataView";
import { RegistryView } from "./RegistryView";
import { ResearchView } from "./ResearchView";
import { KnowledgeView } from "./KnowledgeView";
import { EvolutionView } from "./EvolutionView";

export const dynamic = "force-dynamic";
// The resumable broker scan runs as a server action from this page and makes
// outbound search calls; allow up to 60s per chunk where the hosting plan permits.
export const maxDuration = 60;

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
      {/* 🏢 Brokerage Intelligence Workspace™ — office-first operational center. */}
      <WorkspaceView cc={cc} />

      {/* Broker Investigation Workspace™ — per-broker public-source research, reused
          as the investigation surface the workspace links into. */}
      <section id="research-workspace" className="scroll-mt-24">
        <ResearchView />
      </section>

      {/* Advanced / raw intelligence tools — fully reused, kept secondary so the
          primary experience is office-first and never feels like a debug screen. */}
      <details className="border-line bg-card rounded-3xl border p-2">
        <summary className="text-muted cursor-pointer px-3 py-2 text-sm font-black">כלים מתקדמים ונתוני גלם</summary>
        <div className="mt-3 flex flex-col gap-8">
          <BrokerageDataView cc={cc} />
          <RegistryView />
          <KnowledgeView />
          <EvolutionView />
        </div>
      </details>
    </div>
  );
}
