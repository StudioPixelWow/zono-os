# Output Lineage & Version History

`output-lineage.ts`. A refinement/regeneration **never** overwrites an approved or rejected historical output — it creates a new immutable version.

Each derived output stores: `parentOutputId`, `rootOutputId`, `generationRound`, `mode` (initial|regenerate|refine|variation|restore), `refinementReason`, `briefVersion`, `brandVersion`, `provider`, `model`, timestamp (stamped on persist), plus QA result + approval status on the row.

- `buildDerivedLineage(parent, opts)` — round = parent.round+1; root = parent.root ?? parent.id.
- `isImmutableHistory(o)` — true for approved/rejected. `buildDerivedLineage(..., overwriteInPlace:true)` on immutable history **throws** `LineageError`.
- `buildRestoreLineage` — restores an earlier version as a NEW version.
- `orderVersions` — stable oldest→newest.

Persisted against `zono_quick_creative_outputs` (existing columns: `generation_round`, `creative_selection_metadata`, `image_url`, statuses). Unit-tested for round math, root propagation, immutability guard, restore, ordering.
