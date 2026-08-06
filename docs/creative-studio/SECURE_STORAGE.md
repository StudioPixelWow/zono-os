# Secure Storage (design + migration plan)

**Status: designed, runtime NOT implemented this turn (honest gap).**

Existing storage uses the `generated-zono-visuals` bucket with `getPublicUrl` (public). Target model:

- Asset states: draft, qa_failed, review, approved, scheduled, published, archived.
- draft/internal/rejected/archived → **private**, organization-scoped paths, short-lived **signed** URLs for authorized review only; no arbitrary path signing.
- approved publication assets → promoted to a publication-safe location or served via the publishing subsystem, retaining provenance to the private master.
- Never expose internal prompts, rejected outputs, source property images, or agent assets publicly.

**Migration/compatibility:** keep existing approved/published public assets working; introduce a signed-access compatibility layer; migrate new drafts to private immediately. Cross-organization access tests required.

This requires Supabase Storage bucket policy changes + a signing service and a runtime it can be exercised against — deferred with the runtime gates below. Not marked complete.
