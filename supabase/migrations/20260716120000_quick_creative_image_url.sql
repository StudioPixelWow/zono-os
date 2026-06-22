-- ============================================================================
-- ZONO — Quick Creative final image (Gemini Nano Banana)
-- ----------------------------------------------------------------------------
-- The final deliverable for a quick-creative output is a REAL generated image
-- (Gemini Nano Banana), uploaded to the generated-zono-visuals storage bucket.
-- These columns store the public URL + which provider produced it. org_id/RLS
-- unchanged (columns inherit the table's existing policies).
-- ============================================================================
alter table public.zono_quick_creative_outputs
  add column if not exists image_url       text,
  add column if not exists image_provider  text,
  add column if not exists image_status    text;
