# ZONO — Location Migration Preview (DRY-RUN, nothing applied)

This is a **preview only**. No rows have been changed. Per program safety rules: only safe, high-confidence mappings would be applied automatically; ambiguous mappings are listed for manual review and **never auto-merged**; every step is reversible.

Source: production DB `tlrefajhyrqnjtmimaos`, 2026-08-02. Canonical target: `israel_localities.locality_code`.

---

## 1. Total affected records (current pilot footprint)

| Table | Column | Distinct strings | Rows |
|---|---|---|---|
| `external_listings` | `city` | 2 (`Kiryat Bialik`, `Kiryat Motzkin`) | 1436 |
| `properties` | `city` | 3 (`קרית ביאליק`, `קרית מוצקין`, `קרית טבעון`) | 9 |
| `property_valuations` | `city` | 3 (`קרית ביאליק`, `קריית ביאליק`, `קרית טבעון`) | 9 |

The footprint is small today (pilot data), which makes this a **safe first migration**. The lasting value is the write-path change that prevents re-fragmentation at scale.

---

## 2. Proposed mappings

| Source string | Table(s) | → `locality_code` | Canonical `name_he` | Method | Confidence | Action |
|---|---|---|---|---|---|---|
| `קרית ביאליק` | properties, valuations | **9500** | קרית ביאליק | `exact_he` | 1.00 | **auto (safe)** |
| `קרית מוצקין` | properties | **8200** | קרית מוצקין | `exact_he` | 1.00 | **auto (safe)** |
| `קרית טבעון` | properties, valuations | **2300** | קרית טבעון | `exact_he` | 1.00 | **auto (safe)** |
| `קריית ביאליק` | valuations (2 rows) | **9500** | קרית ביאליק | `yud_normalized` (קריית→קרית) | 0.98 | **auto (safe)** |
| `Kiryat Bialik` | external_listings (1335) | **9500** | קרית ביאליק | `en_transliteration` (Kiryat→QIRYAT, canonical `name_en="QIRYAT BIALIK"`) | 0.95 | **review then apply** |
| `Kiryat Motzkin` | external_listings (101) | **8200** | קרית מוצקין | `en_transliteration` | 0.95 | **review then apply** |

**Why the English rows are "review then apply", not blind-auto:** the canonical `name_en` is an uppercase Q-transliteration (`QIRYAT BIALIK`), so the mapping relies on a transliteration alias rule (`Kiryat`↔`QIRYAT`), not an exact match. With the full second token (`Bialik`, `Motzkin`) the target is unambiguous, so confidence is high — but the *rule* should be validated on the full distinct-string inventory before running, because `Kiryat`/`Qiryat` is a shared prefix across many localities (Kiryat Yam, Kiryat Ata, Kiryat Gat…). One-token or prefix-only strings must **not** auto-resolve.

---

## 3. Ambiguous mappings (manual review — NOT applied)

None in the current pilot footprint (every string resolves to exactly one locality with the full second token present). **Rule for the general case:** any source string that (a) matches >1 canonical locality, (b) is a bare prefix (`קרית`, `Kiryat`), or (c) has normalized-match confidence < 0.90 → `needs_review`, listed, never auto-merged.

## 4. Possible false merges to guard against

- Prefix collision: `קרית` / `Kiryat` alone must never collapse into any single `Kiryat *` locality.
- Distinct same-prefix localities (Bialik vs Motzkin vs Yam vs Ata) must stay separate — the resolver keys on the **full** normalized name, not the prefix.
- Neighborhood vs city: a neighborhood string that happens to match a city name must not merge the neighborhood into the city.

## 5. Duplicate groups (would merge after resolution)

| Canonical | Currently split as | Post-resolution |
|---|---|---|
| 9500 קרית ביאליק | `Kiryat Bialik` (1335 listings) + `קרית ביאליק` (5 props / 6 val) + `קריית ביאליק` (2 val) | one locality |
| 8200 קרית מוצקין | `Kiryat Motzkin` (101) + `קרית מוצקין` (3) | one locality |
| 2300 קרית טבעון | `קרית טבעון` (1 prop / 1 val) | one locality (already single) |

## 6. Aggregate difference (before → after) — to be captured on dry-run

The migration would add a resolved `locality_code` alongside the preserved `city` string (non-destructive). Expected aggregate change: graph/territory/valuation grouping by `locality_code` collapses the language-split nodes (e.g. Kiryat Bialik: 2 nodes → 1). **The before/after aggregate diff must be generated and reviewed on the dry-run before applying** — this doc reserves the slot; numbers are filled from a `SELECT locality_code, count(*)` comparison run in a transaction-rolled-back dry run.

## 7. Rollback strategy

- **Additive, non-destructive:** resolution writes to a **new** `locality_resolution` table + a new nullable `resolved_locality_code` column on affected tables. The original `city` string is never modified or deleted.
- **Rollback = drop the new column/table** (or set `resolved_locality_code = NULL`); all original data is intact.
- Apply inside a transaction; generate the before/after aggregate diff first; require sign-off on the English-transliteration batch before it runs.
- Aggregations switch to `resolved_locality_code` **behind a feature flag**, so display can fall back to the raw string instantly if the diff surprises.

## 8. Execution order (when approved)

1. Create `locality_resolution` + `resolved_locality_code` columns (additive migration).
2. Run resolver in **dry-run** → produce this table's real numbers + aggregate diff.
3. Apply `exact_he` + `yud_normalized` (confidence ≥ 0.98) automatically.
4. Review + apply `en_transliteration` batch.
5. Flip aggregations to `resolved_locality_code` behind a flag; verify graph/territory/valuation.
6. Fix the write-path (`LocalityPicker` stores `locality_code`; importers resolve on ingest) so new data can't re-fragment.

**Nothing in steps 1–6 has been executed.** This document is the reviewed preview the program requires before any migration.
