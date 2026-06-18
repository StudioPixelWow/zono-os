/**
 * Client-side property media helpers — real Supabase Storage uploads to the
 * `property-media` bucket + rows in property_media (RLS-scoped insert/update).
 * Used by the wizard's MediaUploader (client component).
 */
import { createClient } from "@/lib/supabase/client";
import type { Database, MediaType } from "@/lib/supabase/types";

export type MediaRow = Database["public"]["Tables"]["property_media"]["Row"];

const BUCKET = "property-media";

export async function uploadPropertyImage(
  file: File,
  opts: { orgId: string; propertyId: string; sortOrder: number; isPrimary: boolean },
): Promise<MediaRow> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${opts.orgId}/${opts.propertyId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { data, error } = await supabase
    .from("property_media")
    .insert({
      org_id: opts.orgId,
      property_id: opts.propertyId,
      type: "image",
      url: pub.publicUrl,
      storage_path: path,
      mime_type: file.type,
      file_size: file.size,
      sort_order: opts.sortOrder,
      is_primary: opts.isPrimary,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function addExternalMedia(opts: {
  orgId: string;
  propertyId: string;
  type: MediaType;
  externalUrl: string;
  sortOrder: number;
}): Promise<MediaRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("property_media")
    .insert({
      org_id: opts.orgId,
      property_id: opts.propertyId,
      type: opts.type,
      url: opts.externalUrl,
      external_url: opts.externalUrl,
      sort_order: opts.sortOrder,
      is_primary: false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePropertyMedia(row: MediaRow): Promise<void> {
  const supabase = createClient();
  if (row.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }
  const { error } = await supabase.from("property_media").delete().eq("id", row.id);
  if (error) throw new Error(error.message);
}

export async function setPrimaryMedia(
  propertyId: string,
  mediaId: string,
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("property_media")
    .update({ is_primary: false })
    .eq("property_id", propertyId);
  await supabase.from("property_media").update({ is_primary: true }).eq("id", mediaId);
}

export async function persistMediaOrder(
  items: { id: string; sort_order: number }[],
): Promise<void> {
  const supabase = createClient();
  for (const it of items) {
    await supabase
      .from("property_media")
      .update({ sort_order: it.sort_order })
      .eq("id", it.id);
  }
}

export async function updateAltText(id: string, alt: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("property_media").update({ alt_text: alt }).eq("id", id);
}
