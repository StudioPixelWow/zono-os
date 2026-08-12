"use server";
// ============================================================================
// ZONO — PLATFORM ADMIN user-admin server actions (P5.3). "use server": exports
// ONLY async functions. Every action delegates to the audited platform user-admin
// DAL (capability + tenancy + owner-protection + audit live there) and never
// touches a service-role client directly here. Expected validation failures
// surface a safe Hebrew message; anything else (incl. authorization) returns a
// generic denial so the platform surface is never revealed. The invite token is
// returned to the trusted operator for copying but is NEVER logged.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  invitePlatformUser, resendPlatformInvite, setPlatformUserStatus, setPlatformUserRole,
  UserAdminError,
} from "./user-admin";

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UserAdminError) return { ok: false, error: e.message };
  return { ok: false, error: "הפעולה נכשלה או שאין לך הרשאה" };
}

export async function platformInviteUserAction(orgId: string, email: string, fullName: string, roleKey: string): Promise<{ ok: boolean; error?: string; link?: string }> {
  try {
    const r = await invitePlatformUser(orgId, { email, fullName, roleKey });
    revalidatePath(`/platform/customers/${orgId}/users`);
    return { ok: true, link: r.link };
  } catch (e) { return fail(e); }
}

export async function platformResendInviteAction(orgId: string, inviteId: string): Promise<{ ok: boolean; error?: string; link?: string }> {
  try {
    const r = await resendPlatformInvite(orgId, inviteId);
    revalidatePath(`/platform/customers/${orgId}/users`);
    return { ok: true, link: r.link };
  } catch (e) { return fail(e); }
}

export async function platformSetUserStatusAction(orgId: string, userId: string, action: "activate" | "suspend", reason?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await setPlatformUserStatus(orgId, userId, action, reason);
    revalidatePath(`/platform/customers/${orgId}/users`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function platformSetUserRoleAction(orgId: string, userId: string, roleKey: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await setPlatformUserRole(orgId, userId, roleKey, reason);
    revalidatePath(`/platform/customers/${orgId}/users`);
    return { ok: true };
  } catch (e) { return fail(e); }
}
