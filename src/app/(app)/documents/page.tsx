import { getDocumentsCommandCenter, type DocCommandCenter } from "@/lib/documents/service";
import { DocumentsView } from "./DocumentsView";

export const dynamic = "force-dynamic";

const EMPTY: DocCommandCenter = {
  pendingSignatures: 0, blockedDeals: 0, missingDocuments: 0, expiringSoon: 0,
  documents: [], pending: [], expiring: [], templates: [], isManager: false,
};

export default async function DocumentsPage() {
  let cc: DocCommandCenter = EMPTY;
  try {
    cc = await getDocumentsCommandCenter();
  } catch (e) {
    console.error("[documents] load failed:", e);
  }
  return <DocumentsView cc={cc} />;
}
