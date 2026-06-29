// 🧠 /mission-control — AI Mission Control™ Core (Phase 27.1, presentation only).
// The operating-system shell for AI inside ZONO. Surfaces existing intelligence
// (session context + Action Center feed). No AI responses, no prompts, no
// calculations. Server page fetches existing data and hands it to the client shell.
import { getMissionControl } from "@/lib/mission-control/data";
import { MissionControlView } from "./MissionControlView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function MissionControlPage() {
  const data = await getMissionControl();
  return <MissionControlView data={data} />;
}
