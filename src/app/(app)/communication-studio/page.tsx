// ============================================================================
// ✉️ ZONO — Communication Studio route. 30.3.
// Standalone surface for the AI Draft Studio. Approval-gated; nothing is sent.
// ============================================================================
import { Suspense } from "react";
import CommunicationStudio from "@/components/draft-studio/CommunicationStudio";

export const dynamic = "force-dynamic";

export default function CommunicationStudioPage() {
  return <Suspense fallback={<div className="p-8 text-center text-muted">טוען…</div>}><CommunicationStudio /></Suspense>;
}
