-- ============================================================================
-- ZONO — Distribution multi-image support (ADDITIVE, backward compatible).
-- A Facebook-group distribution post may carry 1..N ordered images. Until now a
-- post had a single `image_url`. This adds an ordered jsonb array `image_urls`
-- holding the resolved, order-preserved media list. `image_url` is KEPT as the
-- legacy first-image fallback and is NOT dropped or migrated destructively:
--   read rule → if image_urls is non-empty use it, else fall back to [image_url].
--
-- Each element is a resolved media descriptor:
--   { "kind": "property_media"|"creative_output"|"property_primary",
--     "url": "<publishable/derivable url>", "creativeOutputId": <uuid|null>,
--     "creativeVersion": <int|null>, "source": "property"|"studio" }
-- The claim RPC `claim_next_distribution_post` already `returns distribution_posts`
-- (whole row), so it carries this new column automatically — no RPC change.
-- No index needed: media is never a filter/sort key, only a payload.
-- ============================================================================
alter table public.distribution_posts
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

comment on column public.distribution_posts.image_urls is
  'Ordered resolved media list for the post (1..N). Empty array → fall back to legacy image_url. Additive; image_url retained for backward compatibility.';
