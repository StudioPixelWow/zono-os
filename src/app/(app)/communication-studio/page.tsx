// ============================================================================
// ✉️ ZONO — Communication Studio route. 30.3.
// Standalone surface for the AI Draft Studio. Approval-gated; nothing is sent.
// ============================================================================
import CommunicationStudio from "@/components/draft-studio/CommunicationStudio";

export const dynamic = "force-dynamic";

export default function CommunicationStudioPage() {
  return <CommunicationStudio />;
}
