# Brand-Asset Resolution

`brand-asset-resolver.ts` — one pure resolver, precedence + approval-status gating. Callers load rows; the resolver decides.

**Precedence per field:** approved agent `brand_identity_profiles` → approved office/org `brand_identity_profiles` → approved agent profile fields → legacy org/user fallback (only when no approved asset exists).

**Resolved:** primary/transparent/light/dark logo, profile image, primary/secondary/accent color, phone, WhatsApp, email, office name, agent display name, website, footer text — each with per-field `sources` provenance and `warnings`.

**Status handling:** `draft`, `pending`, `approved`, `rejected`, `archived`. Only approved/ready/active/complete assets are used automatically; rejected/archived/draft/pending rows are ignored. `logo_status` / `profile_image_status` gate the respective assets.

**Guarantee:** `users.avatar_url` is used **only** when no approved brand profile image exists, and then a `warnings` entry records the fallback. Tested for precedence, unapproved-skip, rejected-ignore, and legacy fallback.
