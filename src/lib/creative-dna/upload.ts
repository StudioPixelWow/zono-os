// ============================================================================
// ZONO — Creative DNA reference-ad client upload (private bucket).
// Uploads a reference ad to the creative-references bucket (RLS-scoped) and
// returns the storage path. Path layout encodes the org id at segment [2] so
// the org-scoped storage policies apply: orgs/{orgId}/creative-dna/{profileId}/…
// ============================================================================
import { createClient } from "@/lib/supabase/client";
import { CREATIVE_REFERENCES_BUCKET, ALLOWED_REFERENCE_MIME } from "./types";

const MAX = 15 * 1024 * 1024;

export async function uploadCreativeReferenceFile(
  file: File, opts: { orgId: string; profileId: string },
): Promise<{ path: string; fileName: string; mimeType: string }> {
  if (!ALLOWED_REFERENCE_MIME.includes(file.type)) throw new Error("סוג קובץ לא נתמך (png/jpg/webp)");
  if (file.size > MAX) throw new Error("הקובץ גדול מדי (מקסימום 15MB)");
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `orgs/${opts.orgId}/creative-dna/${opts.profileId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(CREATIVE_REFERENCES_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  return { path, fileName: file.name, mimeType: file.type };
}
