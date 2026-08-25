-- ============================================================================
-- Deliverable links + automatic status from sub-task progress.
-- Status pipeline (member side) is now computed by trigger:
--   0 sub-tasks or none done -> pending
--   some done                -> in_progress
--   all done                 -> submitted   (admin then approves/rejects manually)
-- approved / rejected are never overwritten automatically.
-- Run AFTER 20260825210000_defense_subtasks.sql. Idempotent.
-- ============================================================================

ALTER TABLE public.defense_deliverables
  ADD COLUMN IF NOT EXISTS link_url TEXT NOT NULL DEFAULT '';

-- ----------------------------------------------------------------------------
-- Recompute deliverable status whenever its sub-tasks change.
-- SECURITY DEFINER so members' sub-task edits can update the parent row even
-- though deliverable UPDATE is otherwise leader/admin territory.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_deliverable_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
  total INT;
  done INT;
  new_status TEXT;
BEGIN
  target_id := COALESCE(NEW.deliverable_id, OLD.deliverable_id);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE done)
    INTO total, done
    FROM public.defense_subtasks
   WHERE deliverable_id = target_id;

  new_status := CASE
    WHEN total = 0 OR done = 0 THEN 'pending'
    WHEN done < total THEN 'in_progress'
    ELSE 'submitted'
  END;

  UPDATE public.defense_deliverables
     SET status = new_status
   WHERE id = target_id
     AND status IN ('pending', 'in_progress', 'submitted');

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_deliverable_status ON public.defense_subtasks;
CREATE TRIGGER trg_recompute_deliverable_status
  AFTER INSERT OR UPDATE OF done OR DELETE ON public.defense_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.recompute_deliverable_status();
