-- ═══════════════════════════════════════════════════════════════════════════
--  GO WATT — post-session photo proof
--
--  From the 4 Aug 2026 meeting: a skippable photo after a charging session,
--  as proof of condition/completion, useful for dispute resolution alongside
--  the existing meter-vs-billed flagged-session review (backend-billing-
--  overrun-fix.sql). A single base64 JPEG column, same convention as
--  support_reports.photo_base64 — no new table needed.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.charging_sessions
  add column if not exists completion_photo_base64 text,
  add column if not exists completion_photo_taken_at timestamptz;
