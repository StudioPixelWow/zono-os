# ZONO — Location Entity-Resolution Audit

**Purpose:** understand the *current* location data architecture before designing any normalization. This is a data-architecture problem, not a string replace. **No merges are proposed here** — only the factual map + a canonical model + the resolver contract. Concrete mappings and safety are in `location-migration-preview.md`.

Evidence: code (`file:line` / migration filenames) + production DB queries (project `tlrefajhyrqnjtmimaos`, 2026-08-02).

---

## 1. The canonical reference already exists (and is under-used)

`public.israel_localities` — the one true locality table.
- Migration `supabase/migrations/20260618092000_israel_localities.sql:12-28`. Seeded by `scripts/import-israel-localities.ts` (upsert on `locality_code`).
- **DB fact:** 1306 rows; 1302 have `name_en`.
- Canonical key: **`locality_code`** (CBS "סמל_ישוב"), plus surrogate `id uuid`.
- **DB fact (decisive):** for Kiryat Bialik the canonical row is
  `locality_code=9500, name_he="קרית ביאליק" (one yud), name_en="QIRYAT BIALIK" (upper, Q-transliteration)`.
  Also `2300 קרית טבעון / QIRYAT TIV'ON`, `8200 קרית מוצקין / QIRYAT MOTZKIN`.

**Implication:** the canonical Hebrew is the **one-yud** form and the canonical English is an **uppercase "QIRYAT…" transliteration**. So the observed variants do **not** exact-match the canonical:
- `"קריית ביאליק"` (two-yud) ≠ canonical `"קרית ביאליק"` → needs yud-normalization.
- `"Kiryat Bialik"` (mixed-case, K-transliteration) ≠ canonical `"QIRYAT BIALIK"` → needs a case-fold + transliteration alias.

Other reference tables: `israel_neighborhoods` (has `normalized_name` + `aliases jsonb` — the only existing alias facility, per-neighborhood) and a separate `neighborhoods` enrichment table.

---

## 2. How each surface stores location (free-text dominates)

| Surface | Column | Storage | FK to canonical? |
|---|---|---|---|
| Properties | `properties.city` (+ `location jsonb`, `region`) | **free-text** | none |
| External/marketplace listings | `external_listings.city` (+ dead `locality_id uuid`) | **free-text** | `locality_id` has no FK and is never set |
| Valuations | `property_valuations.city` | **free-text** | none |
| Territory aggregates | `territory_profiles.city_name`, `street_/building_...city_name`, `territory_key` | **free-text** | none (group key = bare `c.trim()`) |
| Sellers | `sellers.city` + `sellers.locality_id` | mixed | `locality_id` no FK |
| Transactions | `property_transactions.city_name` + `locality_id` | mixed | `locality_id` **has** FK; dedup key still text |
| Operating localities | `*_operating_localities.locality_id` | **FK** | **yes** (the clean surface) + denormalized `city_name` copy |
| Buyer demand / buyers | `buyer_geo_profiles.preferred_cities text[]`, `buyers.preferred_areas text[]` | free-text arrays | none |

**DB fact (fragmentation, prod):**
```
external_listings.city  "Kiryat Bialik" (EN)   = 1335      "Kiryat Motzkin" (EN) = 101
properties.city         "קרית ביאליק" (HE)     = 5         "קרית מוצקין" = 3, "קרית טבעון" = 1
property_valuations.city "קרית ביאליק" = 6   AND  "קריית ביאליק" = 2      (same table, two spellings)
```
The two highest-volume tables hold the **same city in different languages** (1,335 English listings vs 5 Hebrew properties) → they never join. Within valuations, one-yud vs two-yud already splits the same place.

---

## 3. Existing canonicalization (scoped, insufficient)

- `canonicalCityName()` (`src/lib/transactions/providers.ts:47-52`) → `cityKey()` unifies `קרית →קריית` and snaps to an **80-entry** GovMap-actor enum. **Scope: transactions layer only.** Does **not** handle Hebrew↔English, typos beyond the yud case, or the other ~1,226 localities, and never consults `israel_localities`.
- Territory aggregation does **not** canonicalize (`territory/service.ts:31` `c.trim()`).
- Property/listing/valuation write paths do **not** canonicalize. Even `LocalityPicker` stores `name_he` text, not the id/code (`LocalityPicker.tsx:92`).
- Fragmentation is already self-diagnosed but never fixed (`valuation/diagnostics.ts:99` `CITY_NORMALIZATION_MISMATCH`; `brokerage-pipeline-audit.ts:43` `CITY_NORMALIZATION_FAILURE`, "report only, never merge").
- **No `city_alias` / `locality_alias` / `canonical_city` table exists.**

---

## 4. Geocoding

`src/lib/maps/geocoding.ts` → Google Geocoding (`GOOGLE_MAPS_GEOCODE_API_KEY`) with OSM Nominatim fallback; never invents coords; results stored inline per entity (`20260731120000_geocode_columns.sql`). Because geocoding keys off the free-text city string, a fragmented name geocodes independently instead of resolving to the canonical locality centroid.

---

## 5. Proposed canonical model (design only — not applied)

A resolution layer that maps any location value → the canonical locality, **without destroying the source value**.

**New table `locality_resolution` (or `city_alias`):**
| column | meaning |
|---|---|
| `id` | pk |
| `locality_code` | FK → `israel_localities.locality_code` (canonical identity) |
| `alias_raw` | the exact source string seen (e.g. `"Kiryat Bialik"`, `"קריית ביאליק"`) |
| `alias_normalized` | normalized search form (case-folded, yud-normalized, whitespace-collapsed, diacritics-stripped) |
| `source_provider` | where it came from (yad2/madlan/user/…) |
| `confidence` | 0–1 |
| `resolution_method` | `exact_he` / `yud_normalized` / `en_transliteration` / `manual` / `unresolved` |
| `status` | `resolved` / `needs_review` / `unresolved` |

**Resolver contract (pure, testable):**
- Input: raw city string (+ optional country/context).
- Normalize: trim, collapse whitespace, case-fold, strip quotes/diacritics, **unify קרית↔קריית**, map known EN transliterations (`Kiryat↔QIRYAT`).
- Match order: exact `name_he` → yud-normalized `name_he` → normalized `name_en` (case-insensitive) → alias table → **unresolved** (never guess).
- Output: `{ locality_code | null, method, confidence }`. **Never merges two distinct localities; unknown ⇒ unresolved, queued for review.**

**Principles (from the program spec):** canonical `locality_code` is identity (never the display name); original imported values preserved; alias resolution supported; low-confidence ⇒ manual review; migration preview + rollback before any write; ambiguous mappings listed and **not** auto-merged; write-path stores the canonical id going forward.

**Surfaces ranked by fragmentation exposure:** (1) `properties.city`, (2) `external_listings.city` (highest variance — English + scraped), (3) territory/graph aggregates, (4) `property_valuations.city` + comps, (5) `property_transactions.city_name`, (6) buyer/seller demand arrays.

**Needs a DB query to finalize (not assumed):** full distinct-string inventory per table beyond the pilot area; per-string confidence; how many `*.locality_id` are populated vs NULL. Current DB shows a *small* pilot footprint (2–3 distinct strings per table), so the migration is low-volume today — but the write-path fix is what prevents recurrence at scale.
