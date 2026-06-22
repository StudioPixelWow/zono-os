/**
 * Client-side document file upload to the `documents` Supabase Storage bucket.
 * Used by the documents screen's "upload" flow. Returns the public URL + path.
 */
import { createClient } from "@/lib/supabase/client";

const BUCKET = "documents";
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function isAllowedDocFile(file: File): boolean {
  return ACCEPT.includes(file.type) || file.size <= MAX_BYTES;
}

export async function uploadDocumentFile(
  file: File,
  orgId: string,
): Promise<{ url: string; path: string; mimeType: string; size: number }> {
  if (file.size > MAX_BYTES) throw new Error("הקובץ גדול מ-25MB");
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: pub.publicUrl, path, mimeType: file.type, size: file.size };
}
