# ZONO — Identity Architecture Decision

## Problem
A person is duplicated across `leads`/`buyers`/`sellers`/`users`, each with own name/phone/email; notes/documents/timeline are multi-FK and fragment per role; a buyer-then-seller = two identities. This blocks complete timelines, safe dedup, reliable matching/reporting, and connected deals.

## Options
- **A — Central persons table.** Canonical `persons` with domain profiles; migrate all reads/writes to it; deprecate legacy identity columns. Cleanest end state; **highest short-term risk** (touches every FK + query at once).
- **B — Additive identity-link layer.** Keep existing tables; add a canonical identity that links current rows. Low risk; but if reads aren't migrated, the fragmentation persists in practice.
- **C — Progressive hybrid (RECOMMENDED).** Create `persons` + `person_roles` + `person_identifiers` ADDITIVELY; add nullable `person_id` back-links on leads/buyers/sellers; backfill via the resolver; migrate reads/writes domain-by-domain behind a flag; deprecate legacy identity columns only after full validation.

## Evaluation
| Criterion | A | B | C |
|---|---|---|---|
| Migration safety | low | high | **high** |
| Code impact (initial) | very high | low | **incremental** |
| Existing FKs preserved | no | yes | **yes** |
| Reporting/timeline convergence | eventually | weak | **domain-by-domain** |
| Rollback | hard | easy | **easy (drop additive)** |
| Duplicate merging | native | bolt-on | **native (person_merge_log)** |
| Extensibility (roles) | good | ok | **good** |
| Performance | good | extra joins | **good (indexed keys)** |

## Decision: **Option C — progressive hybrid.**
Safest architecture, not the least code. Delivered here (additive, NOT applied): migration `20261001120000_persons_identity_additive.sql` (persons/person_identifiers/person_roles/person_merge_log + nullable person_id back-links + RLS). Reads/writes switch behind a flag after backfill + review. **No identity merges are applied until this doc + the migration preview are approved.**

## Person capabilities (delivered in schema)
org ownership, first/last/display name, normalized phones/emails (multi, via person_identifiers), preferred phone/email, consent + timestamp, language, source, campaign, assigned agent, archived state, created/updated metadata, external source ids (source_id identifier kind), merge_status + merged_into + possible_duplicate. Role-specific data stays in domain profiles (buyer requirements, seller motivation, etc.) — NOT one oversized table.

## Identity resolution (delivered + tested)
`src/lib/identity/resolution.ts` (16 tests): normalizes IL phone/email/name/source_id; classifies exact_high / likely / ambiguous / conflicting / distinct; auto-links only single exact_high; conflicting/ambiguous/multi → review; **never merges on name alone; merges reversible + audited** (person_merge_log).
