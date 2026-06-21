"use server";
/** Recompute Center server actions — manager-gated in the service. */
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit/service";
import { recomputeAllEngines, recomputeEngine, recomputeWithDependencies } from "./service";

export async function recomputeEngineAction(key: string) {
  const r = await recomputeEngine(key);
  await logAudit({ action: "engine.recompute", category: "system", entityType: "engine", summary: `חישוב מחדש: ${key}`, metadata: { key, ok: r.ok, rows: r.rows } });
  revalidatePath("/admin/system-health");
  return r;
}

export async function recomputeWithDepsAction(key: string) {
  const r = await recomputeWithDependencies(key);
  await logAudit({ action: "engine.recompute_deps", category: "system", entityType: "engine", summary: `חישוב מחדש + תלויות: ${key}`, metadata: { key, count: r.length } });
  revalidatePath("/admin/system-health");
  return r;
}

export async function recomputeAllEnginesAction() {
  const r = await recomputeAllEngines();
  await logAudit({ action: "engine.recompute_all", category: "system", summary: `חישוב מחדש של כל המנועים (${r.length})`, metadata: { count: r.length } });
  revalidatePath("/admin/system-health");
  return r;
}
