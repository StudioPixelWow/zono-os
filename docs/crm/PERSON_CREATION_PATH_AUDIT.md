# ZONO — Person-Creation Path Audit

Every path that creates a lead/buyer/seller/contact/owner/external person MUST pass through the one identity-resolution gate (`src/lib/identity/resolution.ts`). Current state + required change:

| Path | File (evidence) | Today | Required |
|---|---|---|---|
| Manual lead | `leads/actions.ts:25-58` | insert + dedup only at CONVERSION | call gate at capture |
| Manual buyer/seller | `buyers/actions.ts:26`, `sellers` service360 | direct insert | gate |
| Website lead | `office-website/service.ts:196` | direct insert | gate |
| Agent-site lead | `agent-website/service.ts:174` | direct insert | gate |
| Facebook / comment bridge | `distribution/comment-lead-bridge.ts:70` | insert lead | gate |
| **Social lead (BUG)** | `social/service.ts:102-119` | inserts lead **+ buyer/seller twin, no dedup** → duplicates | gate (fixes CRM-P0-004) |
| WhatsApp lead | whatsapp_os path | partial | gate |
| Market-intel conversion | `external-listings/service.ts:1089` | → property only (no person) | gate + create owned lead/seller (CRM-P1-016) |
| Property-owner ingestion | property_sellers link | direct | gate |
| CSV/XLSX import | (new) `import/*` | — | gate per row (delivered: validation + resolver) |
| Automation | journey/orchestrator | proposes | gate when it creates people |
| Referral | lead_source enum only | — | gate |
| Seed data | migrations | — | mark + isolate; gate |

## Required sequence (the gate)
normalize input → search within the current org → identify exact match → identify possible matches → link role to existing person OR create new person → preserve original source record → create timeline event → return canonical identity → **prevent self-match** (actor == person; see matching-intelligence/self-match.ts) → **never cross-tenant link**. Add **idempotency keys** for external ingestion (`source_id`, already a first-class resolver signal → `person_identifiers.kind='source_id'`).

## Delivered
The pure gate (`resolveIdentity`) + normalization + dedup classification (16 tests). Wiring each path to call it is the implementation task (per-path server-action edits) — sequenced after the persons migration is applied on staging, so the gate writes real `person_id` links.
