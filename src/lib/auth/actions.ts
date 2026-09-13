"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
  message?: string;
}

/** Sign up with email + password. Stores full_name in user metadata. */
export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const invite = String(formData.get("invite") ?? "").trim();

  if (!email || !password) return { error: "נא למלא אימייל וסיסמה." };
  if (password.length < 6) return { error: "הסיסמה חייבת להכיל לפחות 6 תווים." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return { error: error.message };

  // If email confirmation is disabled, a session exists now. An invited agent
  // goes to the join page to attach to the inviting org; everyone else onboards.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(invite ? `/join/${invite}` : "/onboarding");
  }
  return { message: "נשלח אליך אימייל לאישור החשבון. אנא אשר/י כדי להמשיך." };
}

/** Sign in with email + password. */
export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "נא למלא אימייל וסיסמה." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "אימייל או סיסמה שגויים." };

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Request a password-reset email. Sends a recovery link that lands on
 * /auth/callback (PKCE code-exchange) → /reset-password. Returns a generic
 * message regardless of whether the email exists (enumeration protection).
 */
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "נא להזין אימייל." };

  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? (h.get("host") ? `https://${h.get("host")}` : "");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) console.error("[auth] password reset request failed:", error.message);
  return { message: "אם הכתובת קיימת במערכת, נשלח אליה קישור לאיפוס הסיסמה. בדוק/י את תיבת המייל." };
}

/**
 * Set a new password. Requires the recovery session established by clicking the
 * reset link (exchanged at /auth/callback). On success → dashboard.
 */
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) return { error: "הסיסמה חייבת להכיל לפחות 6 תווים." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "קישור האיפוס אינו תקף או פג תוקף. בקש/י קישור חדש." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Surface the REAL reason instead of a generic "failed" — the update most
    // often fails on Supabase's password policy (leaked/weak/too-short) or
    // "same as old", and hiding it left users stuck retyping the same password.
    console.error("[auth] updatePassword failed:", error.message);
    const m = error.message.toLowerCase();
    if (m.includes("different from the old") || m.includes("should be different")) return { error: "הסיסמה החדשה חייבת להיות שונה מהסיסמה הקודמת." };
    if (m.includes("weak") || m.includes("pwned") || m.includes("leaked") || m.includes("compromis") || m.includes("breach")) return { error: "הסיסמה נפוצה או חלשה מדי ונדחתה. בחר/י סיסמה חזקה וייחודית יותר." };
    if (m.includes("at least") || m.includes("length") || m.includes("characters")) return { error: "הסיסמה קצרה או פשוטה מדי. השתמש/י בלפחות 8 תווים עם אותיות ומספרים." };
    if (m.includes("session") || m.includes("token") || m.includes("expired") || m.includes("aal")) return { error: "פג תוקף קישור האיפוס. בקש/י קישור חדש ונסה/י שוב." };
    return { error: `עדכון הסיסמה נכשל: ${error.message}` };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/** Sign out and return to the login page. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
