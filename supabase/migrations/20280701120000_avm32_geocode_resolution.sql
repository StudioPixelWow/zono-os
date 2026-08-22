-- AVM 3.2 — GEO DATA FOUNDATION
-- Distinguish coordinate precision so a CITY centroid is never indistinguishable
-- from a ROOFTOP coordinate (§6). The lat/lng + geocode_* columns already exist on
-- both tables; this adds only the resolution marker. Additive + idempotent.
alter table public.properties add column if not exists geocode_resolution text;
alter table public.property_transactions add column if not exists geocode_resolution text;
comment on column public.properties.geocode_resolution is 'ROOFTOP|STREET|NEIGHBORHOOD|CITY|UNRESOLVED — precision of lat/lng; coarse ≠ precise (AVM 3.2)';
comment on column public.property_transactions.geocode_resolution is 'ROOFTOP|STREET|NEIGHBORHOOD|CITY|UNRESOLVED — precision of lat/lng; coarse ≠ precise (AVM 3.2)';
