// ============================================================================
// 💬 ZONO — WhatsApp Unified Inbox page (/whatsapp/inbox). 36.0.
// Grouped inbox + per-conversation intelligence card + merged timeline over the
// EXISTING WhatsApp OS. Read-first; drafting reuses the existing approval gate.
// ============================================================================
import { getUnifiedInbox } from "@/lib/whatsapp/inbox-service";
import { UnifiedInbox } from "@/components/whatsapp/UnifiedInbox";

export const dynamic = "force-dynamic";

export default async function WhatsappInboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const data = await getUnifiedInbox();
  return <UnifiedInbox data={data} initialConversation={c} />;
}
