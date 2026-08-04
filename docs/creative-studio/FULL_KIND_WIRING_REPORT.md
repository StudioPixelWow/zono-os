# Full Kind Wiring Report

`src/lib/creative-studio/kinds/index.ts` wires `agent_brand`, `office_brand`, `market_stat` additively into the existing pipeline (input schema → validation → Hebrew brief → AdSpec-compatible spec). No parallel path around `quick-creative-service`; property generation is untouched. `AdSpec` was already kind-agnostic, so each kind builds a spec the existing creative director / composition / QA consume.

## agent_brand
Inputs: org, approved Brand Profile, approved agent photo, name, role/specialization, geo focus, phone, CTA, optional office co-brand. Rejects: cross-org agent, missing/unapproved photo (incl. legacy `users.avatar_url`), missing logo, invalid phone, no usable Brand Profile. Immutable facts (name, phone, office) are deterministic.

## office_brand
Inputs: office, approved logo, approved colors, office name, branch/geo, contact, optional team visual, CTA. Rejects: missing logo/colors/contact.

## market_stat
Requires full evidence (source, source reference, geography, period, freshness, metric, value, comparison, factual/inferred) via `validateMarketStat` + a freshness policy. Rejects incomplete/stale evidence. **The brief explicitly states the statistic is fixed source data that may not be altered or invented.**

## Tests
`kinds/kinds.qa.ts` — **21 assertions pass**: phone validity, spec build per kind, and every rejection path (cross-org, missing/unapproved assets, invalid phone, incomplete/stale market evidence, fixed-source-data brief).

Remaining: live wiring into `quick-creative-service`'s persistence path is via the orchestration `CreativeContentService` (usage/lineage persist there); direct in-service call-site hookup is the next mechanical step.
