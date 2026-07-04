// ============================================================================
// 🧠 ZONO — Executive Intelligence OS™ page (/executive). PHASE 45.0.
// The CEO brain: one office score, health, briefings, priorities/risks/opps,
// unified timeline, approval center, broker comparison — all CONSUMED from
// existing engines. Nothing recomputed, nothing auto-executed.
// ============================================================================
import { getExecutiveOS } from "@/lib/executive-os/service";
import { ExecutiveOSView } from "./ExecutiveOSView";

export const dynamic = "force-dynamic";

export default async function ExecutivePage() {
  const os = await getExecutiveOS();
  return <ExecutiveOSView os={os} />;
}
