-- ============================================================================
-- Patch for 20260825250000: correct trigger name & use CASCADE.
-- Skipped silently if the trigger/function were already removed.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_deliverable_approval ON public.defense_deliverables;
DROP FUNCTION IF EXISTS public.enforce_deliverable_approval() CASCADE;
