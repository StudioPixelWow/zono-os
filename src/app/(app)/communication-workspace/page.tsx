// ============================================================================
// 💬 ZONO — Communication Workspace page (/communication-workspace). Batch 6.3.
// The first user-facing Communication application. COMPOSITION ONLY over the
// canonical Communication Provider (Batch 6.2) — never a channel adapter, never
// WhatsApp/Calendar/Gmail directly. Selection, filters, channel and search live
// in the URL so the three panels stay server-rendered and stream independently.
// Zero business logic, zero synchronization, zero duplicate inboxes.
// ============================================================================
import { CommunicationWorkspace } from "./CommunicationWorkspace";

export const dynamic = "force-dynamic";

export default async function CommunicationWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; filter?: string; channel?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const params: Record<string, string | undefined> = { c: sp.c, filter: sp.filter, channel: sp.channel, q: sp.q };
  return <CommunicationWorkspace params={params} />;
}
