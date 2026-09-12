"use server";
// ZONO — My Office claim actions. Explicit user decisions only (confirm / reject).
// Non-destructive: writes an overlay row in office_self_claims, never the graph.
import { revalidatePath } from "next/cache";
import { confirmSelfOffice, rejectSelfOffice } from "@/lib/office-intel/self-office";

export async function confirmMyOfficeAction(officeId: string) {
  const res = await confirmSelfOffice(officeId, { source: "my-office-ui" });
  revalidatePath("/brokerage-data/my-office");
  return res;
}

export async function rejectMyOfficeAction(officeId: string) {
  const res = await rejectSelfOffice(officeId);
  revalidatePath("/brokerage-data/my-office");
  return res;
}
