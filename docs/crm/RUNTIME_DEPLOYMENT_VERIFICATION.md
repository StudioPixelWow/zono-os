# Runtime Deployment Verification (Phase 6)

Run AFTER the delta is applied (staging first, then production). Each check maps to a shipped feature that is currently broken by the schema gap.

## Schema presence (SQL, read-only)
```sql
select table_name from information_schema.tables
where table_schema='public' and table_name in
('offers','offer_events','commissions','collections','collection_events','note_edits');  -- expect 6
select column_name from information_schema.columns
where table_schema='public' and table_name='notes'
and column_name in ('tags','mentioned_user_ids','is_archived','edited_at','edit_count'); -- expect 5
select public from storage.buckets where id='documents';  -- expect false
```

## Feature routes (app on staging, authenticated)
| Feature | Route | Passes when |
|---|---|---|
| Offers | /offers | list loads; create draft → submit → counter → accept persists; offer_events trail grows |
| Commissions | /commissions | create commission on a deal; approve; record partial collection; reverse |
| Collections | /commissions | payment status derives (pending/partial/paid/overdue) |
| Notes enrichment | /notes + entity panels | tag/pin/archive/edit-history work (columns present) |
| Deal detail | /deals/[id] | offers+commissions+documents+timeline render (no SQL error) |
| Person workspace | /people, /people/[type]/[id] | unified identity + merged timeline load |
| Today queue | /today | work-queue reads offers/commissions/collections without error |
| Matches board | /matches | board + bulk stage-set apply |
| Viewings | /viewings | buckets load; complete+feedback persists |
| Bulk actions | /leads | multi-select bulk op returns per-row results |
| Documents | /documents | upload → signed private URL opens; cross-org denied; anon denied |

## Pass condition
Zero "relation/column does not exist" errors in server logs across the above. Until then these features 500 on the live DB.
