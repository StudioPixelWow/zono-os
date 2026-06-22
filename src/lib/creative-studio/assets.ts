// ============================================================================
// ZONO — Creative Studio · client-side asset upload helper
// ----------------------------------------------------------------------------
// Mirrors the property-media pattern: real Supabase Storage upload to the
// `zono-marketing-assets` bucket + an RLS-scoped insert into
// zono_marketing_assets. Used by the client upload modal. No AI.
// ============================================================================
import { createClient } from "@/lib/supabase/client";
import { validateUpload } from "./engine";
import type { Database } from "@/lib/supabase/types";

export type ZonoAssetRow = Database["public"]["Tables"]["zono_marketing_assets"]["Row"];
const BUCKET = "zono-marketing-assets";

export interface UploadAssetInput {
  orgId: string;
  entityType: string;
  entityId: string;
  uploadedBy?: string | null;
  assetType: string;
  assetCategory?: string | null;
  title?: string | null;
  description?: string | null;
  tags?: string[];
  flags?: Partial<{
    is_approved_reference: boolean; is_rejected_reference: boolean; is_competitor_reference: boolean;
    is_property_photo: boolean; is_floor_plan: boolean; is_project_render: boolean; is_agent_brand_asset: boolean;
  }>;
}

export async function uploadMarketingAsset(file: File, opts: UploadAssetInput): Promise<ZonoAssetRow> {
  const check = validateUpload({ type: file.type, size: file.size });
  if (!check.ok) throw new Error(check.error ?? "קובץ לא חוקי");

  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  // org-scoped, entity-scoped path so storage never mixes unrelated entities
  const path = `${opts.orgId}/${opts.entityType}/${opts.entityId}/${opts.assetType}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(upErr.message);
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const isImage = file.type.startsWith("image/");
  const { data, error } = await supabase
    .from("zono_marketing_assets")
    .insert({
      org_id: opts.orgId, entity_type: opts.entityType, entity_id: opts.entityId, uploaded_by: opts.uploadedBy ?? null,
      asset_type: opts.assetType, asset_category: opts.assetCategory ?? null, title: opts.title ?? null, description: opts.description ?? null,
      file_url: pub.publicUrl, file_path: path, file_name: file.name, file_mime_type: file.type, file_size: file.size,
      thumbnail_url: isImage ? pub.publicUrl : null, source_type: "manual_upload", status: "active",
      tags: opts.tags ?? [], ...opts.flags,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ZonoAssetRow;
}
