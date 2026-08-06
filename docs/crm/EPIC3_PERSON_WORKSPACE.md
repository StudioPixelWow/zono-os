# Epic 3 — Person Workspace (Part 3)

Route: /people (index), /people/[type]/[id] (workspace). Service: src/lib/people/service.ts.

Model: NO second identity table. A person is resolved at read time by matching normalized phone (else email) across buyers/sellers/leads. One human with multiple roles → one identity.

Header: name, role badges, phone/email, assigned agent. Quick actions: call (tel:), WhatsApp (wa.me via channel link), email (mailto:), create task (canonical tasks action), add note (shared NotesPanel). Roles: links into each role's existing workspace. Timeline: merged activity_events across roles (append-only source). Notes: NotesPanel bound to the primary entity.

Gaps: exact phone/email match only (no fuzzy merge); no person-level reassign/archive; role panels are links, not embedded tabs.
