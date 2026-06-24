import { notFound } from "next/navigation";
import { getLegalDocumentAction, getLegalTemplateAction } from "@/lib/legal/actions";
import type { LegalTemplateFull } from "@/lib/legal/types";
import { LegalDocumentView } from "./LegalDocumentView";

export const dynamic = "force-dynamic";

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await getLegalDocumentAction(id);
  if (!view) notFound();

  let template: LegalTemplateFull | null = null;
  if (view.document.template_id) {
    try {
      template = await getLegalTemplateAction(view.document.template_id);
    } catch (e) {
      console.error("[legal-templates] template load failed:", e);
    }
  }

  return <LegalDocumentView view={view} template={template} />;
}
