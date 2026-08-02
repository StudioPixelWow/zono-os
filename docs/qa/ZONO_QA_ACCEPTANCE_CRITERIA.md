# ZONO — QA Acceptance Criteria

Two layers: the **launch-journey acceptance gate** (must all pass for the Property Acquisition Radar to be launch-ready) and **per-issue acceptance** (mirrors the registry).

---

## A. Property Acquisition Radar — launch-journey gate

The journey (market intelligence → opportunity discovery → evidence review → agent action → tracked follow-up) is launch-ready only when a user can:

1. Open Mission Control with **no false offline** messaging. *(P0-2)*
2. See **current market activity** (live feed with dates + source). *(working today — preserve)*
3. Open a **real opportunity** card. *(working — preserve)*
4. Understand **why** it's an opportunity (reasons/flags). *(working — preserve)*
5. See **source attribution** (יד2/Madlan/Komo). *(working — preserve)*
6. Understand the **score and its scale**. *(P1-5)*
7. Review **supporting evidence**. *(working — preserve; verify)*
8. Open the relevant **property/market record**. *(verify)*
9. Take or **approve a next action** (approval-gated). *(working — preserve)*
10. See that action **tracked**. *(verify via timeline/kernel)*
11. Return later and understand **what changed**. *(verify)*
12. Use **filters and counts without contradictions**. *(P1-2)*
13. See **no placeholder, fake, zero-success, or self-matched data**. *(P0-3, P1-5, P1-7)*
14. Complete the journey **without dead ends**. *(P2-1 exposure)*
15. **Trust which information is factual vs inferred**. *(P1-5 fact/estimate/prediction tags)*

Plus a launch-surface rule: **the market map, when presented in the launch journey, must render** or be gracefully replaced — never blank. *(P0-1)*

---

## B. Per-issue acceptance criteria

**P0-1 map** — renders tiles on direct-nav + refresh in production config; provider failure ⇒ visible error state (not blank); no-data ≠ loading ≠ failure; filters update markers; one invalid coordinate doesn't blank the map.

**P0-2 offline** — single transient failure ⇒ not offline; success after failure clears offline; real offline event ⇒ offline; recovery clears the toast; server 5xx while online ⇒ not "offline"; survives route transitions; retry offered where appropriate.

**P0-3 valuation ₪0** — a failed/insufficient valuation is never shown as "הושלם ₪0"; missing value ⇒ "לא חושב"/"—", not ₪0; failed status is distinct from completed; provider/model failure explained; the 3 legacy flagless rows reclassified via reviewed migration; failed valuations excluded from stats/AI; retry available.

**P1-1 location** — canonical `locality_code` resolved for all high-confidence cases; ambiguous list produced and **not** auto-merged; no distinct localities merged on similarity; before/after aggregate diff reviewed; rollback ready; write-path stores canonical id; graph shows one node per real locality.

**P1-2 counters** — every header count uses the same semantic query/predicate as its list; counts reflect active filters and are labeled; loading/empty/error are distinct (no false 0).

**P1-3 prediction** — 0-population ⇒ "insufficient data", never 100% risk; zero denominator never yields a misleading %; population/date-window/confidence/expiry visible; contradictory metrics can't co-appear.

**P1-4 validation** — required city blocks step advance; server-side validation independently rejects missing city.

**P1-5 scores** — every visible score shows name + explicit scale (`X/100`) + short interpretation + factor breakdown + last-updated + fact/estimate/prediction tag; no placeholder shown as production intelligence.

**P1-6 dedup** — the same logical event/action does not repeat across surfaces unless clearly a shared-object view; dedup keys on stable/canonical ids (incl. canonicalized street text), not raw text; operations lane deduped.

**P1-7 self-match** — a system user/owner is never auto-matched as their own buyer/lead; matching excludes the acting agent unless explicitly intended; seed/demo contacts marked + isolated; identity joins use stable ids.

**P2-1 graph exposure** — not-ready modules are hidden / labeled beta / given a useful fallback; no "coming soon" in a paid surface without an explicit product decision; no dead nav links.

**P2-2 territory** — no-data shows an empty-state, not "0%".

**Feature-readiness (Phase 10)** — every reviewed module carries a state (`production/beta/internal/disabled/unavailable-no-data`); broken ≠ available; empty demo shell ≠ completed module; lack-of-data ≠ technical error and vice-versa.
