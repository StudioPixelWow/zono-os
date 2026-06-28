// ⚡ /action-center — Intelligence Action Center (presentation only).
// Organizes existing intelligence (AI Coach recommendations + opportunity feed +
// offices + events) into actionable work. No new AI, no new business logic.
import { getActionCenter } from "@/lib/intelligence-explorer/action-center";
import { ActionCenterView } from "./ActionCenterView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function ActionCenterPage() {
  const data = await getActionCenter();
  return <ActionCenterView data={data} />;
}
