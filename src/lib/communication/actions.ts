"use server";

import { revalidatePath } from "next/cache";
import {
  completeFollowup, getCommunicationHealth, logCommunication, setCommitmentStatus,
  type CommunicationHealth, type LogCommunicationInput,
} from "./service";

export interface CommActionState {
  error?: string;
  ok?: boolean;
}

function revalidateFor(entityType: string, entityId: string) {
  revalidatePath("/command");
  revalidatePath("/");
  if (entityType === "seller") revalidatePath(`/sellers/${entityId}`);
  else if (entityType === "buyer") revalidatePath(`/buyers/${entityId}`);
  else if (entityType === "property") revalidatePath(`/properties/${entityId}`);
}

export async function logCommunicationAction(input: LogCommunicationInput): Promise<CommActionState> {
  try {
    await logCommunication(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[communication] log failed:", e);
    return { error: `תיעוד התקשורת נכשל: ${msg}` };
  }
  revalidateFor(input.entityType, input.entityId);
  return { ok: true };
}

export async function completeFollowupAction(id: string, entityType: string, entityId: string): Promise<CommActionState> {
  try {
    await completeFollowup(id, entityType, entityId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
  revalidateFor(entityType, entityId);
  return { ok: true };
}

export async function setCommitmentStatusAction(id: string, status: "fulfilled" | "broken", entityType: string, entityId: string): Promise<CommActionState> {
  try {
    await setCommitmentStatus(id, status, entityType, entityId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
  revalidateFor(entityType, entityId);
  return { ok: true };
}

export async function getCommunicationHealthAction(entityType: string, entityId: string): Promise<CommunicationHealth> {
  return getCommunicationHealth(entityType, entityId);
}
