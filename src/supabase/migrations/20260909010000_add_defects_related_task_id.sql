-- ============================================================================
-- FIX MISSING related_task_id ON DEFECTS
-- The live `defects` table was created without `related_task_id`, so EVERY
-- insert (defects AND AI test cases) failed with PGRST204 and rows only ever
-- existed in client memory — deleting one then wiped the whole log.
-- Run this in Supabase SQL Editor (runs as postgres, bypasses RLS).
-- Idempotent: safe to re-run. Mirrors migration 20260905000000 line 33.
-- ============================================================================

ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS related_task_id TEXT DEFAULT '';