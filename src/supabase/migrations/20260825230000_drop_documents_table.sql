-- ============================================================================
-- Cleanup: drop the `documents` table (Document Versions feature was removed
-- from the Final Defense page; deliverable links now live on the deliverable).
-- Run AFTER 20260825220000_deliverable_links_auto_status.sql. Idempotent.
-- ============================================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.documents;
EXCEPTION WHEN undefined_object THEN NULL; WHEN OTHERS THEN NULL; END $$;

DROP TABLE IF EXISTS public.documents CASCADE;
