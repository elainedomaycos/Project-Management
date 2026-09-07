-- ============================================================================
-- GLOBAL FINAL-DEFENSE DEADLINE
-- Replaces the per-project `projects.final_defense_date` with ONE shared
-- deadline for all projects, stored in the `settings` table.
--
-- Access:
--   * Readable by every authenticated user via the existing `settings_read`
--     policy (only the `admin_emails` key is hidden from non-admins).
--   * Writable only by admins via the existing `settings_write` policy.
-- No RLS changes needed.
--
-- Run this in Supabase SQL Editor (runs as postgres, bypasses RLS).
-- Idempotent: safe to re-run.
-- ============================================================================

INSERT INTO public.settings (key, value) VALUES
  ('final_defense_date', '""')
ON CONFLICT (key) DO NOTHING;
