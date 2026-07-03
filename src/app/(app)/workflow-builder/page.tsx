// ============================================================================
// 🔁 ZONO — Workflow Builder route. 30.4.
// Standalone surface for the AI Workflow Builder. Approval-gated; nothing runs.
// ============================================================================
import WorkflowBuilder from "@/components/workflow-builder/WorkflowBuilder";

export const dynamic = "force-dynamic";

export default function WorkflowBuilderPage() {
  return <WorkflowBuilder />;
}
