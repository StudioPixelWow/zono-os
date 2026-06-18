# ZONO — Supabase database

Production-ready Postgres schema for ZONO. All DDL lives in `migrations/`,
applied in lexical (timestamp) order.

## Layout

| Migration | Contents |
| --- | --- |
| `…090000_extensions_and_enums` | `pgcrypto`, `citext`, all 35 enum types |
| `…090100_set_updated_at` | shared `updated_at` trigger function |
| `…090200_core_org_roles_users` | organizations, roles, users |
| `…090300_buyers_sellers` | buyers, sellers |
| `…090400_projects_units_properties` | projects, units, properties |
| `…090500_leads_deals_opps_matching` | leads, deals, opportunities, matching_results |
| `…090600_automations_activities_tasks_notes_meetings` | automations, activities, tasks, notes, meetings |
| `…090700_documents_notifications` | documents, notifications |
| `…090800_rls_policies` | RLS helper functions, policies, grants |

19 tables · 35 enums · 101 foreign keys · 102 indexes · RLS enabled on every table.

## Conventions

- **PK**: `uuid` default `gen_random_uuid()`.
- **Tenancy**: every table carries `org_id`; RLS isolates organizations.
- **Money**: `integer` whole shekels (₪) — never floats.
- **Timestamps**: `created_at`/`updated_at timestamptz`; `updated_at` maintained
  by the shared `set_updated_at()` trigger.
- **Enums**: Postgres enum types mirror the unions in `src/lib/supabase/types.ts`.

## Access model (RLS)

A row is visible to a user iff its `org_id` equals the caller's organization
(`public.current_org_id()`). Writes are gated by role rank
(`owner > admin > manager > agent > viewer`): inserts/updates require `agent`+,
deletes require `manager`+. `notifications` are strictly per-recipient.
The matching engine, ingestion jobs and seeding run under `service_role`
(`BYPASSRLS`).

> Depends on Supabase's `auth.users` table and `auth.uid()` — both provided by
> every Supabase project. `users.id` is a 1:1 FK to `auth.users.id`.

## Apply

```bash
# link once
supabase link --project-ref <project-ref>

# push all migrations
supabase db push

# regenerate the typed client after any schema change
supabase gen types typescript --project-id <project-id> --schema public \
  > src/lib/supabase/types.ts
```

Locally these migrations were verified end-to-end against a real PostgreSQL
instance (all applied cleanly; RLS + policies present on all 19 tables) and the
generated `Database` type compiles under the project's `tsc`.

No seed/mock data is included — this is schema only.
