-- ============================================================================
-- Buyer Command Center 5.1 — canonical "matches reviewed" timestamp.
-- Powers "חדש מאז הבדיקה האחרונה": a match is NEW when its last_calculated_at is
-- after the buyer's matches_last_reviewed_at (or the buyer was never reviewed).
-- Set by the broker action "סמן התאמות כנבדקו" (or any real review action).
-- Nullable — a buyer never reviewed has all current matches counted as new.
-- ============================================================================
alter table public.buyers
  add column if not exists matches_last_reviewed_at timestamptz;

comment on column public.buyers.matches_last_reviewed_at is
  'When the broker last reviewed this buyer''s auto-matches. Matches with last_calculated_at after this are "new since last review".';
