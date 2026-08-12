"use server";
// ============================================================================
// ZONO — PLATFORM ADMIN operator-management actions (P5.9). "use server":
// exports ONLY async functions. Every action delegates to the audited operator
// DAL (capability + super-admin protection + audit live there). Mutates ONLY
// platform_operators — never an organization role, never customer data.
// ============================================================================
import { revalidatePath } from "next/cache";
import { createPlatformOperator, setOperatorRole, setOperatorStatus, AdminUsersError } from "./admin-users";

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof AdminUsersError) return { ok: false, error: e.message };
  return { ok: false, error: "הפעולה נכשלה או שאין לך הרשאה" };
}

export async function operatorCreateAction(targetUserId: string, role: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  try { await createPlatformOperator({ targetUserId, role, reason }); revalidatePath("/platform/security/admin-users"); return { ok: true }; } catch (e) { return fail(e); }
}
export async function operatorRoleChangeAction(userId: string, role: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  try { await setOperatorRole({ userId, role, reason }); revalidatePath("/platform/security/admin-users"); return { ok: true }; } catch (e) { return fail(e); }
}
export async function operatorStatusAction(userId: string, action: "suspend" | "activate", reason: string): Promise<{ ok: boolean; error?: string }> {
  try { await setOperatorStatus({ userId, action, reason }); revalidatePath("/platform/security/admin-users"); return { ok: true }; } catch (e) { return fail(e); }
}
