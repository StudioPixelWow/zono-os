# Pagination scope indexes — review before applying

These indexes back the **server-side command boards** built this session
(Properties, People, Buyers, Sellers, Leads, Offers, Deals, Documents). They
are a performance optimization only — **no schema or data change, nothing
destructive, fully reversible** (`drop index`).

## Why
Every board runs a bounded scope fetch shaped like:

```sql
SELECT <cols> FROM <table> WHERE org_id = $1 ORDER BY <timestamp> DESC LIMIT <cap>;
```

RLS already restricts rows to the org, and an `org_id` index exists on each
table — but the `ORDER BY updated_at/created_at DESC` has **no covering index**,
so Postgres sorts the org's whole row set on each page load. The composite
indexes below let one index serve both the org filter and the ordering, so the
`LIMIT` stops early.

## What each index serves
| Index | Table | Query it speeds up |
|---|---|---|
| `buyers_org_updated_idx` | buyers | Buyers board scope fetch (`order updated_at desc`) |
| `sellers_org_updated_idx` | sellers | Sellers board scope fetch (`order updated_at desc`) |
| `leads_org_created_idx` | leads | Leads board scope fetch (`order created_at desc`) |
| `offers_org_updated_idx` | offers | Offers `listOffers` (`order updated_at desc`) |
| `documents_org_updated_idx` | documents | Documents command center (`order updated_at desc`) |
| `deal_profiles_org_status_value_idx` | deal_profiles | Deals board (`where status='active' order deal_value desc`) |

**Properties** is intentionally omitted: its scope fetch has no `ORDER BY`/`LIMIT`
and is already served by the existing `properties(org_id, status)` index.

## Redundancy check (already verified)
None of these duplicate an existing index. The existing single-column
`org_id` indexes and the `(org_id, status)` / `(org_id, temperature)` indexes
stay — they serve other queries. These add only the missing timestamp/sort
dimension.

## How to apply (your call — not applied automatically)
1. Review the `.sql` file.
2. Drop it into `supabase/migrations/` (rename with a fresh timestamp if needed)
   and run your normal migration flow, **or** paste the six `create index`
   statements into the Supabase SQL editor.
3. On very large tables, prefer the `CONCURRENTLY` variants at the bottom of the
   `.sql` — run them **manually, one at a time, outside a transaction**
   (`CREATE INDEX CONCURRENTLY` cannot run inside the migration runner's
   transaction block).

## Rollback
```sql
drop index if exists public.buyers_org_updated_idx;
drop index if exists public.sellers_org_updated_idx;
drop index if exists public.leads_org_created_idx;
drop index if exists public.offers_org_updated_idx;
drop index if exists public.documents_org_updated_idx;
drop index if exists public.deal_profiles_org_status_value_idx;
```

> Deliberately **not** committed into `supabase/migrations/` so nothing runs on
> your next deploy. It applies only when you choose to add and run it.
