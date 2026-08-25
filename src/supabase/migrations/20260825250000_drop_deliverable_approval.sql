-- ============================================================================
-- Deliverables no longer require admin approval. Completion is fully automatic:
-- pending -> in_progress -> submitted (all sub-tasks done).
-- - Normalizes any legacy approved/rejected rows
--   (approved -> submitted, rejected -> back to in_progress)
-- - Drops the admin-only approval guard trigger and its function
-- - Drops the now-unused approval columns
-- Run AFTER 20260825210000_defense_subtasks.sql. Idempotent.
-- ============================================================================

UPDATE public.defense_deliverables SET status = 'submitted' WHERE status = 'approved';
UPDATE public.defense_deliverables SET status = 'in_progress' WHERE status = 'rejected';

DROP TRIGGER IF EXISTS trg_enforce_deliverable_approval ON public.defense_deliverables;
DROP FUNCTION IF EXISTS public.enforce_deliverable_approval();

ALTER TABLE public.defense_deliverables DROP COLUMN IF EXISTS approved_by;
ALTER TABLE public.defense_deliverables DROP COLUMN IF EXISTS approved_at;
ALTER TABLE public.defense_deliverables DROP COLUMN IF EXISTS rejection_note;
