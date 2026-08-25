-- ============================================================================
-- Feedback: allow authors (and admins) to delete their own entries.
-- UPDATE was already permitted for authors; DELETE was missing entirely.
-- Run AFTER 20260825200000_capstone_features.sql. Idempotent.
-- ============================================================================

GRANT DELETE ON public.feedback TO authenticated;

DO $$ BEGIN
  CREATE POLICY "feedback_delete" ON public.feedback FOR DELETE TO authenticated
    USING (author_id = auth.uid() OR public.is_capstone_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
