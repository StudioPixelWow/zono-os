"use server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit/service";
import {
  exportNeighborhoods, processNextBatch, queueCities, resetEnrichmentQueue,
  type CityInput, type ExportRow,
} from "./service";

export async function queueCitiesAction(rows: CityInput[]) {
  const r = await queueCities(rows);
  await logAudit({ action: "neighborhood_enrichment.upload", category: "system", summary: `הועלו ${r.queued} ערים לתור העשרת שכונות` });
  revalidatePath("/admin/neighborhood-enrichment");
  return r;
}

export async function processNextBatchAction(limit?: number) {
  return processNextBatch(limit);
}

export async function exportNeighborhoodsAction(): Promise<ExportRow[]> {
  return exportNeighborhoods();
}

export async function resetEnrichmentAction() {
  await resetEnrichmentQueue();
  await logAudit({ action: "neighborhood_enrichment.reset", category: "system", summary: "אופס תור העשרת השכונות" });
  revalidatePath("/admin/neighborhood-enrichment");
}
