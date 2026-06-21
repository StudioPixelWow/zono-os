"use server";
/**
 * Operating Areas server actions — thin wrappers over the service, revalidating
 * the settings page (+ transactions, which can consume newly-added cities).
 */
import { revalidatePath } from "next/cache";
import {
  addOperatingArea, disableOperatingArea, enableOperatingArea, setPrimaryOperatingArea,
  syncOperatingArea, updateOperatingArea, type AddAreaOptions,
} from "./service";

function revalidate() {
  revalidatePath("/settings/operating-areas");
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/transactions/coverage");
}

export async function addOperatingAreaAction(localityId: string, opts: AddAreaOptions = {}) {
  const r = await addOperatingArea(localityId, opts);
  revalidate();
  return r;
}

export async function updateOperatingAreaAction(areaId: string, updates: Parameters<typeof updateOperatingArea>[1]) {
  await updateOperatingArea(areaId, updates);
  revalidate();
}

export async function setPrimaryOperatingAreaAction(areaId: string) {
  await setPrimaryOperatingArea(areaId);
  revalidate();
}

export async function disableOperatingAreaAction(areaId: string) {
  await disableOperatingArea(areaId);
  revalidate();
}

export async function enableOperatingAreaAction(areaId: string) {
  await enableOperatingArea(areaId);
  revalidate();
}

export async function syncOperatingAreaAction(areaId: string) {
  const r = await syncOperatingArea(areaId);
  revalidate();
  return r;
}
