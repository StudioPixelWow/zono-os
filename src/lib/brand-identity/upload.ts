// ============================================================================
// ZONO — Brand asset client upload (reuses the zono-marketing-assets bucket)
// ----------------------------------------------------------------------------
// Uploads profile images / logos / brand assets to Supabase Storage from the
// client (RLS-scoped), returns the public URL + path. No new bucket needed.
// ============================================================================
import { createClient } from "@/lib/supabase/client";

const BUCKET = "zono-marketing-assets";
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const MAX = 12 * 1024 * 1024;

export async function uploadBrandFile(file: File, opts: { orgId: string; entityType: string; entityId: string; kind: string }): Promise<{ url: string; path: string }> {
  if (!ALLOWED.includes(file.type)) throw new Error("סוג קובץ לא נתמך (png/jpg/webp/svg)");
  if (file.size > MAX) throw new Error("הקובץ גדול מדי (מקסימום 12MB)");
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${opts.orgId}/brand/${opts.entityType}/${opts.entityId}/${opts.kind}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
