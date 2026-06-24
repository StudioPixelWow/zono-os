import { listLegalTemplatesAction, listLegalDocumentsAction } from "@/lib/legal/actions";
import type { LegalTemplateRow, LegalDocumentRow } from "@/lib/legal/types";
import { LegalTemplatesView } from "./LegalTemplatesView";

export const dynamic = "force-dynamic";

export default async function LegalTemplatesPage() {
  let templates: LegalTemplateRow[] = [];
  let documents: LegalDocumentRow[] = [];

  try {
    templates = await listLegalTemplatesAction();
  } catch (e) {
    console.error("[legal-templates] templates load failed:", e);
  }
  try {
    documents = await listLegalDocumentsAction();
  } catch (e) {
    console.error("[legal-templates] documents load failed:", e);
  }

  return <LegalTemplatesView templates={templates} documents={documents} />;
}
