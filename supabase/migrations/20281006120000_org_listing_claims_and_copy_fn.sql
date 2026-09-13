-- ── Broker listing-claim: state + efficient atomic copy ──────────────────────
-- A brand-new office whose broker already has observed listings in the shared
-- market graph can CLAIM them on first login (popup → confirm) and have them
-- assigned into its own org permanently — independent of any live scrape.

CREATE TABLE IF NOT EXISTS public.org_listing_claims (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision text NOT NULL DEFAULT 'pending',   -- pending | claimed | dismissed
  broker_name text,
  claimed_count integer NOT NULL DEFAULT 0,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_listing_claims ENABLE ROW LEVEL SECURITY;

-- Members read their own org's claim row; writes go through the service role.
DROP POLICY IF EXISTS org_listing_claims_read ON public.org_listing_claims;
CREATE POLICY org_listing_claims_read ON public.org_listing_claims
  FOR SELECT USING (org_id = public.current_org_id());

-- Copy a specific set of observed listings into an org as its own inventory.
-- Idempotent (ON CONFLICT on the org's natural key). Org-specific FKs are reset.
CREATE OR REPLACE FUNCTION public.copy_external_listings_to_org(p_org uuid, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer;
BEGIN
  IF p_org IS NULL OR p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  WITH src AS (
    SELECT * FROM public.external_listings
    WHERE id = ANY(p_ids) AND org_id <> p_org AND status IS DISTINCT FROM 'removed'
  ), ins AS (
    INSERT INTO public.external_listings (
      id, org_id, source, source_id, external_id, title, city, neighborhood, street,
      street_number, address, property_type, deal_type, price, rooms, bathrooms, balconies,
      floor, total_floors, sqm, area_sqm, lot_size, parking, storage, elevator, accessibility,
      secure_room, condition, description, images, floorplan_images, contact_name, contact_phone,
      contact_type, has_agent, listing_url, published_at, first_seen_at, imported_at, last_synced_at,
      status, lat, lng, formatted_address, geocoded_at, geocode_provider, geocode_confidence,
      geocode_status, detected_broker_name, broker_detection_badge, broker_confidence_score,
      broker_match_status, listing_source_type, created_at, updated_at, metadata
    )
    SELECT
      gen_random_uuid(), p_org, source, source_id, external_id, title, city, neighborhood, street,
      street_number, address, property_type, deal_type, price, rooms, bathrooms, balconies,
      floor, total_floors, sqm, area_sqm, lot_size, parking, storage, elevator, accessibility,
      secure_room, condition, description, images, floorplan_images, contact_name, contact_phone,
      contact_type, has_agent, listing_url, published_at, COALESCE(first_seen_at, now()), now(), now(),
      'active', lat, lng, formatted_address, geocoded_at, geocode_provider, geocode_confidence,
      geocode_status, detected_broker_name, broker_detection_badge, broker_confidence_score,
      broker_match_status, listing_source_type, now(), now(),
      COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('claimed', true, 'claimed_from_org', org_id::text, 'claimed_at', now())
    FROM src
    ON CONFLICT (org_id, source, source_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted FROM ins;
  RETURN COALESCE(inserted, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.copy_external_listings_to_org(uuid, uuid[]) FROM public, anon, authenticated;
