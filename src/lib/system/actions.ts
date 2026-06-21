"use server";
/** Recompute Center server actions — manager-gated in the service. */
import { revalidatePath } from "next/cache";
import { recomputeAllEngines, recomputeEngine, recomputeWithDependencies } from "./service";

export async function recomputeEngineAction(key: string) {
  const r = await recomputeEngine(key);
  revalidatePath("/admin/system-health");
  return r;
}

export async function recomputeWithDepsAction(key: string) {
  const r = await recomputeWithDependencies(key);
  revalidatePath("/admin/system-health");
  return r;
}

export async function recomputeAllEnginesAction() {
  const r = await recomputeAllEngines();
  revalidatePath("/admin/system-health");
  return r;
}
