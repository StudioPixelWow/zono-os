"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

/** Sign out and return to the login page. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
