"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export async function setNotificationStateAction(itemKey: string, state: "read" | "archived" | "pinned" | "clear") {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return;
  const supabase = await createClient();
  if (state === "clear") {
    await supabase.from("notification_state").delete().eq("user_id", user.id).eq("item_key", itemKey);
  } else {
    await supabase.from("notification_state").upsert(
      { organization_id: profile.org_id, user_id: user.id, item_key: itemKey, state } as never,
      { onConflict: "user_id,item_key" },
    );
  }
  revalidatePath("/notifications");
}

export async function markAllReadAction(itemKeys: string[]) {
  const { user, profile } = await getSessionContext();
  if (!user || !profile || !itemKeys.length) return;
  const supabase = await createClient();
  await supabase.from("notification_state").upsert(
    itemKeys.map((k) => ({ organization_id: profile.org_id, user_id: user.id, item_key: k, state: "read" })) as never,
    { onConflict: "user_id,item_key" },
  );
  revalidatePath("/notifications");
}
