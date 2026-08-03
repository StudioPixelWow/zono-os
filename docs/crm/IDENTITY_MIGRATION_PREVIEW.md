# ZONO — Identity Migration Preview (DRY-RUN, NOT APPLIED)

Additive Option C. No production identity record is dropped, renamed, merged, or rewritten in this phase.

## Steps (each reversible)
1. Apply `20261001120000_persons_identity_additive.sql` on **staging** (additive: new tables + nullable `person_id` columns).
2. **Backfill dry-run:** for each org, load existing buyers+sellers+leads; run `resolveIdentity` to cluster them into candidate persons.
3. Produce a preview: persons to create; clusters (which buyer/seller/lead rows map to one person via phone/email); **ambiguous clusters** (name-only or conflicting) held for manual review; counts before/after.
4. Apply only **exact_high** auto-links; create `person_roles` linking each existing row; set `leads/buyers/sellers.person_id`.
5. Ambiguous/conflicting → `possible_duplicate=true`, `merge_status='under_review'`; surfaced in a review queue; never auto-merged.
6. Switch reads to person-centric behind a flag; validate timeline/notes/search convergence; only then deprecate legacy identity columns.

## Preview outputs required before apply
total affected rows; proposed clusters; ambiguous clusters; possible false merges; duplicate groups; before/after aggregate diff (e.g. distinct persons vs sum of buyer+seller+lead rows); rollback = drop `person_id` columns + persons/person_roles/person_identifiers/person_merge_log.

## Current-data note (from live counts)
buyers 2, sellers 2, leads 0 → the initial backfill is tiny and low-risk (a handful of rows). The value is the **write-path gate** (below) preventing future fragmentation at scale.

## Safety
Additive only; preview before any write; never merge distinct localities/identities on similarity; reversible; run in a transaction; feature-flag the read switch; RLS on all new tables. **Not applied to production.**
